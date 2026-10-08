import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { AppShell } from "@/components/shell";
import { ServiceWorker } from "@/components/service-worker";
import { ConnectivityProvider } from "@/lib/connectivity";
import { AttuneProvider } from "@/lib/store";
import "./globals.css";

/** UI face: neutral and legible at small sizes. */
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
/** Data and engine-trace face. */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["400", "500"],
  display: "swap",
});
/** The engine's voice: questions, reflections and decisions. Calm, human, a little literary. */
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Attune — personalized engagement", template: "%s · Attune" },
  description:
    "Attune works out why a learner has disengaged (bored, stuck, tired, curious, alone) and changes the next few minutes to fit. Explainable, offline-capable, private by design.",
  applicationName: "Attune",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#11110f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-mode="full"
      className={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}
    >
      <body>
        <ConnectivityProvider>
          <AttuneProvider>
            <AppShell>{children}</AppShell>
          </AttuneProvider>
        </ConnectivityProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
