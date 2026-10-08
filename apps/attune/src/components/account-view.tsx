"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, Download, MailWarning, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { deleteAccount, fetchProgress, updateProfile } from "@/lib/cloud";
import { useAttune } from "@/lib/store";
import { validate } from "./auth-forms";
import { Badge, Button, Card, Eyebrow, Field, Notice, Skeleton, Spinner, TextInput } from "./ui";

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Tell us what to call you.")
    .max(40, "Keep it under 40 characters."),
  goal: z.string().trim().max(120, "Keep it under 120 characters."),
  interests: z
    .array(z.string().trim().min(1).max(30, "Each interest: 30 characters or fewer."))
    .max(10, "Up to 10 interests."),
});

function splitInterests(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export function AccountView() {
  const router = useRouter();
  const { status, user, profile, supabase, refreshProfile, resendConfirmation } = useAuth();
  const store = useAttune();
  const { updateLearner, session } = store;

  const [form, setForm] = useState({ displayName: "", goal: "", interests: "" });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form once the profile loads
    setForm({
      displayName: profile.displayName,
      goal: profile.goal ?? "",
      interests: profile.interests.join(", "),
    });
  }, [profile]);

  if (status === "loading" || (status === "signed-in" && !profile)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (status !== "signed-in" || !user || !supabase) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <Notice
          tone="info"
          title="Log in to see your account"
          action={
            <Link
              href="/login?next=/account"
              className="font-medium text-accent underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          }
        />
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, errors } = validate(profileSchema, {
      displayName: form.displayName,
      goal: form.goal,
      interests: splitInterests(form.interests),
    });
    setErrors(errors);
    if (!data) return;
    setSaving(true);
    try {
      await updateProfile(supabase, user.id, { ...data, goal: data.goal || null });
      // The learner model carries the name and interests the engine uses to personalise.
      updateLearner((l) => ({
        ...l,
        displayName: data.displayName,
        interests: data.interests,
        ...(data.goal ? { goal: data.goal } : {}),
      }));
      await refreshProfile();
      toast.success("Profile saved.");
    } catch {
      toast.error("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const progress = await fetchProgress(supabase, user.id);
      const blob = new Blob(
        [
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              account: { email: user.email, profile },
              learnerModel: session?.learner ?? store.savedLearner,
              progress,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attune-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't export right now. Try again when you're online.");
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteAccount(supabase);
      await store.signOut();
      toast.success("Your account and everything in it has been deleted.");
      router.replace("/");
    } catch {
      toast.error("Couldn't delete the account. Nothing was removed; try again.");
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <Eyebrow>Account</Eyebrow>
      <h1 className="mt-2 type-h1 text-ink">{profile?.displayName ?? "Your account"}</h1>

      <div className="mt-8 grid gap-5">
        <Card>
          <h2 className="type-h3 text-ink">Sign-in</h2>
          <dl className="mt-3 grid gap-2 type-body sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Email</dt>
            <dd className="flex flex-wrap items-center gap-2 text-ink">
              {user.email}
              {user.emailConfirmed ? (
                <Badge tone="good">
                  <BadgeCheck className="size-3.5" aria-hidden /> Verified
                </Badge>
              ) : (
                <Badge tone="warn">
                  <MailWarning className="size-3.5" aria-hidden /> Not verified
                </Badge>
              )}
            </dd>
            <dt className="text-muted">Member since</dt>
            <dd className="text-ink">
              {profile
                ? new Date(profile.createdAt).toLocaleDateString([], { dateStyle: "long" })
                : "—"}
            </dd>
            <dt className="text-muted">Password</dt>
            <dd>
              <Link
                href="/forgot-password"
                className="text-accent underline-offset-4 hover:underline"
              >
                Send a reset link
              </Link>
            </dd>
          </dl>
          {!user.emailConfirmed && (
            <Button
              size="sm"
              className="mt-3"
              onClick={async () => {
                const r = await resendConfirmation(user.email);
                if (r.error) toast.error(r.error);
                else toast.success("Verification email sent.");
              }}
            >
              Resend verification email
            </Button>
          )}
        </Card>

        <Card>
          <h2 className="type-h3 text-ink">Profile</h2>
          <p className="mt-1 type-small text-muted">
            Used to personalise examples and hooks. Saved to your account and your learner model.
          </p>
          <form onSubmit={save} noValidate className="mt-4 grid gap-4" aria-label="Profile">
            <Field id="profile-name" label="Name" error={errors.displayName}>
              {(f) => (
                <TextInput
                  {...f}
                  maxLength={40}
                  value={form.displayName}
                  onChange={(e) => setForm((v) => ({ ...v, displayName: e.target.value }))}
                />
              )}
            </Field>
            <Field
              id="profile-goal"
              label="What you're working towards"
              hint="Optional."
              error={errors.goal}
            >
              {(f) => (
                <TextInput
                  {...f}
                  maxLength={120}
                  value={form.goal}
                  onChange={(e) => setForm((v) => ({ ...v, goal: e.target.value }))}
                />
              )}
            </Field>
            <Field
              id="profile-interests"
              label="Interests"
              hint="Comma-separated, up to 10 (e.g. football, music, money)."
              error={errors.interests}
            >
              {(f) => (
                <TextInput
                  {...f}
                  value={form.interests}
                  onChange={(e) => setForm((v) => ({ ...v, interests: e.target.value }))}
                />
              )}
            </Field>
            <div>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? <Spinner /> : <Save className="size-4" />} Save profile
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="type-h3 text-ink">Your data</h2>
          <dl className="mt-3 grid gap-2 type-body sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Sync</dt>
            <dd className="text-ink">
              {store.pending === 0
                ? "Everything is saved"
                : `${store.pending} changes waiting to sync`}
              {store.lastSyncAt
                ? ` · last ${new Date(store.lastSyncAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                : ""}
            </dd>
            <dt className="text-muted">Stored</dt>
            <dd className="text-ink-2">
              Your learner model, sessions, the events behind them and what the database derives
              from them (attempts, progress, feedback). Never your free-text reflections.
            </dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={exportData} disabled={exporting}>
              {exporting ? <Spinner /> : <Download className="size-4" />} Download my data (JSON)
            </Button>
            <Link
              href="/progress"
              className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              See your progress
            </Link>
          </div>
        </Card>

        <Card className="border-danger/40">
          <h2 className="type-h3 text-danger">Delete account</h2>
          <p className="mt-1 type-body text-ink-2">
            Permanently deletes your account, learner model and all history. This can&apos;t be
            undone.
          </p>
          <div className="mt-4 grid gap-3 sm:max-w-sm">
            <Field id="delete-confirm" label='Type "delete" to confirm'>
              {(f) => (
                <TextInput
                  {...f}
                  value={confirmText}
                  autoComplete="off"
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button
                variant="primary"
                className="bg-danger text-white"
                disabled={confirmText.trim().toLowerCase() !== "delete" || deleting}
                onClick={remove}
              >
                {deleting ? <Spinner /> : <Trash2 className="size-4" />} Delete my account
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
