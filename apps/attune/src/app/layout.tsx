import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell";
import { ServiceWorker } from "@/components/service-worker";
import { AuthProvider } from "@/lib/auth";
import { ConnectivityProvider } from "@/lib/connectivity";
import { BOOT_SCRIPT } from "@/lib/prefs";
import { SettingsProvider } from "@/lib/settings";
import { AttuneProvider } from "@/lib/store";
import "./globals.css";

/** One family for everything people read: neutral, legible at small sizes, strong at display. */
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
/** Data and engine-trace face. */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["400", "500"],
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
      className={`${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme and motion choice before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <ConnectivityProvider>
          <AuthProvider>
            <SettingsProvider>
              <AttuneProvider>
                <AppShell>{children}</AppShell>
              </AttuneProvider>
            </SettingsProvider>
          </AuthProvider>
        </ConnectivityProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
