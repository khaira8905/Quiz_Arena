"use client";

import { useState } from "react";
import { ChevronDown, History, Telescope } from "lucide-react";
import type { Decision } from "@attune/engine";
import { cn } from "../ui";

/** "Why are you suggesting this?" — always one click away, in plain language. */
export function WhyPanel({ decision }: { decision: Decision }) {
  const [open, setOpen] = useState(false);
  const r = decision.rationale;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[13.5px] font-medium text-accent hover:text-accent-strong"
      >
        Why this?
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="rise mt-3 grid gap-4 rounded-2xl border border-line bg-surface-2/60 p-4 text-[14px] sm:grid-cols-2">
          <div>
            <p className="font-medium text-ink">What I noticed, and why I chose this</p>
            <ul className="mt-2 space-y-1.5 text-ink-2">
              {r.because.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-2" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
            {r.learned && (
              <p className="mt-3 flex gap-2 rounded-xl bg-accent-soft px-3 py-2 text-ink">
                <History className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {r.learned}
              </p>
            )}
          </div>
          <div>
            <p className="font-medium text-ink">What I&apos;ll watch for</p>
            <p className="mt-2 flex gap-2 text-ink-2">
              <Telescope className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              {r.watching}
            </p>
            {r.alternatives.length > 0 && (
              <>
                <p className="mt-4 font-medium text-ink">Also considered</p>
                <ul className="mt-2 space-y-1.5">
                  {r.alternatives.map((a) => (
                    <li key={a.kind} className="text-ink-2">
                      <span className="text-ink">{a.label}</span>{" "}
                      <span className="text-muted">· {a.why}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <p className="text-[12.5px] text-muted sm:col-span-2">
            These are readings of how the session is going, not judgements about you. You can always
            overrule them with the controls below.
          </p>
        </div>
      )}
    </div>
  );
}
