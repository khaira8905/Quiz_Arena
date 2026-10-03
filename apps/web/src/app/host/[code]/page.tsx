import type { Metadata } from "next";
import { HostControlRoom } from "@/components/host/control-room";

export const metadata: Metadata = { title: "Control room", robots: { index: false } };

/** The host laptop. The audience's screen is /host/[code]/projector. */
export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <HostControlRoom code={code.toUpperCase()} />;
}
