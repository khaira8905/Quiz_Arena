import { ArenaPreviewFrame } from "@/components/arena/arena-preview-frame";

export const metadata = { title: "Arena preview", robots: { index: false } };

/**
 * Embedded by the Customize Arena panel. Renders only sample data posted by the parent
 * window, so it needs no session; framing is limited to this origin.
 */
export default async function ArenaPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ surface?: string }>;
}) {
  const { surface } = await searchParams;
  return <ArenaPreviewFrame surface={surface === "phone" ? "phone" : "projector"} />;
}
