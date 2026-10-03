import {
  ARENA_THEMES,
  type ArenaTheme,
  DEFAULT_APPEARANCE,
  arenaCssVariables,
} from "@quizarena/shared/appearance";

/**
 * The look of the app outside a live game (admin portal, sign-in, landing, join screen):
 * Black, Blue or White, chosen per browser. Inside a game the quiz's own arena theme wins
 * (ArenaThemeProvider sets inline tokens on <html>, which override these).
 *
 * Built from the same THEME_TOKENS as the arenas, so the three themes look identical
 * everywhere.
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
    return `html[data-ui-theme="${theme}"]{${body}color-scheme:${theme === "WHITE" ? "light" : "dark"};}`;
  }).join("\n");
}

/**
 * Runs in <head> before first paint, so a White-theme user never sees a black flash.
 * Kept tiny and dependency-free: it is inlined as a string.
 */
export const uiThemeBootScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  UI_THEME_KEY,
)});if(${JSON.stringify(UI_THEMES)}.indexOf(t)<0)t="BLACK";document.documentElement.setAttribute("data-ui-theme",t);}catch(e){document.documentElement.setAttribute("data-ui-theme","BLACK");}})();`;

const listeners = new Set<() => void>();

export const uiThemeStore = {
  get(): UiTheme {
    if (typeof document === "undefined") return "BLACK";
    const t = document.documentElement.getAttribute("data-ui-theme");
    return (UI_THEMES as readonly string[]).includes(t ?? "") ? (t as UiTheme) : "BLACK";
  },
  getServer: (): UiTheme => "BLACK",
  set(theme: UiTheme) {
    document.documentElement.setAttribute("data-ui-theme", theme);
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
