import type { Metadata } from "next";
import { ProgressView } from "@/components/progress-view";

export const metadata: Metadata = { title: "Progress" };

/** Protected by `src/proxy.ts`: signed-out visitors are sent to /login?next=/progress. */
export default function ProgressPage() {
  return <ProgressView />;
}
