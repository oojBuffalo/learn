import { ORPHAN_KINDS, purgedKinds } from "@study/shared";
import type { OrphanKind, OrphanCounts, OrphanGroup, PurgeOrphansRequest } from "@study/shared";
import type { Db } from "./db.js";

/** Package content replaced on re-import and excluded from user-state cleanup. */
export const CONTENT_TABLES = ["packages", "lessons", "items", "quizzes", "games", "assets"] as const;
/** The only tables a guarded user-state purge may touch. */
export const ORPHAN_TABLE: Record<OrphanKind, string> = {
  cardState: "card_state", reviewLog: "review_log", attempts: "attempts", lessonProgress: "lesson_progress", notes: "notes", explanations: "explanations",
};

const lessonLive = (t: string) =>
  `EXISTS (SELECT 1 FROM lessons xl WHERE xl.package_id = ${t}.package_id AND xl.id = ${t}.lesson_id)`;
const cardLive = (t: string) =>
  `EXISTS (SELECT 1 FROM items xi WHERE xi.package_id = ${t}.package_id AND xi.id = ${t}.item_id AND xi.type = 'flashcard'
     AND (${t}.direction = 'front' OR (${t}.direction = 'back' AND json_extract(xi.data, '$.reverse') = 1)))`;

/**
 * Builds each user-state kind's single liveness predicate.
 * Args:
 *   t: A trusted table name or alias written by the caller, never user input.
 * Returns:
 *   A SQL condition true exactly when the row still refers to live content.
 * Raises:
 *   None.
 */
export const LIVE: Record<OrphanKind, (t: string) => string> = {
  cardState: cardLive, reviewLog: cardLive, lessonProgress: lessonLive, explanations: lessonLive,
  attempts: (t) => `CASE ${t}.kind
    WHEN 'exercise' THEN EXISTS (SELECT 1 FROM items xi WHERE xi.package_id = ${t}.package_id AND xi.id = ${t}.item_id)
    WHEN 'quiz' THEN EXISTS (SELECT 1 FROM quizzes xq WHERE xq.package_id = ${t}.package_id AND xq.id = ${t}.ref_id)
    WHEN 'game' THEN EXISTS (SELECT 1 FROM games xg WHERE xg.package_id = ${t}.package_id AND xg.id = ${t}.ref_id) END`,
  notes: (t) => `(${t}.package_id IS NULL OR CASE WHEN ${t}.lesson_id IS NULL
    THEN EXISTS (SELECT 1 FROM packages xp WHERE xp.id = ${t}.package_id) ELSE ${lessonLive(t)} END)`,
};

const zeroCounts = (): OrphanCounts => ({ cardState: 0, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 });

/**
 * Counts retained orphaned state for one package without deleting anything.
 * Args:
 *   db: The open database. packageId: The package whose references are counted.
 * Returns:
 *   One non-negative count per user-state kind.
 * Raises:
 *   Error: A database read fails.
 */
export function countOrphans(db: Db, packageId: string): OrphanCounts {
  const counts = zeroCounts();
  for (const kind of ORPHAN_KINDS) {
    const table = ORPHAN_TABLE[kind];
    counts[kind] = (db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE package_id = ? AND NOT (${LIVE[kind](table)})`)
      .get(packageId) as { n: number }).n;
  }
  return counts;
}

/**
 * Groups orphaned user state by its former or current package.
 * Args:
 *   db: The open database.
 * Returns:
 *   Non-empty groups sorted by package id, with titles only for imported packages.
 * Raises:
 *   Error: A database read fails.
 */
export function orphanReport(db: Db): OrphanGroup[] {
  const groups = new Map<string, OrphanGroup>();
  const packageTitle = db.prepare("SELECT json_extract(manifest, '$.title') title FROM packages WHERE id = ?");
  for (const kind of ORPHAN_KINDS) {
    const table = ORPHAN_TABLE[kind];
    const rows = db.prepare(`SELECT package_id, COUNT(*) n FROM ${table} WHERE package_id IS NOT NULL AND NOT (${LIVE[kind](table)}) GROUP BY package_id`)
      .all() as { package_id: string; n: number }[];
    for (const row of rows) {
      let group = groups.get(row.package_id);
      if (!group) {
        const pkg = packageTitle.get(row.package_id) as { title: string } | undefined;
        group = { packageId: row.package_id, packageTitle: pkg?.title ?? null, inLibrary: pkg !== undefined, counts: zeroCounts() };
        groups.set(row.package_id, group);
      }
      group.counts[kind] = row.n;
    }
  }
  return [...groups.values()].sort((a, b) => a.packageId < b.packageId ? -1 : a.packageId > b.packageId ? 1 : 0);
}

/**
 * Atomically recounts and purges only the package's confirmed orphaned kinds.
 * Args:
 *   db: The open database. req: The validated preview counts and writing opt-in.
 * Returns:
 *   Deleted counts, or current counts with no deletion when a selected count changed.
 * Raises:
 *   Error: A database operation fails; the transaction rolls back all deletes.
 */
export function purgeOrphans(db: Db, req: PurgeOrphansRequest): { ok: true; purged: OrphanCounts } | { ok: false; current: OrphanCounts } {
  return db.transaction(() => {
    const current = countOrphans(db, req.packageId);
    const kinds = purgedKinds(req.includeWriting);
    if (kinds.some((kind) => current[kind] !== req.expected[kind])) return { ok: false as const, current };
    const purged = zeroCounts();
    for (const kind of kinds) {
      const table = ORPHAN_TABLE[kind];
      purged[kind] = db.prepare(`DELETE FROM ${table} WHERE package_id = ? AND NOT (${LIVE[kind](table)})`).run(req.packageId).changes;
    }
    return { ok: true as const, purged };
  })();
}
