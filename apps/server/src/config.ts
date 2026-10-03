import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  /** Comma-separated list of allowed browser origins (the Next.js app). */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /** Public URL players use to join; used for nothing server-side but logged for operators. */
  PUBLIC_WEB_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  ALLOW_REGISTRATION: boolish,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** Set when the API sits behind a proxy (Vercel rewrite, Railway, Render, Fly). */
  TRUST_PROXY: boolish,

  /** Image uploads: "local" (dev disk), "s3" (any S3-compatible bucket) or "none". */
  MEDIA_STORAGE: z.enum(["local", "s3", "none"]).optional(),
  MEDIA_LOCAL_DIR: z.string().default("./uploads"),
  /** e.g. https://<account>.r2.cloudflarestorage.com or https://<project>.supabase.co/storage/v1/s3 */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public base URL objects are served from (bucket public URL or CDN), https. */
  S3_PUBLIC_URL: z.url().optional(),

  /** Google Drive image picker (OAuth web client). */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Must match the redirect URI registered in Google Cloud: <web app>/api/google/callback */
  GOOGLE_REDIRECT_URI: z.url().optional(),
  /** Encrypts stored Google refresh tokens; defaults to a key derived from JWT_SECRET. */
  GOOGLE_TOKEN_KEY: z.string().min(32).optional(),
});

export type Config = z.infer<typeof envSchema> & { webOrigins: string[]; isProd: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production" && cfg.JWT_SECRET.startsWith("dev-only")) {
    throw new Error("Refusing to start in production with the development JWT_SECRET");
  }
  return {
    ...cfg,
    webOrigins: cfg.WEB_ORIGIN.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    isProd: cfg.NODE_ENV === "production",
  };
}
