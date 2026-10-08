import { aiConfigured } from "@/server/ai-gateway";

/** GET /api/health — connectivity probe ("Wi-Fi connected, no internet" is offline too). */
export function GET() {
  return Response.json(
    { ok: true, ai: aiConfigured(), time: Date.now() },
    { headers: { "cache-control": "no-store" } },
  );
}
