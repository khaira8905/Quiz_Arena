"use client";

import { THEME_TOKENS } from "@quizarena/shared/appearance";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { UI_THEMES, uiThemeStore } from "@/lib/ui-theme";

/** Three swatches: Black, Blue, White. Changes the app's look instantly, remembered per browser. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const current = useSyncExternalStore(
    uiThemeStore.subscribe,
    uiThemeStore.get,
    uiThemeStore.getServer,
  );
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("flex gap-1.5", className)}>
      {UI_THEMES.map((t) => {
        const tokens = THEME_TOKENS[t];
        const on = current === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${tokens.label} theme`}
            title={`${tokens.label} theme`}
            onClick={() => uiThemeStore.set(t)}
            className={cn(
              "relative grid h-8 w-8 place-items-center rounded-full border-2 transition-transform pointer-coarse:h-11 pointer-coarse:w-11",
              on ? "border-accent" : "border-line-strong hover:scale-105",
            )}
          >
            <span
              className="block h-5 w-5 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${tokens.bg} 0 50%, ${tokens.accent} 50% 100%)`,
                boxShadow: `inset 0 0 0 1px ${tokens.lineStrong}`,
              }}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}
