import { defineConfig } from "vitest/config";

/**
 * End-to-end tests: a real browser against the running app and the local Supabase stack.
 *
 *   pnpm --filter @attune/web exec supabase start   # database, auth, Mailpit
 *   pnpm --filter @attune/web dev                   # http://localhost:3100
 *   pnpm --filter @attune/web test:e2e
 */
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
