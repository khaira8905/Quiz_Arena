import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_attune";

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/** A fresh browser profile (no storage) with page errors collected for assertions. */
export async function freshPage(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext({ baseURL: BASE, ...options });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|status of (4|5)\d\d/.test(m.text())) {
      errors.push(m.text());
    }
  });
  return { context, page, errors };
}

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@attune.test`;
}

/** Run a read-only SQL query against the local database (verification only). */
export function sql(query: string): string {
  return execFileSync(
    "docker",
    ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tAc", query],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
}

export function sqlNumber(query: string): number {
  return Number(sql(query) || 0);
}

export const userIdFor = (email: string) =>
  sql(`select id from auth.users where email = '${email.replace(/'/g, "''")}'`);

/** Wait for the newest email to `to` whose link contains `match`, and return that link. */
export async function emailLink(to: string, match: RegExp, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    for (const m of body.messages ?? []) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const text = `${msg.Text ?? ""}\n${msg.HTML ?? ""}`.replace(/&amp;/g, "&");
      const link = text.match(/https?:\/\/[^\s"'<>)\]]+/g)?.find((l) => match.test(l));
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to} with a link matching ${match}`);
}

/** What the app has saved on this device. */
export async function deviceState(page: Page): Promise<{
  ownerId: string | null;
  outbox: unknown[];
  session: {
    id: string;
    events: { type: string; action?: string; feeling?: string }[];
    decisions: unknown[];
    learner: { displayName: string; day: number };
  } | null;
} | null> {
  // Device storage is written ~200ms after a change; read after it has caught up.
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const raw = localStorage.getItem("attune:v1") ?? sessionStorage.getItem("attune:v1");
    return raw ? JSON.parse(raw) : null;
  });
}

/** Wait until this device's data belongs to the account (adopted or restored). */
export async function waitForOwner(page: Page, userId: string, timeoutMs = 20_000) {
  await page.waitForFunction(
    (id) => {
      const raw = localStorage.getItem("attune:v1");
      return raw ? JSON.parse(raw).ownerId === id : false;
    },
    userId,
    { timeout: timeoutMs },
  );
}

export async function syncStatus(page: Page): Promise<string | null> {
  return page.locator("[data-sync-status]").first().getAttribute("data-sync-status");
}

export async function waitForSyncStatus(page: Page, status: string, timeoutMs = 20_000) {
  await page.waitForSelector(`[data-sync-status="${status}"]`, { timeout: timeoutMs });
}

/** The real onboarding, as a learner would click through it. */
export async function checkIn(page: Page, opts: { name?: string; feeling?: string } = {}) {
  await page.goto("/begin");
  const name = page.getByPlaceholder("A first name or nickname");
  await name.waitFor();
  if (opts.name !== undefined) await name.fill(opts.name);
  await page.getByRole("button", { name: /^(Next|Skip)$/ }).click();
  await page.getByRole("button", { name: "Next" }).click(); // what's on your mind
  await page.getByRole("button", { name: "Next" }).click(); // supposed to be doing
  await page.getByRole("button", { name: opts.feeling ?? "Bored", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Actually get it done" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "See what I've picked up" }).click();
  await page.getByRole("button", { name: /Let.s go/ }).click();
  await page.waitForURL("**/session");
  await page.getByRole("group", { name: "Steer the session" }).waitFor();
  await settled(page);
}

/** Device storage is written a moment after each change (debounced); wait for it to catch up. */
export async function settled(page: Page) {
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("attune:v1") ?? sessionStorage.getItem("attune:v1");
    return raw ? JSON.parse(raw).session !== null : false;
  });
  await page.waitForTimeout(350);
}

export async function signUp(page: Page, email: string, password: string, name: string) {
  await page.goto("/signup");
  await page.getByLabel("What should we call you?").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("One more step").waitFor();
}

export async function logIn(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

export async function logOut(page: Page) {
  await page.getByRole("button", { name: /Account menu for/ }).click();
  await page.getByRole("button", { name: /^Log out/ }).click();
  // A first click with unsynced changes asks for confirmation.
  const anyway = page.getByRole("button", { name: "Log out anyway" });
  if (await anyway.isVisible().catch(() => false)) await anyway.click();
  await page.getByRole("link", { name: "Log in" }).first().waitFor();
}

const AXE = createRequire(import.meta.url).resolve("axe-core");

/** Serious and critical axe-core violations on the current page, as readable strings. */
export async function axeSerious(page: Page): Promise<string[]> {
  // Measure the settled page: entrance animations (opacity) would read as low contrast.
  await page.waitForTimeout(300);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (o: unknown) => Promise<{
            violations: { id: string; impact: string; nodes: { target: string[] }[] }[];
          }>;
        };
      }
    ).axe;
    return axe.run({ resultTypes: ["violations"] });
  });
  const path = new URL(page.url()).pathname;
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${path}: ${v.id} (${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")})`,
    );
}
