import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isProtectedPath,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  supabaseConfigured,
} from "@/lib/supabase/config";

/**
 * Runs before every page request: refreshes the Supabase session cookie and keeps account pages
 * behind sign-in. Without Supabase configured, the app is device-only and nothing is protected.
 */
export async function proxy(request: NextRequest) {
  if (!supabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  let signedIn = false;
  try {
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    // Auth service unreachable: treat as signed out for protected pages; the rest still works.
  }

  const path = request.nextUrl.pathname;
  if (!signedIn && isProtectedPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}&reason=signin`;
    return NextResponse.redirect(url);
  }
  if (signedIn && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/session";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/|sw\\.js|icon\\.svg|manifest\\.webmanifest|media/).*)",
  ],
};
