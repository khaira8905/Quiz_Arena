import { QuizEditor } from "@/components/editor/quiz-editor";

export const metadata = { title: "Quiz editor" };

export default async function QuizEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizEditor id={id} />;
}
