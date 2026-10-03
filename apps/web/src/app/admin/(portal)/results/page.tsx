import { SessionsList } from "@/components/admin/sessions-list";

export const metadata = { title: "Results" };

export default function ResultsPage() {
  return <SessionsList scope="past" />;
}
