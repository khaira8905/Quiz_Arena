import type { Metadata } from "next";
import { SessionView } from "@/components/session/session-view";

export const metadata: Metadata = { title: "Session" };

export default function SessionPage() {
  return <SessionView />;
}
