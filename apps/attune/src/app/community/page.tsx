import type { Metadata } from "next";
import { CommunityView } from "@/components/community";

export const metadata: Metadata = { title: "Community" };

export default function CommunityPage() {
  return <CommunityView />;
}
