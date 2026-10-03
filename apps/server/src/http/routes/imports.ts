import { googleImportSchema } from "@quizarena/shared";
import type { FastifyInstance } from "fastify";
import { fetchGoogleFile } from "../../lib/google-import";
import { requireUser, type AppContext } from "../context";

export function importRoutes(app: FastifyInstance, ctx: AppContext) {
  /**
   * Downloads a shared Google Sheet / Drive file for the import dialog. The browser can't
   * fetch it directly (CORS), so the server does, and returns the raw file; parsing and the
   * preview happen in the browser exactly as for a file picked from the laptop.
   */
  app.post(
    "/api/import/google",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      await requireUser(ctx, req);
      const { url } = googleImportSchema.parse(req.body);
      const file = await fetchGoogleFile(url);
      return reply
        .header("cache-control", "no-store")
        .header("x-import-kind", file.kind)
        .type(
          file.kind === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv; charset=utf-8",
        )
        .send(file.body);
    },
  );
}
