import { expect, it } from "vitest";
import type { PackageSummary } from "../src/api.js";
import { lessonsInProgress } from "../src/home.js";
const pkgs: PackageSummary[] = [
  { id: "alpha", title: "Alpha", version: "1", lessonCount: 4, quizzes: [], games: [], lessons: [
    { id: "a1", title: "A one", status: "in-progress", updatedAt: "2026-10-20T00:00:00.000Z" }, { id: "a2", title: "A two", status: "completed" }, { id: "a3", title: "A three", status: "in-progress" }, { id: "a4", title: "A four", status: "not-started" },
  ] },
  { id: "beta", title: "Beta", version: "1", lessonCount: 3, quizzes: [], games: [], lessons: [
    { id: "b1", title: "B one", status: "in-progress", updatedAt: "2026-10-21T00:00:00.000Z" }, { id: "b2", title: "B two", status: "in-progress", updatedAt: "2026-10-19T00:00:00.000Z" }, { id: "b3", title: "B three", status: "in-progress" },
  ] },
];
it("keeps in-progress lessons, newest first, missing last in library order", () => {
  expect(lessonsInProgress(pkgs).lessons.map((l) => l.lessonId)).toEqual(["b1", "a1", "b2", "a3", "b3"]);
  expect(lessonsInProgress(pkgs).more).toBe(0);
  expect(lessonsInProgress(pkgs).lessons[0]).toEqual({ packageId: "beta", packageTitle: "Beta", lessonId: "b1", title: "B one", updatedAt: "2026-10-21T00:00:00.000Z" });
});
it("limits and counts the rest", () => {
  expect(lessonsInProgress(pkgs, 2)).toMatchObject({ more: 3 }); expect(lessonsInProgress([])).toEqual({ lessons: [], more: 0 });
});
