import type { Metadata } from "next";
import { EducatorView } from "@/components/educator";

export const metadata: Metadata = { title: "Educator view" };

export default function EducatorPage() {
  return <EducatorView />;
}
