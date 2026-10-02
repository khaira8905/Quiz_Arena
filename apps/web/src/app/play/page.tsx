import type { Metadata } from "next";
import { PlayArena } from "@/components/play/play-arena";

export const metadata: Metadata = { title: "Play" };

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  const { game } = await searchParams;
  const code = game ? game.replace(/\s+/g, "").toUpperCase().slice(0, 8) : null;
  return <PlayArena initialCode={code} />;
}
