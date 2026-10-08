"use client";

import Link from "next/link";
import { Monitor, Moon, Sun, Zap, ZapOff, Sparkle } from "lucide-react";
import type { LearnerModel } from "@attune/engine";
import { useAuth } from "@/lib/auth";
import { useConnectivity, type ModePreference } from "@/lib/connectivity";
import { useSettings, type MotionPref, type ThemePref } from "@/lib/settings";
import { useAttune } from "@/lib/store";
import { Card, cn, Eyebrow } from "./ui";

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string; icon?: typeof Sun }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
            value === o.value ? "border-ink bg-surface-2" : "border-line hover:border-line-strong",
          )}
        >
          {o.icon && <o.icon className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />}
          <span>
            <span className="type-body font-medium text-ink">{o.label}</span>
            {o.hint && <span className="block type-small text-muted">{o.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

const CONSENT: { key: keyof LearnerModel["consent"]; label: string; hint: string }[] = [
  {
    key: "learnFromBehaviour",
    label: "Learn from how I work",
    hint: "Off: Attune adapts only to what you tell it, not to answers or timing.",
  },
  {
    key: "useAiGateway",
    label: "Allow AI rewrites",
    hint: "Sends library text and interest keywords only. Never your name or words.",
  },
  {
    key: "shareWithMentor",
    label: "Share a summary with my mentor",
    hint: "Aggregates only: recovery rate and topics. Never answers, moods or reflections.",
  },
];

export function SettingsView() {
  const { theme, motion, setTheme, setMotion, setModePreference } = useSettings();
  const { preference } = useConnectivity();
  const { status } = useAuth();
  const { session, scenarioId, updateLearner, hydrated } = useAttune();
  const learner = session && !scenarioId ? session.learner : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <Eyebrow>Settings</Eyebrow>
      <h1 className="mt-2 type-h1 text-ink">Make it yours</h1>
      <p className="mt-2 type-body text-ink-2">
        {status === "signed-in"
          ? "Saved to your account, so they follow you to other devices."
          : "Saved on this device."}
      </p>

      <div className="mt-8 grid gap-5">
        <Card>
          <h2 className="type-h3 text-ink">Theme</h2>
          <div className="mt-3">
            <Choice<ThemePref>
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system", label: "System", hint: "Follow this device", icon: Monitor },
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
              ]}
            />
          </div>
        </Card>

        <Card>
          <h2 className="type-h3 text-ink">Motion</h2>
          <p className="mt-1 type-small text-muted">
            Animation explains changes (a new state, a harder activity). Reduce it if movement is
            distracting or uncomfortable.
          </p>
          <div className="mt-3">
            <Choice<MotionPref>
              label="Motion"
              value={motion}
              onChange={setMotion}
              options={[
                { value: "system", label: "System", hint: "Follow this device", icon: Monitor },
                {
                  value: "reduce",
                  label: "Reduced",
                  hint: "Fades only, no movement",
                  icon: ZapOff,
                },
                { value: "full", label: "Full", hint: "All transitions", icon: Zap },
              ]}
            />
          </div>
        </Card>

        <Card>
          <h2 className="type-h3 text-ink">Connection mode</h2>
          <p className="mt-1 type-small text-muted">
            Light and Offline run the same activities, text-first, with no AI calls.
          </p>
          <div className="mt-3">
            <Choice<ModePreference>
              label="Connection mode"
              value={preference}
              onChange={setModePreference}
              options={[
                {
                  value: "auto",
                  label: "Automatic",
                  hint: "From what the device reports",
                  icon: Sparkle,
                },
                { value: "light", label: "Light", hint: "For slow or metered data" },
                {
                  value: "offline",
                  label: "Offline",
                  hint: "Nothing leaves the device until you switch back",
                },
              ]}
            />
          </div>
        </Card>

        <Card>
          <h2 className="type-h3 text-ink">Learning and privacy</h2>
          {!hydrated ? null : learner ? (
            <div className="mt-3 grid gap-2">
              {CONSENT.map((t) => (
                <label
                  key={t.key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:border-line-strong"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--accent)]"
                    checked={learner.consent[t.key]}
                    onChange={(e) =>
                      updateLearner((l) => ({
                        ...l,
                        consent: { ...l.consent, [t.key]: e.target.checked },
                      }))
                    }
                  />
                  <span>
                    <span className="type-body text-ink">{t.label}</span>
                    <span className="block type-small text-muted">{t.hint}</span>
                  </span>
                </label>
              ))}
              <p className="type-small text-muted">
                See everything Attune knows about you on your{" "}
                <Link
                  href="/twin#privacy"
                  className="text-accent underline-offset-4 hover:underline"
                >
                  learner twin
                </Link>
                .
              </p>
            </div>
          ) : (
            <p className="mt-2 type-body text-ink-2">
              These apply to your learner model, which starts with your first check-in.{" "}
              <Link href="/begin" className="text-accent underline-offset-4 hover:underline">
                Start one
              </Link>
              .
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
