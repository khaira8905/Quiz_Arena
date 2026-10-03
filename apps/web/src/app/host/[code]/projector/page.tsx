import type { Metadata } from "next";
import { ProjectorStage } from "@/components/stage/projector-stage";

export const metadata: Metadata = { title: "Stage", robots: { index: false } };

/**
 * The projector screen: audience-facing only. `?preview=1` is the muted copy the control
 * room embeds as its live projector preview.
 */
export default async function ProjectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ code }, { preview }] = await Promise.all([params, searchParams]);
  return <ProjectorStage code={code.toUpperCase()} preview={preview === "1"} />;
}
