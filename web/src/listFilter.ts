import type { Explanation, Note } from "@study/shared";

export type ListFilter = { kind: "all" } | { kind: "standalone" } | { kind: "orphaned"; packageId?: string } | { kind: "package"; packageId: string; lessonId?: string };
export function parseListFilter(params: URLSearchParams): ListFilter {
  const packageId = params.get("packageId") ?? undefined;
  const lessonId = params.get("lessonId") ?? undefined;
  if (params.get("orphaned") === "1") return { kind: "orphaned", ...(packageId ? { packageId } : {}) };
  if (params.get("standalone") === "1") return { kind: "standalone" };
  if (packageId) return { kind: "package", packageId, ...(lessonId ? { lessonId } : {}) };
  return { kind: "all" };
}
export function filterSearch(filter: ListFilter, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (filter.kind === "orphaned") { params.set("orphaned", "1"); if (filter.packageId !== undefined) params.set("packageId", filter.packageId); }
  else if (filter.kind === "standalone") params.set("standalone", "1");
  else if (filter.kind === "package") { params.set("packageId", filter.packageId); if (filter.lessonId !== undefined) params.set("lessonId", filter.lessonId); }
  return params.size ? `?${params}` : "";
}
export function filterNotes(notes: Note[], f: ListFilter): Note[] {
  return notes.filter((note) => {
    if (f.kind === "orphaned") return note.orphaned && (f.packageId === undefined || note.target?.packageId === f.packageId);
    if (note.orphaned) return false;
    if (f.kind === "standalone") return note.target === null;
    if (f.kind === "package") return note.target?.packageId === f.packageId && (f.lessonId === undefined || note.target.lessonId === f.lessonId);
    return true;
  });
}
export function filterExplanations(list: Explanation[], f: ListFilter, revisitOnly: boolean): Explanation[] {
  return list.filter((e) => {
    if (revisitOnly && !e.revisit) return false;
    if (f.kind === "orphaned") return e.orphaned && (f.packageId === undefined || e.packageId === f.packageId);
    if (e.orphaned || f.kind === "standalone") return false;
    return f.kind !== "package" || (e.packageId === f.packageId && (f.lessonId === undefined || e.lessonId === f.lessonId));
  });
}
