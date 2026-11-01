import { ORPHAN_KINDS, purgedKinds, stripMath } from "@study/shared";
import type { OrphanCounts, OrphanKind } from "@study/shared";

export function headline(body: string, max = 80): string {
  for (const line of body.split(/\r?\n/)) {
    if (/^(```|~~~)/.test(line.trimStart())) continue;
    const text = stripMath(line.trimStart().replace(/^(?:#{1,6}(?:\s+|$)|>\s?|[-*+]\s+|\d+[.)]\s+)+/, "")).replace(/\s+/g, " ").trim();
    if (text) return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
  }
  return "Untitled note";
}

export const message = (e: unknown): string => e instanceof Error ? e.message : String(e);
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
const COUNT_WORD: Record<OrphanKind, string> = {
  cardState: "card schedule", reviewLog: "review", attempts: "result", lessonProgress: "lesson mark", notes: "note", explanations: "explanation",
};
export const describeCounts = (counts: OrphanCounts): string =>
  ORPHAN_KINDS.filter((kind) => counts[kind] > 0).map((kind) => plural(counts[kind], COUNT_WORD[kind])).join(" · ");
export const purgeTotal = (counts: OrphanCounts, includeWriting: boolean): number =>
  purgedKinds(includeWriting).reduce((sum, kind) => sum + counts[kind], 0);
