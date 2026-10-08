import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Landing point for links in auth emails (sign-up confirmation, password reset). Exchanges the
 * one-time code for a session, then sends the learner on to `next`.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"), "/session");
  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin));

  const providerError = url.searchParams.get("error_description");
  if (providerError) return fail(providerError);

  const supabase = await getServerSupabase();
  if (!supabase) return fail("Sign-in isn't configured on this deployment.");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("That link has expired or was already used. Request a new one.");
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail("That link has expired or was already used. Request a new one.");
  } else {
    return fail("That link is incomplete. Request a new one.");
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
