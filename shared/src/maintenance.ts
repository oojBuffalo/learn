import { z } from "zod";
import { idSchema } from "./ids.js";

/** User-state categories whose references can outlive content. */
export const ORPHAN_KINDS = ["cardState", "reviewLog", "attempts", "lessonProgress", "notes", "explanations"] as const;
/** One category of retained user state. */
export type OrphanKind = (typeof ORPHAN_KINDS)[number];
/** Writing is preserved unless its deletion is explicitly requested. */
export const WRITING_KINDS = ["notes", "explanations"] as const satisfies readonly OrphanKind[];
/** Counts shown in a cleanup preview, including categories with no rows. */
export const orphanCountsSchema = z.object({
  cardState: z.number().int().nonnegative(), reviewLog: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(), lessonProgress: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(), explanations: z.number().int().nonnegative(),
}).strict();
export type OrphanCounts = z.infer<typeof orphanCountsSchema>;
/** A guarded purge carries the exact preview counts the user confirmed. */
export const purgeOrphansRequestSchema = z.object({ packageId: idSchema, includeWriting: z.boolean(), expected: orphanCountsSchema }).strict();
export type PurgeOrphansRequest = z.infer<typeof purgeOrphansRequestSchema>;
/** A package's leftover state, whether or not the package is still imported. */
export interface OrphanGroup { packageId: string; packageTitle: string | null; inLibrary: boolean; counts: OrphanCounts }

/**
 * Chooses the state categories a confirmed purge may delete.
 * Args:
 *   includeWriting: Whether the user opted into deleting notes and explanations.
 * Returns:
 *   Purged categories in their declared order.
 * Raises:
 *   None.
 */
export function purgedKinds(includeWriting: boolean): OrphanKind[] {
  return ORPHAN_KINDS.filter((kind) => includeWriting || !WRITING_KINDS.some((writing) => writing === kind));
}
