"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, MailCheck, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/supabase/config";
import { BrandMark } from "./shell";
import { Button, Card, Eyebrow, Field, Notice, Spinner, TextInput } from "./ui";

/* ---------------------------------------------------------------------------------------------- */
/* Validation (client side; the server enforces its own rules too)                                 */
/* ---------------------------------------------------------------------------------------------- */

const email = z
  .string()
  .trim()
  .min(1, "Enter your email.")
  .email("That doesn't look like an email address.");
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.");
const displayName = z
  .string()
  .trim()
  .min(1, "Tell us what to call you.")
  .max(40, "Keep it under 40 characters.");

export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.") });
export const signupSchema = z.object({ displayName, email, password });
export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "The passwords don't match.",
  });

type Errors = Partial<Record<string, string>>;

export function validate<T>(schema: z.ZodType<T>, value: unknown): { data?: T; errors: Errors } {
  const r = schema.safeParse(value);
  if (r.success) return { data: r.data, errors: {} };
  const errors: Errors = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return { errors };
}

/* ---------------------------------------------------------------------------------------------- */
/* Frame                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

export function AuthFrame({
  eyebrow,
  title,
  lead,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="mb-6 flex items-center gap-2">
          <BrandMark size={28} />
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
        <h1 className="type-h1 text-ink">{title}</h1>
        {lead && <p className="mt-2 type-body text-ink-2">{lead}</p>}
        <Card className="mt-6">{children}</Card>
        {footer && <div className="mt-5 type-small text-muted">{footer}</div>}
      </motion.div>
    </div>
  );
}

export function Unconfigured() {
  return (
    <Notice tone="info" title="Accounts aren't set up on this deployment">
      Attune works fully without an account: everything stays on this device. To enable sign-in, add
      the Supabase URL and publishable key (see the README).
      <span className="mt-2 block">
        <Link href="/session" className="font-medium text-accent underline underline-offset-4">
          Continue without an account
        </Link>
      </span>
    </Notice>
  );
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  ...field
}: {
  id: string;
  "aria-describedby"?: string;
  invalid: boolean;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <TextInput
        {...field}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-ink"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Log in                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

export function LoginForm() {
  const params = useSearchParams();
  const { status, signIn, resendConfirmation } = useAuth();
  const next = safeNext(params.get("next"), "/session");
  const reason = params.get("reason");
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(params.get("error"));
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, errors } = validate(loginSchema, values);
    setErrors(errors);
    if (!data) return;
    setBusy(true);
    setFormError(null);
    const result = await signIn(data.email, data.password);
    setBusy(false);
    if (result.error) {
      setFormError(result.error);
      setUnconfirmed(/confirm your email/i.test(result.error));
      return;
    }
    // A full navigation, so the server (and its route cache) sees the new session cookie.
    window.location.assign(next);
  };

  const resend = async () => {
    const parsed = email.safeParse(values.email);
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message });
      return;
    }
    const r = await resendConfirmation(parsed.data);
    if (r.error) toast.error(r.error);
    else toast.success("Sent. Check your inbox for the confirmation link.");
  };

  return (
    <AuthFrame
      eyebrow="Log in"
      title="Welcome back"
      lead="Pick up where you left off, on any device."
      footer={
        <>
          New here?{" "}
          <Link
            href={`/signup${next !== "/session" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-medium text-accent underline underline-offset-4"
          >
            Create an account
          </Link>{" "}
          · or{" "}
          <Link href="/session" className="underline-offset-4 hover:text-ink hover:underline">
            continue without one
          </Link>
        </>
      }
    >
      {status === "unconfigured" ? (
        <Unconfigured />
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4" aria-label="Log in">
          {reason === "signin" && (
            <Notice tone="info">
              Log in to see that page. Your progress lives in your account.
            </Notice>
          )}
          {reason === "expired" && (
            <Notice tone="warn">
              Your session expired. Log in again to sync what you did offline.
            </Notice>
          )}
          {formError && (
            <Notice
              tone="danger"
              action={
                unconfirmed ? (
                  <Button size="sm" onClick={resend}>
                    <MailCheck className="size-3.5" /> Resend confirmation email
                  </Button>
                ) : undefined
              }
            >
              {formError}
            </Notice>
          )}
          <Field id="login-email" label="Email" error={errors.email}>
            {(f) => (
              <TextInput
                {...f}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              />
            )}
          </Field>
          <Field id="login-password" label="Password" error={errors.password}>
            {(f) => (
              <PasswordInput
                {...f}
                autoComplete="current-password"
                value={values.password}
                onChange={(password) => setValues((v) => ({ ...v, password }))}
              />
            )}
          </Field>
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/forgot-password"
              className="type-small text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Forgot password?
            </Link>
            <Button type="submit" variant="primary" disabled={busy || status === "loading"}>
              {busy ? <Spinner /> : <ArrowRight className="size-4" />} Log in
            </Button>
          </div>
        </form>
      )}
    </AuthFrame>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Sign up                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export function SignupForm() {
  const { status, signUp, resendConfirmation } = useAuth();
  const [values, setValues] = useState({ displayName: "", email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, errors } = validate(signupSchema, values);
    setErrors(errors);
    if (!data) return;
    setBusy(true);
    setFormError(null);
    const result = await signUp(data.email, data.password, data.displayName);
    setBusy(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    if (result.needsConfirmation) {
      setSentTo(data.email);
      return;
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth changed: drop every cached page
    window.location.assign("/session?welcome=1");
  };

  if (sentTo) {
    return (
      <AuthFrame
        eyebrow="Check your email"
        title="One more step"
        lead={
          <>
            We sent a confirmation link to <strong className="text-ink">{sentTo}</strong>.
          </>
        }
      >
        <div className="grid gap-4" role="status">
          <p className="type-body text-ink-2">
            Open it on this device to finish setting up. Anything you&apos;ve already done here
            joins your account once you&apos;re in.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                const r = await resendConfirmation(sentTo);
                if (r.error) toast.error(r.error);
                else toast.success("Sent again.");
              }}
            >
              <MailCheck className="size-4" /> Resend email
            </Button>
            <Button variant="ghost" onClick={() => setSentTo(null)}>
              Use a different email
            </Button>
          </div>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow="Create an account"
      title="Keep your progress"
      lead="Free. Your learner model and history follow you to any device."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      {status === "unconfigured" ? (
        <Unconfigured />
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4" aria-label="Create an account">
          {formError && <Notice tone="danger">{formError}</Notice>}
          <Field id="signup-name" label="What should we call you?" error={errors.displayName}>
            {(f) => (
              <TextInput
                {...f}
                autoComplete="nickname"
                maxLength={40}
                value={values.displayName}
                onChange={(e) => setValues((v) => ({ ...v, displayName: e.target.value }))}
              />
            )}
          </Field>
          <Field id="signup-email" label="Email" error={errors.email}>
            {(f) => (
              <TextInput
                {...f}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              />
            )}
          </Field>
          <Field
            id="signup-password"
            label="Password"
            hint="At least 8 characters."
            error={errors.password}
          >
            {(f) => (
              <PasswordInput
                {...f}
                autoComplete="new-password"
                value={values.password}
                onChange={(password) => setValues((v) => ({ ...v, password }))}
              />
            )}
          </Field>
          <p className="flex items-start gap-1.5 type-small text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            We store your progress and learner model, never your free-text reflections. You can
            delete everything from your account page.
          </p>
          <Button type="submit" variant="primary" size="lg" disabled={busy || status === "loading"}>
            {busy ? <Spinner /> : <ArrowRight className="size-4" />} Create account
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Password reset                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

export function ForgotForm() {
  const { status, sendPasswordReset } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = email.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setBusy(true);
    setFormError(null);
    const r = await sendPasswordReset(parsed.data);
    setBusy(false);
    if (r.error) setFormError(r.error);
    else setSent(true);
  };

  return (
    <AuthFrame
      eyebrow="Reset password"
      title="Forgot your password?"
      lead="We'll email you a link to choose a new one."
      footer={
        <Link href="/login" className="font-medium text-accent underline underline-offset-4">
          Back to log in
        </Link>
      }
    >
      {status === "unconfigured" ? (
        <Unconfigured />
      ) : sent ? (
        <Notice tone="good" title="Check your email">
          If there&apos;s an account for {value.trim()}, a reset link is on its way. It works once
          and expires after an hour.
        </Notice>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4" aria-label="Reset password">
          {formError && <Notice tone="danger">{formError}</Notice>}
          <Field id="forgot-email" label="Email" error={error}>
            {(f) => (
              <TextInput
                {...f}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner /> : <MailCheck className="size-4" />} Send reset link
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}

export function ResetPasswordForm() {
  const { status, updatePassword } = useAuth();
  const [values, setValues] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, errors } = validate(resetSchema, values);
    setErrors(errors);
    if (!data) return;
    setBusy(true);
    setFormError(null);
    const r = await updatePassword(data.password);
    setBusy(false);
    if (r.error) {
      setFormError(r.error);
      return;
    }
    toast.success("Password changed. You're logged in.");
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth changed: drop every cached page
    window.location.assign("/session");
  };

  return (
    <AuthFrame eyebrow="Reset password" title="Choose a new password">
      {status === "loading" ? (
        <Spinner label="Checking your link…" />
      ) : status === "unconfigured" ? (
        <Unconfigured />
      ) : status === "signed-out" ? (
        <Notice
          tone="warn"
          title="This link has expired or was already used"
          action={
            <Link
              href="/forgot-password"
              className="font-medium text-accent underline underline-offset-4"
            >
              Request a new link
            </Link>
          }
        />
      ) : (
        <form
          onSubmit={submit}
          noValidate
          className="grid gap-4"
          aria-label="Choose a new password"
        >
          {formError && <Notice tone="danger">{formError}</Notice>}
          <Field
            id="reset-password"
            label="New password"
            hint="At least 8 characters."
            error={errors.password}
          >
            {(f) => (
              <PasswordInput
                {...f}
                autoComplete="new-password"
                value={values.password}
                onChange={(password) => setValues((v) => ({ ...v, password }))}
              />
            )}
          </Field>
          <Field id="reset-confirm" label="Type it again" error={errors.confirm}>
            {(f) => (
              <PasswordInput
                {...f}
                autoComplete="new-password"
                value={values.confirm}
                onChange={(confirm) => setValues((v) => ({ ...v, confirm }))}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner /> : <ShieldCheck className="size-4" />} Save new password
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
