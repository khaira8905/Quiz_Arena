import { QuizPreview } from "@/components/editor/quiz-preview";

export const metadata = { title: "Preview" };

/** Lives outside the (portal) group so it renders full-bleed, exactly like the projector. */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizPreview id={id} />;
}
