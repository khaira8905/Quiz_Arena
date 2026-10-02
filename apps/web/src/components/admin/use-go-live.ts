"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isApiError } from "@/lib/api";
import { useStartSession } from "@/lib/queries";

/** Creates a live session for a quiz and opens its control panel. */
export function useGoLive() {
  const router = useRouter();
  const start = useStartSession();
  return {
    pending: start.isPending,
    pendingId: start.isPending ? start.variables : null,
    goLive: (quizId: string) =>
      start.mutate(quizId, {
        onSuccess: (session) => {
          toast.success(`Arena ${session.code} is open`, {
            description: "Open the projector view and let players in.",
          });
          router.push(`/admin/sessions/${session.id}`);
        },
        onError: (err) =>
          toast.error("Can't go live yet", {
            description: isApiError(err) ? err.message : "Please try again.",
          }),
      }),
  };
}
