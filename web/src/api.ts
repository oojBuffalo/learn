import type { Answer, CardState, CheckResult, Item, PackageError, Rating } from "@study/shared";

export interface LessonSummary { id: string; title: string; summary?: string; status: string }
export interface PackageSummary {
  id: string; title: string; description?: string; version: string;
  tags?: string[]; lessonCount: number; lessons: LessonSummary[];
}
export interface LessonPayload {
  lesson: { id: string; title: string; frontmatter: Record<string, unknown> & { activities?: string[] }; body: string };
  items: Record<string, Item>;
  progress: "not-started" | "in-progress" | "completed";
}
export interface Card {
  packageId: string; itemId: string; direction: "front" | "back";
  front: string; back: string; examples?: string[]; isNew: boolean;
  /** Scheduler state, or null for a card never reviewed in this direction. */
  state: CardState | null;
}

export class ApiError extends Error {
  constructor(message: string, public code: string, public details?: PackageError[]) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  if (!res.ok) throw new ApiError(body.error?.message ?? res.statusText, body.error?.code ?? "unknown", body.error?.details);
  return body as T;
}
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const listPackages = () => req<{ packages: PackageSummary[] }>("/api/packages").then((r) => r.packages);
export const importPackageZip = async (file: File) =>
  req<{ packageId: string }>("/api/packages/import", { method: "POST", body: await file.arrayBuffer() });
export const deletePackage = (id: string) => req<void>(`/api/packages/${id}`, { method: "DELETE" });
export const exportUrl = (id: string) => `/api/packages/${id}/export`;
export const getLesson = (packageId: string, lessonId: string) =>
  req<LessonPayload>(`/api/lessons/${packageId}/${lessonId}`);
export const setProgress = (packageId: string, lessonId: string, status: "in-progress" | "completed") =>
  req<{ ok: true }>(`/api/lessons/${packageId}/${lessonId}/progress`, json({ status })).then(() => undefined);
export const submitAnswer = (packageId: string, itemId: string, answer: Answer) =>
  req<CheckResult>("/api/attempts", json({ packageId, itemId, answer }));
export const getDueCards = () => req<{ cards: Card[] }>("/api/review/due").then((r) => r.cards);
export const getFreeStudy = (packageId: string) =>
  req<{ cards: Card[] }>(`/api/review/free-study?packageId=${encodeURIComponent(packageId)}`).then((r) => r.cards);
export const gradeCard = (packageId: string, itemId: string, direction: string, rating: Rating) =>
  req<{ state: CardState }>("/api/review/grade", json({ packageId, itemId, direction, rating }));
