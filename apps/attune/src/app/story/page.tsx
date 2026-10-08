import type { Metadata } from "next";
import { Story } from "@/components/story";

export const metadata: Metadata = { title: "The story" };

export default function StoryPage() {
  return <Story />;
}
