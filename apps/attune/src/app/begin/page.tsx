import type { Metadata } from "next";
import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding";

export const metadata: Metadata = { title: "Check in" };

export default function BeginPage() {
  return (
    <Suspense fallback={null}>
      <Onboarding />
    </Suspense>
  );
}
