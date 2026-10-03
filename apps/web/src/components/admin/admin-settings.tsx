"use client";

import { quizSettingsSchema, type QuizSettings } from "@quizarena/shared/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, HardDrive, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { SettingsPanels } from "@/components/editor/quiz-settings";
import { connectGoogle, useGoogleStatus } from "@/components/media/google-drive";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { api, isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useMe, useMediaConfig, usePreferences, useUpdatePreferences } from "@/lib/queries";
import { ProfileSection } from "./profile-section";

const BASE_DEFAULTS = quizSettingsSchema.parse({});

/** SETTINGS: your account, defaults for new quizzes, and connected services. */
export function AdminSettings() {
  const me = useMe();
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description={
          me.data
            ? `Signed in as ${me.data.email} · member since ${formatDateTime(me.data.createdAt)}`
            : undefined
        }
      />
      <div className="mt-8 flex flex-col gap-10">
        <Section
          title="Defaults for new quizzes"
          description="Every quiz you create starts with these. Each quiz can still change its own; the arena look is set in Customize Arena."
        >
          <QuizDefaults />
        </Section>
        <Section title="Connected services" description="Where question images can come from.">
          <div className="grid gap-4 lg:grid-cols-2">
            <StorageCard />
            <GoogleCard />
          </div>
        </Section>
        <Section title="Profile" description="Your name and password.">
          <div className="max-w-3xl">
            <ProfileSection />
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-h2">{title}</h2>
      <p className="mt-1 max-w-2xl text-body-sm text-fg-3">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function QuizDefaults() {
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  if (prefs.isPending) return <Skeleton className="h-96" />;
  const draft: QuizSettings = { ...BASE_DEFAULTS, ...(prefs.data?.quizDefaults ?? {}) };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SettingsPanels
        draft={draft}
        set={(key, value) =>
          update.mutate(
            { quizDefaults: { [key]: value } },
            {
              onSuccess: () => toast.success("Default saved", { id: "default-saved" }),
              onError: (err) => toast.error(isApiError(err) ? err.message : "Not saved"),
            },
          )
        }
      />
    </div>
  );
}

function StorageCard() {
  const { data } = useMediaConfig();
  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-fg-3" />
        <h3 className="font-semibold">Image uploads</h3>
        {data &&
          (data.enabled ? (
            <span className="label ml-auto flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> On
            </span>
          ) : (
            <span className="label ml-auto flex items-center gap-1 text-warning">
              <XCircle className="h-3.5 w-3.5" /> Off
            </span>
          ))}
      </div>
      <p className="mt-2 text-body-sm text-fg-2">
        {!data
          ? "Checking…"
          : data.enabled
            ? data.driver === "s3"
              ? "Images are stored in object storage and served from its CDN."
              : "Images are stored on the game server's disk (development mode)."
            : data.reason}
      </p>
    </div>
  );
}

function GoogleCard() {
  const qc = useQueryClient();
  const status = useGoogleStatus();
  const s = status.data;
  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">Google Drive</h3>
        {s?.connected && (
          <span className="label ml-auto flex items-center gap-1 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
          </span>
        )}
      </div>
      <p className="mt-2 text-body-sm text-fg-2">
        {!s
          ? "Checking…"
          : !s.configured
            ? "Not set up on this server. An administrator adds GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to the game server (see docs/MEDIA.md)."
            : s.connected
              ? `Picking images from ${s.email}'s Drive (read-only).`
              : "Connect to pick question images from your Drive. QuizArena only asks for read-only access."}
      </p>
      {s?.configured && (
        <div className="mt-4">
          {s.connected ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await api("/google/connection", { method: "DELETE" });
                await qc.invalidateQueries({ queryKey: ["google-status"] });
                toast.success("Google Drive disconnected");
              }}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={async () => {
                if (await connectGoogle()) toast.success("Google Drive connected");
                await qc.invalidateQueries({ queryKey: ["google-status"] });
              }}
            >
              Connect Google Drive
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
