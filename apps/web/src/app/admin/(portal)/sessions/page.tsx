import { SessionsList } from "@/components/admin/sessions-list";

export const metadata = { title: "Live sessions" };

export default function SessionsPage() {
  return <SessionsList scope="active" />;
}
