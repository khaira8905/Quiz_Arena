import type { Metadata } from "next";
import { QueryProvider } from "@/components/admin/query-provider";

export const metadata: Metadata = {
  title: { default: "Control Room", template: "%s · QuizArena Admin" },
  robots: { index: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
