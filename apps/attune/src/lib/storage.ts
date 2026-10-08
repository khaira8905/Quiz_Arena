/**
 * Device storage that never throws. Private windows, blocked site data and previews can make
 * storage unavailable; the app must still work, just without remembering anything.
 */

type Area = "local" | "session";

function area(which: Area): Storage | undefined {
  try {
    return which === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readJson<T>(key: string, which: Area = "local"): T | undefined {
  try {
    const raw = area(which)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown, which: Area = "local"): boolean {
  try {
    area(which)?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  for (const which of ["local", "session"] as const) {
    try {
      area(which)?.removeItem(key);
    } catch {
      // Nothing to clear.
    }
  }
}

export function randomId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
