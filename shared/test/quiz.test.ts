import { expect, it } from "vitest";
import { isPassing, quizItemIds, scoreQuiz } from "../src/index.js";
import type { Answer, CheckableItem, Item, Quiz } from "../src/index.js";

const mc: CheckableItem = { id: "mc", type: "multiple-choice", prompt: "?", options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] };
const ms: CheckableItem = { id: "ms", type: "multi-select", prompt: "?", partialCredit: true, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B", correct: true }, { id: "c", text: "C" }] };
const fb: CheckableItem = { id: "fb", type: "fill-blank", prompt: "?", template: "{{1}} and {{2}}", blanks: [{ slot: 1, accept: ["Paris"] }, { slot: 2, accept: ["Lyon"] }] };
const ord: CheckableItem = { id: "ord", type: "ordering", prompt: "?", steps: [{ id: "s1", text: "One" }, { id: "s2", text: "Two" }, { id: "s3", text: "Three" }] };
const items: ReadonlyMap<string, Item> = new Map([mc, ms, fb, ord].map((i) => [i.id, i]));
const quiz: Quiz = { id: "qz", title: "Q", items: ["mc", "ms", "fb", "ord"], passThreshold: 0.75, timeLimitSeconds: 60 };
const mcRight: Answer = { type: "multiple-choice", optionId: "a" };
const msHalf: Answer = { type: "multi-select", optionIds: ["a"] };
const msAll: Answer = { type: "multi-select", optionIds: ["a", "b"] };
const fbHalf: Answer = { type: "fill-blank", answers: { "1": "Paris" } };
const fbAll: Answer = { type: "fill-blank", answers: { "1": "Paris", "2": "Lyon" } };
const ordOff: Answer = { type: "ordering", orderedIds: ["s1", "s3", "s2"] };
const run = (answers: (Answer | null)[], q: Quiz = quiz) => scoreQuiz(q, items, q.items.map((itemId, k) => ({ itemId, answer: answers[k] ?? null })), 30);
const nulls = quiz.items.map((itemId) => ({ itemId, answer: null }));

it("scores the mean item score, keeping partial credit", () => {
  const r = run([mcRight, msHalf, fbHalf, ordOff]);
  expect(r.results.map((x) => x.score)).toEqual([1, 0.5, 0.5, 1 / 3]);
  expect(r.score).toBeCloseTo(7 / 12, 12);
  expect(r).toMatchObject({ correctCount: 1, answeredCount: 4, total: 4, passThreshold: 0.75, passed: false });
});
it("scores a null answer 0, reports its expected answer, and never checks it", () => {
  const r = run([mcRight, null, null, null]);
  expect(r).toMatchObject({ score: 0.25, correctCount: 1, answeredCount: 1 });
  expect(r.results[1]).toEqual({ itemId: "ms", answered: false, correct: false, score: 0, expected: ["a", "b"] });
  expect(r.results[3]?.expected).toEqual(["s1", "s2", "s3"]);
});
it("passes 3 of 4 against a 0.75 threshold", () =>
  expect(run([mcRight, msAll, fbAll, null])).toMatchObject({ score: 0.75, correctCount: 3, passed: true }));
it("isPassing tolerates float error and is null without a threshold", () => {
  expect([isPassing(0.75, 0.75), isPassing(0.7499999999999999, 0.75), isPassing(0.7467, 0.75), isPassing(1, undefined)])
    .toEqual([true, true, false, null]);
});
it("gives passed and passThreshold null when the quiz sets no threshold", () => {
  const { passThreshold: _, ...open } = quiz;
  expect(run([mcRight], open)).toMatchObject({ passThreshold: null, passed: null });
});
it("requires exactly one answer per quiz item", () => {
  for (const answers of [nulls.slice(0, 3), [...nulls, { itemId: "zz", answer: null }], [...nulls.slice(0, 3), { itemId: "mc", answer: null }]])
    expect(() => scoreQuiz(quiz, items, answers, 0)).toThrow("quiz answers must list every quiz item exactly once");
});
it("throws for a missing or uncheckable item and propagates checkAnswer errors", () => {
  expect(() => scoreQuiz(quiz, new Map([...items].filter(([id]) => id !== "ord")), nulls, 0)).toThrow('quiz item "ord" is missing');
  const card: Item = { id: "ord", type: "flashcard", front: "f", back: "b" };
  expect(() => scoreQuiz(quiz, new Map([...items, ["ord", card]]), nulls, 0)).toThrow('quiz item "ord" is not checkable');
  expect(() => run([{ type: "multiple-choice", optionId: "zz" }])).toThrow('unknown option id "zz"');
});
it("dedupes quiz items and reports results in quiz order", () => {
  expect(quizItemIds({ ...quiz, items: ["a", "b", "a", "c", "b"] })).toEqual(["a", "b", "c"]);
  expect(scoreQuiz(quiz, items, [...nulls].reverse(), 0).results.map((x) => x.itemId)).toEqual(["mc", "ms", "fb", "ord"]);
  expect(scoreQuiz({ ...quiz, items: ["mc", "mc", "ms"] }, items, nulls.slice(0, 2), 0).total).toBe(2);
});
it("clamps elapsed time to the limit and flags timedOut at the limit", () => {
  expect(scoreQuiz(quiz, items, nulls, 75)).toMatchObject({ elapsedSeconds: 60, timedOut: true });
  expect(scoreQuiz(quiz, items, nulls, 60)).toMatchObject({ elapsedSeconds: 60, timedOut: true });
  expect(scoreQuiz(quiz, items, nulls, 59)).toMatchObject({ elapsedSeconds: 59, timedOut: false });
  const { timeLimitSeconds: _, ...untimed } = quiz;
  expect(scoreQuiz(untimed, items, nulls, 500)).toMatchObject({ elapsedSeconds: 500, timedOut: false });
});
