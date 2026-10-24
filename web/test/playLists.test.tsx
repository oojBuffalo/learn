import { expect, it } from "vitest";
import { renderToStaticMarkup as html } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QuizList } from "../src/pages/Quizzes.js";
import { GameList } from "../src/pages/Games.js";
import History from "../src/components/History.js";
import type { QuizSummary, GameSummary, PackageSummary } from "../src/api.js";
const quiz = (over: Partial<QuizSummary> = {}): QuizSummary => ({ id: "q", title: "Q", itemCount: 4, timeLimitSeconds: null, passThreshold: 0.75, runs: 0, best: null, ...over });
const game = (over: Partial<GameSummary> = {}): GameSummary => ({ id: "g", title: "G", template: "matching", timeLimitSeconds: null, runs: 0, best: null, ...over });
const pkg = (id: string, over: Partial<PackageSummary> = {}): PackageSummary => ({ id, title: id, version: "1", lessonCount: 0, lessons: [], quizzes: [], games: [], ...over });
const row = (out: string, href: string) => out.split("<a ").find((chunk) => chunk.includes(`href="${href}"`))?.split("</a>")[0] ?? "";
it("QuizList groups by package, links each quiz and shows meta and dots", () => {
  const out = html(<MemoryRouter><QuizList packages={[pkg("p1", { quizzes: [
    quiz({ id: "passed", runs: 2, best: 0.75 }), quiz({ id: "tried", itemCount: 1, timeLimitSeconds: 60, runs: 1, best: 0.5 }),
    quiz({ id: "open", passThreshold: null, runs: 1, best: 0.2 }), quiz({ id: "new" })] }), pkg("p2")]} /></MemoryRouter>);
  expect(out.match(/class="sheet"/g)).toHaveLength(1);                            // p2 has no quizzes
  expect(row(out, "/quizzes/p1/passed")).toContain("4 questions · pass 75% · best 75%");
  expect(row(out, "/quizzes/p1/passed")).toContain('class="dot dot-done"');
  expect(row(out, "/quizzes/p1/tried")).toContain("1 question · 1:00 limit · pass 75% · best 50%");
  expect(row(out, "/quizzes/p1/tried")).toContain('class="dot dot-progress"');
  expect(row(out, "/quizzes/p1/open")).toContain('class="dot dot-done"');
  expect(row(out, "/quizzes/p1/new")).toContain('class="dot"');
});
it("GameList shows the template, the effective limit and the best score", () => {
  const out = html(<MemoryRouter><GameList packages={[pkg("p1", { games: [game({ id: "g-match" }),
    game({ id: "g-speed", template: "timed-round", timeLimitSeconds: 60, runs: 1, best: 0.75 })] })]} /></MemoryRouter>);
  expect(row(out, "/games/p1/g-match")).toContain('<span class="meta">Matching</span>');
  expect(row(out, "/games/p1/g-speed")).toContain("Timed round · 1:00 limit · best 75%");
  expect(row(out, "/games/p1/g-speed")).toContain('class="dot dot-done"');
});
it("the lists say when there is nothing to list", () => {
  expect(html(<MemoryRouter><QuizList packages={[pkg("p1")]} /></MemoryRouter>)).toContain("No quizzes yet");
  expect(html(<MemoryRouter><GameList packages={[pkg("p1")]} /></MemoryRouter>)).toContain("No games yet");
});
it("History shows score, pass chip, time and expiry in the order given", () => {
  const out = html(<History attempts={[
    { id: 2, kind: "quiz", packageId: "p", quizId: "q", score: 0.7467, passed: false, correctCount: 3, total: 4,
      timedOut: true, elapsedSeconds: 83, at: "2026-10-22T09:00:00.000Z" },
    { id: 1, kind: "game", packageId: "p", gameId: "g", template: "matching", score: 1, correctCount: 3, total: 3,
      mistakes: 0, completed: true, timedOut: false, elapsedSeconds: 42, at: "2026-10-21T09:00:00.000Z" }]} />);
  expect(out.match(/<li/g)).toHaveLength(2); expect(out.indexOf("74%")).toBeLessThan(out.indexOf("100%"));
  expect(out).toContain(">Not passed<"); expect(out).toContain("1:23 · time’s up");
  expect(out).toContain("0:42"); expect(out).not.toContain(">Passed<");
  expect(out).toMatch(/datetime="2026-10-22T09:00:00.000Z"/i);
  expect(html(<History attempts={[]} />)).toContain("No attempts yet.");
});
