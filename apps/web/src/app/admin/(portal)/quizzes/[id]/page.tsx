import { type EditorTab, QuizEditor } from "@/components/editor/quiz-editor";

export const metadata = { title: "Quiz editor" };

const TABS: readonly EditorTab[] = ["questions", "settings", "arena"];

export default async function QuizEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const initialTab = TABS.find((t) => t === tab);
  return <QuizEditor key={initialTab} id={id} initialTab={initialTab} />;
}
