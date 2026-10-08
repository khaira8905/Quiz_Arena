"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";
import { fetchProfile, type Profile } from "./cloud";
import { getBrowserSupabase } from "./supabase/browser";

/**
 * Accounts (Supabase Auth, email + password). Optional: without an account, Attune keeps
 * everything on this device. With one, progress follows the learner to any device.
 */

export type AuthStatus = "unconfigured" | "loading" | "signed-out" | "signed-in";

export interface AccountUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
}

export interface AuthResult {
  error?: string;
}

interface AuthValue {
  status: AuthStatus;
  user: AccountUser | null;
  profile: Profile | null;
  supabase: SupabaseClient | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<AuthResult & { needsConfirmation?: boolean }>;
  signOut: () => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthValue | null>(null);
const TIMEOUT_MS = 15_000;

/** Supabase messages, rewritten for people. */
export function friendlyAuthError(error: Pick<AuthError, "message" | "code"> | Error): string {
  const code = "code" in error ? error.code : undefined;
  const msg = error.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg))
    return "That email and password don't match. Check both and try again.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg))
    return "Confirm your email first. Check your inbox for the link, or send a new one below.";
  if (code === "user_already_exists" || /already registered/i.test(msg))
    return "There's already an account with that email. Try logging in instead.";
  if (code === "weak_password" || /password should be/i.test(msg))
    return "Choose a longer password: at least 8 characters.";
  if (code === "over_email_send_rate_limit" || /rate limit|too many/i.test(msg))
    return "Too many attempts. Wait a minute, then try again.";
  if (code === "same_password") return "That's your current password. Choose a new one.";
  if (/timed out/i.test(msg)) return "The server took too long to answer. Try again.";
  if (/fetch|network|load failed/i.test(msg))
    return "Can't reach the server. Check your connection and try again.";
  return msg || "Something went wrong. Try again.";
}

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Request timed out")), TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function toAccountUser(u: User | null | undefined): AccountUser | null {
  if (!u) return null;
  return { id: u.id, email: u.email ?? "", emailConfirmed: Boolean(u.email_confirmed_at) };
}

function callbackUrl(next: string): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => getBrowserSupabase());
  // Always "loading" for the first render, on the server and the client alike (no hydration
  // mismatch); the effect below resolves it.
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- server render can't know; resolve on mount
      setStatus("unconfigured");
      return;
    }
    let cancelled = false;
    const apply = (u: User | null | undefined) => {
      if (cancelled) return;
      const next = toAccountUser(u);
      setUser((prev) =>
        prev?.id === next?.id && prev?.emailConfirmed === next?.emailConfirmed ? prev : next,
      );
      setStatus(next ? "signed-in" : "signed-out");
    };
    // The local session first (works offline), then the auth server's view when reachable.
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session?.user),
    );
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await withTimeout(fetchProfile(supabase, user.id)));
    } catch {
      // Offline or the server is down: keep whatever we had.
    }
  }, [supabase, user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the signed-in user's profile
    void refreshProfile();
  }, [refreshProfile]);

  const run = useCallback(
    async (fn: () => Promise<{ error: AuthError | null }>): Promise<AuthResult> => {
      try {
        const { error } = await withTimeout(fn());
        return error ? { error: friendlyAuthError(error) } : {};
      } catch (e) {
        return { error: friendlyAuthError(e as Error) };
      }
    },
    [],
  );

  const value = useMemo<AuthValue>(() => {
    const unconfigured = { error: "Accounts aren't set up on this deployment." };
    return {
      status,
      user,
      profile,
      supabase,
      refreshProfile,
      signIn: (email, password) =>
        supabase
          ? run(() => supabase.auth.signInWithPassword({ email: email.trim(), password }))
          : Promise.resolve(unconfigured),
      signUp: async (email, password, displayName) => {
        if (!supabase) return unconfigured;
        try {
          const { data, error } = await withTimeout(
            supabase.auth.signUp({
              email: email.trim(),
              password,
              options: {
                data: { display_name: displayName.trim() || "Learner" },
                emailRedirectTo: callbackUrl("/session?welcome=1"),
              },
            }),
          );
          if (error) return { error: friendlyAuthError(error) };
          // With confirmations on, there's a user but no session until the link is clicked. An
          // existing, confirmed email comes back with no identities (and no email is sent).
          if (data.user && data.user.identities?.length === 0) {
            return { error: "There's already an account with that email. Try logging in instead." };
          }
          return { needsConfirmation: !data.session };
        } catch (e) {
          return { error: friendlyAuthError(e as Error) };
        }
      },
      signOut: async () => {
        if (!supabase) return unconfigured;
        // Local scope: works offline, and only this device signs out.
        const result = await run(() => supabase.auth.signOut({ scope: "local" }));
        setProfile(null);
        return result;
      },
      sendPasswordReset: (email) =>
        supabase
          ? run(() =>
              supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: callbackUrl("/reset-password"),
              }),
            )
          : Promise.resolve(unconfigured),
      updatePassword: (password) =>
        supabase
          ? run(() => supabase.auth.updateUser({ password }))
          : Promise.resolve(unconfigured),
      resendConfirmation: (email) =>
        supabase
          ? run(() =>
              supabase.auth.resend({
                type: "signup",
                email: email.trim(),
                options: { emailRedirectTo: callbackUrl("/session?welcome=1") },
              }),
            )
          : Promise.resolve(unconfigured),
    };
  }, [status, user, profile, supabase, refreshProfile, run]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
