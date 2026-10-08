import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  checkIn,
  deviceState,
  emailLink,
  freshPage,
  launch,
  logIn,
  logOut,
  signUp,
  sqlNumber,
  uniqueEmail,
  userIdFor,
  waitForOwner,
  waitForSyncStatus,
} from "./helpers";

/**
 * The whole journey, in order, against the real app and database:
 * landing → guest check-in → controls change state → sign up → verify email → the guest session
 * joins the account and syncs to Postgres → progress from the database → log out (device cleared)
 * → protected routes → log in → progress restored.
 */
describe("learner journey", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let errors: string[];
  const email = uniqueEmail("journey");
  const password = "correct-horse-42";
  let userId = "";

  beforeAll(async () => {
    browser = await launch();
    ({ context, page, errors } = await freshPage(browser));
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("lands", async () => {
    await page.goto("/");
    await expect(page.locator("h1").first().textContent()).resolves.toBeTruthy();
    await page.getByRole("link", { name: "Log in" }).first().waitFor();
  });

  it("checks in as a guest and the controls change what happens", async () => {
    await checkIn(page, { name: "Robin", feeling: "Bored" });
    const before = await deviceState(page);
    expect(before?.ownerId).toBeNull();
    const decisions = before!.session!.decisions.length;

    await page.getByRole("button", { name: "I'm bored" }).click();
    await page.getByText("Heard: you're bored").waitFor();
    await page.getByRole("button", { name: "Too easy" }).click();
    await page.getByText("Heard: too easy").waitFor();
    await page.getByRole("button", { name: "Explain differently" }).click();

    await page.waitForTimeout(400);
    const after = await deviceState(page);
    const types = after!.session!.events.map((e) => e.action ?? e.feeling ?? e.type);
    expect(types).toContain("TOO_EASY");
    expect(types).toContain("EXPLAIN_DIFFERENTLY");
    expect(types).toContain("bored");
    // Each control is a hard constraint on the next decision: the engine re-decided.
    expect(after!.session!.decisions.length).toBeGreaterThan(decisions);
  });

  it("survives a refresh mid-session", async () => {
    const before = await deviceState(page);
    await page.reload();
    await page.getByRole("group", { name: "Steer the session" }).waitFor();
    const after = await deviceState(page);
    expect(after!.session!.id).toBe(before!.session!.id);
    expect(after!.session!.events.length).toBe(before!.session!.events.length);
  });

  it("rejects invalid sign-up input with clear messages", async () => {
    await page.goto("/signup");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("Tell us what to call you.").waitFor();
    await page.getByText("Enter your email.").waitFor();
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("That doesn't look like an email address.").waitFor();
    await page.getByText("Use at least 8 characters.").waitFor();
  });

  it("signs up, and can't log in before verifying", async () => {
    await signUp(page, email, password, "Robin");
    userId = userIdFor(email);
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      sqlNumber(
        `select count(*) from public.profiles where id = '${userId}' and display_name = 'Robin'`,
      ),
    ).toBe(1);

    await logIn(page, email, password);
    await page.getByText(/Confirm your email first/).waitFor();
    await page.getByRole("button", { name: "Resend confirmation email" }).isVisible();
  });

  it("verifies the email, and the guest session joins the account and syncs to Postgres", async () => {
    const link = await emailLink(email, /verify/);
    await page.goto(link);
    await page.waitForURL("**/session?welcome=1");
    await page.getByRole("button", { name: /Account menu for/ }).waitFor();
    await waitForOwner(page, userId);
    await waitForSyncStatus(page, "synced", 30_000);

    const state = await deviceState(page);
    expect(state?.ownerId).toBe(userId);
    expect(state?.outbox).toHaveLength(0);
    const local = state!.session!.events.length;
    expect(sqlNumber(`select count(*) from public.events where user_id = '${userId}'`)).toBe(local);
    expect(
      sqlNumber(`select count(*) from public.learner_models where user_id = '${userId}'`),
    ).toBe(1);
    expect(
      sqlNumber(
        `select count(*) from public.feedback where user_id = '${userId}' and value in ('TOO_EASY', 'bored')`,
      ),
    ).toBe(2);
  });

  it("keeps syncing as the learner works", async () => {
    await page.getByRole("button", { name: "Give me a challenge" }).click();
    await page.waitForTimeout(300);
    await waitForSyncStatus(page, "synced", 30_000);
    const local = (await deviceState(page))!.session!.events.length;
    expect(sqlNumber(`select count(*) from public.events where user_id = '${userId}'`)).toBe(local);
  });

  it("shows progress counted from the database", async () => {
    await page.goto("/progress");
    await page.getByText("From your account").waitFor();
    await page.getByText("What you told Attune").waitFor();
    await page.getByRole("cell", { name: "Too easy" }).waitFor();
    await page.getByText("Yesterday", { exact: true }).waitFor();
    await page.getByText("Emerging pattern").waitFor();
  });

  it("edits the profile", async () => {
    await page.goto("/account");
    await page.getByLabel("Name").fill("Robin S");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.getByText("Profile saved.").waitFor();
    expect(
      sqlNumber(
        `select count(*) from public.profiles where id = '${userId}' and display_name = 'Robin S'`,
      ),
    ).toBe(1);
  });

  it("logs out, clears the device, and protects account pages", async () => {
    const sessionId = (await deviceState(page))!.session!.id;
    await logOut(page);
    const state = await deviceState(page);
    expect(state?.ownerId ?? null).toBeNull();
    expect(state?.session ?? null).toBeNull();

    await page.goto("/progress");
    await page.waitForURL("**/login?next=%2Fprogress&reason=signin");
    await page.getByText("Log in to see that page.").waitFor();
    expect(sessionId).toBeTruthy();
  });

  it("rejects a wrong password with a friendly message", async () => {
    await logIn(page, email, "wrong-password-1");
    await page.getByText("That email and password don't match.").waitFor();
  });

  it("logs back in and restores the session and learner model", async () => {
    const eventsBefore = sqlNumber(
      `select count(*) from public.events where user_id = '${userId}'`,
    );
    await logIn(page, email, password, "/progress");
    await page.waitForURL("**/progress");
    await page.getByText("From your account").waitFor();

    await page.goto("/session");
    await page.getByRole("group", { name: "Steer the session" }).waitFor();
    const state = await deviceState(page);
    expect(state?.ownerId).toBe(userId);
    expect(state?.session?.learner.displayName).toBe("Robin S");
    expect(state!.session!.events.length).toBe(eventsBefore);

    // Work done after the restore lands in the same account.
    await page.getByRole("button", { name: "Too difficult" }).click();
    await waitForSyncStatus(page, "synced", 30_000);
    expect(
      sqlNumber(`select count(*) from public.events where user_id = '${userId}'`),
    ).toBeGreaterThan(eventsBefore);
    expect(
      sqlNumber(`select count(*) from public.learning_sessions where user_id = '${userId}'`),
    ).toBe(2);
  });

  it("had no uncaught errors along the way", () => {
    expect(errors).toEqual([]);
  });

  afterAll(async () => {
    await context?.close();
  });
});
