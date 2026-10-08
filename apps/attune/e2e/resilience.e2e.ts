import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import {
  checkIn,
  deviceState,
  emailLink,
  freshPage,
  launch,
  logIn,
  signUp,
  sqlNumber,
  uniqueEmail,
  userIdFor,
  waitForSyncStatus,
} from "./helpers";

describe("resilience", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("queues offline, shows each connection state, and syncs on reconnect", async () => {
    const { context, page, errors } = await freshPage(browser);
    const email = uniqueEmail("offline");
    const password = "offline-pass-42";
    await signUp(page, email, password, "Kai");
    await page.goto(await emailLink(email, /verify/));
    await page.waitForURL("**/session?welcome=1");
    await checkIn(page, { name: "Kai", feeling: "Curious" });
    await waitForSyncStatus(page, "synced", 30_000);
    const userId = userIdFor(email);
    const before = sqlNumber(`select count(*) from public.events where user_id = '${userId}'`);

    await context.setOffline(true);
    await waitForSyncStatus(page, "offline");
    await page.getByRole("button", { name: "Too easy" }).click();
    await page.getByRole("button", { name: "Explain differently" }).click();
    await page.getByText(/Offline · \d+ saved/).waitFor();
    const queued = (await deviceState(page))!.outbox.length;
    expect(queued).toBeGreaterThan(0);
    expect(sqlNumber(`select count(*) from public.events where user_id = '${userId}'`)).toBe(
      before,
    );

    await context.setOffline(false);
    // Back online: "reconnecting" until the server answers, then it drains the queue.
    await waitForSyncStatus(page, "synced", 30_000);
    expect((await deviceState(page))!.outbox).toHaveLength(0);
    expect(sqlNumber(`select count(*) from public.events where user_id = '${userId}'`)).toBe(
      before + queued,
    );
    expect(errors).toEqual([]);
    await context.close();
  });

  it("shows a failed sync with a working Retry now, and loses nothing", async () => {
    const { context, page } = await freshPage(browser);
    const email = uniqueEmail("fail");
    await signUp(page, email, "failing-pass-42", "Ana");
    await page.goto(await emailLink(email, /verify/));
    await page.waitForURL("**/session?welcome=1");
    await checkIn(page, { name: "Ana", feeling: "Okay" });
    await waitForSyncStatus(page, "synced", 30_000);
    const userId = userIdFor(email);

    // The database rejects writes (simulated outage on the events endpoint).
    await context.route("**/rest/v1/events**", (route) =>
      route.fulfill({ status: 503, body: '{"message":"Service unavailable"}' }),
    );
    await page.getByRole("button", { name: "Too difficult" }).click();
    await waitForSyncStatus(page, "failed", 20_000);
    await page.locator("[data-sync-status]").click();
    await page
      .getByRole("dialog", { name: "Connection and sync" })
      .getByText("Sync failed")
      .first()
      .waitFor();
    expect((await deviceState(page))!.outbox.length).toBeGreaterThan(0);

    await context.unroute("**/rest/v1/events**");
    await page.getByRole("button", { name: "Retry now" }).click();
    await waitForSyncStatus(page, "synced", 20_000);
    const local = (await deviceState(page))!.session!.events.length;
    expect(sqlNumber(`select count(*) from public.events where user_id = '${userId}'`)).toBe(local);
    await context.close();
  });

  it("restores on a second device, and a restore failure is recoverable", async () => {
    const first = await freshPage(browser);
    const email = uniqueEmail("devices");
    const password = "two-devices-42";
    await signUp(first.page, email, password, "Mo");
    await first.page.goto(await emailLink(email, /verify/));
    await first.page.waitForURL("**/session?welcome=1");
    await checkIn(first.page, { name: "Mo", feeling: "Tired" });
    await first.page.getByRole("button", { name: "Too easy" }).click();
    await waitForSyncStatus(first.page, "synced", 30_000);
    await first.context.close();

    const second = await freshPage(browser);
    await second.context.route("**/rest/v1/learner_models**", (route) =>
      route.fulfill({ status: 500, body: "{}" }),
    );
    await logIn(second.page, email, password);
    await second.page.getByText("Couldn't load your progress.").waitFor({ timeout: 20_000 });
    await second.context.unroute("**/rest/v1/learner_models**");
    await second.page.getByRole("button", { name: "Try again" }).click();
    await second.page.goto("/session");
    await second.page
      .getByRole("group", { name: "Steer the session" })
      .waitFor({ timeout: 20_000 });
    const state = await deviceState(second.page);
    expect(state?.session?.learner.displayName).toBe("Mo");
    await second.context.close();
  });

  it("keeps account pages behind sign-in, and 404s unknown routes", async () => {
    const { context, page } = await freshPage(browser);
    for (const path of ["/account", "/progress"]) {
      await page.goto(path);
      await page.waitForURL(`**/login?next=${encodeURIComponent(path)}&reason=signin`);
    }
    const res = await page.goto("/definitely-not-a-page");
    expect(res?.status()).toBe(404);
    await page.getByText("This page wandered off.").waitFor();
    await context.close();
  });

  it("resets a forgotten password by email", async () => {
    const { context, page } = await freshPage(browser);
    const email = uniqueEmail("reset");
    await signUp(page, email, "first-pass-42", "Jo");
    await page.goto(await emailLink(email, /verify/));
    await page.waitForURL("**/session?welcome=1");
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByText("Check your email").waitFor();
    await page.goto(await emailLink(email, /type=recovery/));
    await page.waitForURL("**/reset-password");
    await page.getByLabel("New password", { exact: true }).fill("second-pass-42");
    await page.getByLabel("Type it again", { exact: true }).fill("second-pass-4");
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.getByText("The passwords don't match.").waitFor();
    await page.getByLabel("Type it again", { exact: true }).fill("second-pass-42");
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.waitForURL("**/session");

    await page.context().clearCookies();
    await logIn(page, email, "second-pass-42", "/account");
    await page.waitForURL("**/account");
    await page.getByText("Verified").waitFor();
    await context.close();
  });

  it("remembers the theme across reloads, and has no horizontal scroll on a phone", async () => {
    const { context, page } = await freshPage(browser, { viewport: { width: 375, height: 760 } });
    await page.goto("/");
    await page.waitForLoadState("networkidle"); // hydrated: the toggle is interactive
    await page.getByRole("button", { name: /^Theme: system/ }).click();
    await page.getByRole("button", { name: /^Theme: light/ }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

    for (const path of [
      "/",
      "/login",
      "/signup",
      "/session",
      "/twin",
      "/story",
      "/settings",
      "/educator",
      "/community",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
    await context.close();
  });
});
