import type { PackageSummary } from "./api.js";

export interface InProgressLesson { packageId: string; packageTitle: string; lessonId: string; title: string; updatedAt?: string }
export function lessonsInProgress(packages: PackageSummary[], limit = 5): { lessons: InProgressLesson[]; more: number } {
  const all = packages.flatMap((p) => p.lessons.filter((l) => l.status === "in-progress").map((l) => ({ packageId: p.id, packageTitle: p.title, lessonId: l.id, title: l.title, updatedAt: l.updatedAt })));
  all.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return { lessons: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}
