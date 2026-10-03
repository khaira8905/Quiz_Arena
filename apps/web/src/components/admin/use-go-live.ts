"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isApiError } from "@/lib/api";
import { useStartSession } from "@/lib/queries";

/** Creates a live session for a quiz and opens the host control room. */
export function useGoLive() {
  const router = useRouter();
  const start = useStartSession();
  return {
    pending: start.isPending,
    pendingId: start.isPending ? start.variables : null,
    goLive: (quizId: string) =>
      start.mutate(quizId, {
        // The control room itself says the arena is open; no toast to linger over it.
        onSuccess: (session) => router.push(`/host/${session.code}`),
        onError: (err) =>
          toast.error("Can't go live yet", {
            description: isApiError(err) ? err.message : "Please try again.",
          }),
      }),
  };
}
