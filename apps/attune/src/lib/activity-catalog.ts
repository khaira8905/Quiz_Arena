import {
  BREAKS,
  CHALLENGES,
  CURIOSITY_PATHS,
  EXPLANATIONS,
  GUIDED,
  MICRO_WINS,
  MISSIONS,
  QUESTIONS,
  REFLECTIONS,
  type Activity,
  type ConceptId,
} from "@attune/engine";

/**
 * The activity catalogue: every activity that ships in the app bundle. The database keeps a copy
 * (`public.activities`) so attempts and progress can reference activities with foreign keys.
 * `activity-catalog.test.ts` fails if the SQL seed and the bundled content ever drift apart.
 */

export interface CatalogEntry {
  id: string;
  type: Activity["type"];
  conceptId: ConceptId;
  difficulty: number | null;
  title: string;
}

export function activityCatalog(): CatalogEntry[] {
  const all: Activity[] = [
    ...QUESTIONS,
    ...GUIDED,
    ...MICRO_WINS,
    ...CHALLENGES,
    ...EXPLANATIONS,
    ...CURIOSITY_PATHS,
    ...MISSIONS,
    ...REFLECTIONS,
    ...BREAKS,
  ];
  return all.map((a) => ({
    id: a.id,
    type: a.type,
    conceptId: a.conceptId,
    difficulty: "difficulty" in a ? a.difficulty : a.type === "micro" ? 1 : null,
    title: a.title,
  }));
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function catalogSeedSql(): string {
  const rows = activityCatalog().map(
    (e) =>
      `  (${quote(e.id)}, ${quote(e.type)}, ${quote(e.conceptId)}, ${e.difficulty ?? "null"}, ${quote(e.title)})`,
  );
  return [
    "-- Generated from the engine's content library by src/lib/activity-catalog.ts. Do not edit by",
    "-- hand: change the content, then regenerate (see apps/attune/README.md).",
    "insert into public.activities (id, type, concept_id, difficulty, title) values",
    `${rows.join(",\n")}`,
    "on conflict (id) do update set",
    "  type = excluded.type,",
    "  concept_id = excluded.concept_id,",
    "  difficulty = excluded.difficulty,",
    "  title = excluded.title;",
    "",
  ].join("\n");
}

const TITLES = new Map(activityCatalog().map((e) => [e.id, e]));

export function catalogEntry(id: string): CatalogEntry | undefined {
  return TITLES.get(id);
}
