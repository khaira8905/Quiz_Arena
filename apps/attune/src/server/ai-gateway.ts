import Anthropic from "@anthropic-ai/sdk";

/**
 * AI Gateway. The language model writes words; it never makes decisions.
 *
 * The engine chooses what to do next. The gateway only rewrites an explanation the engine has
 * already chosen, in the learner's interests, so it reads closer to home. It receives library text
 * and interest keywords, never a name or anything the learner typed. If it's not configured,
 * slow or declines, the app keeps the library version and says so.
 */

export const AI_MODEL = "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export interface ReframeInput {
  concept: string;
  source: string;
  takeaway: string;
  interests: string[];
}

export type ReframeResult =
  { ok: true; text: string; model: string } | { ok: false; reason: string };

const SYSTEM = `You rewrite short maths explanations for a 15–17-year-old student.

Rewrite the explanation you are given so it is framed around one of the student's interests. Rules:
- Keep every mathematical claim and number from the source correct. Do not add new facts, statistics or numbers about the real world; invented examples must be clearly hypothetical.
- Use plain, warm language. Two short paragraphs, 90–140 words total.
- End with one sentence that states the core idea plainly.
- Plain text only: no headings, lists, markdown or emoji.`;

let client: Anthropic | undefined;

export async function reframe(input: ReframeInput): Promise<ReframeResult> {
  if (!aiConfigured()) return { ok: false, reason: "not_configured" };
  client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      // Server-side fallback: if a safety classifier declines, the API retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Concept: ${input.concept}\nStudent interests: ${input.interests.join(", ") || "everyday life"}\n\nExplanation to rewrite:\n${input.source}\n\nCore idea: ${input.takeaway}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return { ok: false, reason: "declined" };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, reason: "empty" };
    return { ok: true, text, model: response.model };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
    if (error instanceof Anthropic.AuthenticationError)
      return { ok: false, reason: "not_configured" };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, reason: "unreachable" };
    if (error instanceof Anthropic.APIError)
      return { ok: false, reason: `api_${error.status ?? "error"}` };
    return { ok: false, reason: "failed" };
  }
}
