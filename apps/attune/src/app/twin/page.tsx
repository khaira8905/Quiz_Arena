import type { Metadata } from "next";
import { TwinView } from "@/components/twin";

export const metadata: Metadata = { title: "Learner twin" };

export default function TwinPage() {
  return <TwinView />;
}
