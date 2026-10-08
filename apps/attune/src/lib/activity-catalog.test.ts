import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { activityCatalog, catalogSeedSql } from "./activity-catalog";

const SEED = fileURLToPath(
  new URL("../../supabase/migrations/20261008080100_seed_activities.sql", import.meta.url),
);

describe("activity catalogue", () => {
  it("has unique ids", () => {
    const ids = activityCatalog().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches the database seed migration", () => {
    // ATTUNE_WRITE_SEED=1 pnpm --filter @attune/web test regenerates the seed after content changes.
    if (process.env.ATTUNE_WRITE_SEED === "1") writeFileSync(SEED, catalogSeedSql());
    expect(readFileSync(SEED, "utf8")).toBe(catalogSeedSql());
  });
});
