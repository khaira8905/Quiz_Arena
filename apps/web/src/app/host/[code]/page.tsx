import type { Metadata } from "next";
import { HostArena } from "@/components/host/host-arena";

export const metadata: Metadata = { title: "Arena", robots: { index: false } };

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <HostArena code={code.toUpperCase()} />;
}
