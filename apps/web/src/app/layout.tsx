import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { THEME_TOKENS } from "@quizarena/shared/appearance";
import { Providers } from "@/components/providers";
import { uiThemeBootScript, uiThemeCss } from "@/lib/ui-theme";
import "./globals.css";

/**
 * Display face: Space Grotesk — confident, slightly engineered, with distinctive tabular
 * numerals. Questions, PINs, timers, scores and headlines.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
  display: "swap",
});
/** Interface face: neutral and very legible at small sizes — admin UI, forms, body copy. */
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
/** Mono sibling for labels, codes and data — the technical, scoreboard voice. */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["500", "600"],
  display: "swap",
});

/** CLEAN arena preset only; not preloaded, so only arenas that pick it load it. */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "QuizArena — 100 Players. One Arena.", template: "%s · QuizArena" },
  description:
    "Live multiplayer quizzes for classrooms, campuses and events. Project the arena, players answer from their phones.",
  applicationName: "QuizArena",
};

export const viewport: Viewport = {
  // The browser's toolbar colour. The boot script and the day/night switch keep it in step
  // with the chosen theme; this is the first-paint default (night).
  themeColor: THEME_TOKENS.BLACK.bg,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-ui-theme="BLACK"
      // The boot script may switch the theme attribute before React hydrates.
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${geist.variable} ${geistMono.variable} ${jakarta.variable}`}
    >
      <head>
        {/* Static strings built on the server from the shared theme tokens. */}
        <style dangerouslySetInnerHTML={{ __html: uiThemeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: uiThemeBootScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
