/**
 * Public Supabase configuration. Only the project URL and the publishable (anon) key ever reach the
 * browser; both are safe to expose because Row Level Security decides what each user can touch.
 * The service-role key is never used by this app.
 *
 * When these are missing, the app runs in device-only mode: everything works, nothing syncs to an
 * account, and the sign-in pages say so instead of failing.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Routes that need an account. Everything else works for guests, on this device. */
export const PROTECTED_PREFIXES = ["/account", "/progress"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only ever redirect to a path on this site, never to another origin. */
export function safeNext(next: string | null | undefined, fallback = "/session"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}
