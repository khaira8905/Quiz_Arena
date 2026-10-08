import { syncBatchSchema } from "@attune/engine";
import { syncStore } from "@/server/sync-store";

/** POST /api/sync — idempotent ingestion of a batch of learner events from a device outbox. */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 512_000) return Response.json({ error: "too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = syncBatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_batch", issues: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }
  return Response.json(syncStore.ingest(parsed.data));
}
