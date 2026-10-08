import {
  ARENA_THEMES,
  type ArenaTheme,
  DEFAULT_APPEARANCE,
  THEME_TOKENS,
  arenaCssVariables,
} from "@quizarena/shared/appearance";

/**
 * The look of the app outside a live game (admin portal, sign-in, landing, join screen):
 * Black + Orange (night) or White + Blue (day), switched with one day/night control and
 * remembered per browser. A first visit follows the system's light/dark setting. Inside a
 * game the quiz's own arena theme wins (ArenaThemeProvider sets inline tokens on <html>).
 *
 * Built from the same THEME_TOKENS as the arenas, so both themes look identical everywhere.
 */
export const UI_THEME_KEY = "qa:ui-theme";
export const UI_THEMES = ARENA_THEMES;
export type UiTheme = ArenaTheme;

/** One rule per theme, keyed on <html data-ui-theme>. Generated on the server. */
export function uiThemeCss(): string {
  return UI_THEMES.map((theme) => {
    const vars = arenaCssVariables({ ...DEFAULT_APPEARANCE, theme });
    const body = Object.entries(vars)
      .map(([k, v]) => `${k}:${v};`)
      .join("");
    return `html[data-ui-theme="${theme}"]{${body}color-scheme:${THEME_TOKENS[theme].scheme};}`;
  }).join("\n");
}

/**
 * Runs in <head> before first paint, so a White-theme user never sees a black flash.
 * Kept tiny and dependency-free: it is inlined as a string.
 */
export const uiThemeBootScript = `(function(){var d=document.documentElement,c=${JSON.stringify(
  Object.fromEntries(UI_THEMES.map((t) => [t, THEME_TOKENS[t].bg])),
)};try{var t=localStorage.getItem(${JSON.stringify(
  UI_THEME_KEY,
)});if(${JSON.stringify(UI_THEMES)}.indexOf(t)<0)t=matchMedia("(prefers-color-scheme: light)").matches?"WHITE":"BLACK";d.setAttribute("data-ui-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[t]);}catch(e){d.setAttribute("data-ui-theme","BLACK");}})();`;

/** Points the browser's toolbar colour (`<meta name="theme-color">`) at a theme. */
export function syncThemeColor(theme: UiTheme) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_TOKENS[theme].bg);
}

const listeners = new Set<() => void>();

export const uiThemeStore = {
  get(): UiTheme {
    if (typeof document === "undefined") return "BLACK";
    const t = document.documentElement.getAttribute("data-ui-theme");
    return (UI_THEMES as readonly string[]).includes(t ?? "") ? (t as UiTheme) : "BLACK";
  },
  getServer: (): UiTheme => "BLACK",
  /**
   * Switches theme. With `origin` (the day/night button's centre) the new theme is revealed
   * as a circle growing out of the button, over ~650ms (View Transitions); browsers without
   * them crossfade every colour instead. Reduced motion swaps instantly.
   */
  set(theme: UiTheme, origin?: { x: number; y: number }) {
    const html = document.documentElement;
    const apply = () => uiThemeStore.commit(theme);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!origin || reduced) return apply();
    const start = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
      }
    ).startViewTransition;
    if (!start) {
      html.classList.add("theme-crossfade");
      apply();
      setTimeout(() => html.classList.remove("theme-crossfade"), 700);
      return;
    }
    const r = Math.hypot(
      Math.max(origin.x, innerWidth - origin.x),
      Math.max(origin.y, innerHeight - origin.y),
    );
    html.classList.add("theme-reveal");
    const vt = start.call(document, apply);
    vt.ready
      .then(() =>
        html.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${r}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: 680,
            easing: "cubic-bezier(0.65, 0, 0.35, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        ),
      )
      .catch(() => {});
    void vt.finished.finally(() => html.classList.remove("theme-reveal"));
  },
  commit(theme: UiTheme) {
    document.documentElement.setAttribute("data-ui-theme", theme);
    syncThemeColor(theme);
    try {
      localStorage.setItem(UI_THEME_KEY, theme);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    for (const l of listeners) l();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
