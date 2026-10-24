import { expect, it } from "vitest";
import type { Answer, Quiz, QuizResult } from "@study/shared";
import { answeredCount, buildQuizSubmission, quizOrder, quizSummary } from "../src/quizRun.js";
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
// web/test/quizRun.test.ts. seeded(n) is an LCG written in the test file.
const quiz: Quiz = { id: "q", title: "Q", items: ["a", "b", "a", "c"], timeLimitSeconds: 60, passThreshold: 0.75 };
const untimed: Quiz = { id: "q", title: "Q", items: ["a"] };
const A: Answer = { type: "short-answer", text: "x" };
it("quizOrder keeps listed order unless the quiz shuffles", () => {
  expect(quizOrder(quiz)).toEqual(["a", "b", "c"]);
  expect(quizOrder({ ...quiz, shuffle: true }, seeded(1)).sort()).toEqual(["a", "b", "c"]);
});
it("answeredCount counts only this quiz's non-null drafts", () => {
  expect(answeredCount(["a", "b", "c"], { a: A, b: null, z: A })).toBe(1);
});
it("treats prototype-named item ids as unanswered until they have their own draft", () => {
  const ids = ["toString", "constructor"];
  expect(answeredCount(ids, {})).toBe(0);
  expect(buildQuizSubmission("p", { ...untimed, items: ids }, {}, 0).answers).toEqual([
    { itemId: "toString", answer: null }, { itemId: "constructor", answer: null },
  ]);
  expect(answeredCount(ids, { constructor: A })).toBe(1);
});
it("buildQuizSubmission sends every item in quizItemIds order, null for the rest", () => {
  expect(buildQuizSubmission("p", quiz, { c: A, a: A }, 12_900)).toEqual({ kind: "quiz", packageId: "p", quizId: "q",
    answers: [{ itemId: "a", answer: A }, { itemId: "b", answer: null }, { itemId: "c", answer: A }], elapsedSeconds: 12 });
});
it("buildQuizSubmission clamps elapsed time to the limit", () => {
  expect(buildQuizSubmission("p", quiz, {}, 75_000).elapsedSeconds).toBe(60);
  expect(buildQuizSubmission("p", untimed, {}, 75_000).elapsedSeconds).toBe(75);
  expect(buildQuizSubmission("p", untimed, {}, 90_000_000).elapsedSeconds).toBe(86400);   // open for over a day
  expect(buildQuizSubmission("p", untimed, {}, -5_000).elapsedSeconds).toBe(0);           // wall clock moved back
});
it("quizSummary floors the score and states pass, fail and expiry", () => {
  const r = (o: Partial<QuizResult>): QuizResult => ({ score: 0.75, correctCount: 3, answeredCount: 3, total: 4,
    passThreshold: 0.75, passed: true, timedOut: false, elapsedSeconds: 83, results: [], ...o });
  expect(quizSummary(r({}))).toBe("75% · Passed · 3 of 4 correct · 1:23");
  expect(quizSummary(r({ score: 0.7467, passed: false, correctCount: 2 }))).toBe("74% · Not passed (needs 75%) · 2 of 4 correct · 1:23");
  expect(quizSummary(r({ score: 0.5, passThreshold: null, passed: null, correctCount: 2, elapsedSeconds: 10 }))).toBe("50% · 2 of 4 correct · 0:10");
  expect(quizSummary(r({ timedOut: true, elapsedSeconds: 60 }))).toBe("75% · Passed · 3 of 4 correct · 1:00 · Time’s up");
});
