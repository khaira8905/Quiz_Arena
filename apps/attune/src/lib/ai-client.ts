import { CONCEPT_META, type ExplanationActivity } from "@attune/engine";

export type ReframeOutcome =
  { ok: true; text: string; model: string } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  not_configured:
    "The AI gateway isn't configured on this server, so you're seeing the library version.",
  declined: "The model declined this one. The library version is still right here.",
  rate_limited: "The AI gateway is busy. Try again in a moment.",
  unreachable: "Couldn't reach the AI gateway.",
};

/** Ask the gateway to reframe a library explanation around the learner's interests. */
export async function reframeExplanation(
  activity: ExplanationActivity,
  interests: string[],
): Promise<ReframeOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        concept: CONCEPT_META[activity.conceptId].label,
        source: activity.textFallback.slice(0, 2500),
        takeaway: activity.takeaway,
        interests: interests.slice(0, 5),
      }),
    });
    const body = (await res.json()) as { text?: string; model?: string; error?: string };
    if (res.ok && body.text) return { ok: true, text: body.text, model: body.model ?? "" };
    return {
      ok: false,
      message: MESSAGES[body.error ?? ""] ?? "The AI gateway couldn't help with this one.",
    };
  } catch {
    return {
      ok: false,
      message: "The AI gateway took too long. The library version is unchanged.",
    };
  } finally {
    clearTimeout(timer);
  }
}
