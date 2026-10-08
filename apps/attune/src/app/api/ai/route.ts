import { z } from "zod";
import { AI_MODEL, aiConfigured, reframe } from "@/server/ai-gateway";

const requestSchema = z.object({
  concept: z.string().min(1).max(80),
  source: z.string().min(20).max(2500),
  takeaway: z.string().max(300),
  interests: z.array(z.string().min(1).max(30)).max(5),
});

/** GET /api/ai — is the gateway configured? */
export function GET() {
  return Response.json({ configured: aiConfigured(), model: aiConfigured() ? AI_MODEL : null });
}

/** POST /api/ai — reframe a library explanation in the learner's interests. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 422 });

  const result = await reframe(parsed.data);
  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : 502;
    return Response.json({ error: result.reason }, { status });
  }
  return Response.json({ text: result.text, model: result.model });
}
