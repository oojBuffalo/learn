import { expect, it } from "vitest";
import {
  MAX_ELAPSED_SECONDS, MAX_PLAY_ITEMS, MAX_MATCH_TEXT, attemptBodySchema,
  quizSubmissionSchema, gameSubmissionSchema, gamePlaySchema, gameMoveSchema, matchPickSchema,
  attemptsQuerySchema, progressRequestSchema, gradeRequestSchema,
} from "../src/index.js";

const ex = { packageId: "p", itemId: "i", answer: { type: "multiple-choice", optionId: "a" } };
const quiz = { kind: "quiz", packageId: "p", quizId: "q", elapsedSeconds: 12,
  answers: [{ itemId: "i", answer: null }, { itemId: "j", answer: { type: "short-answer", text: "x" } }] };
const game = { kind: "game", packageId: "p", gameId: "g", elapsedSeconds: 5,
  play: { template: "matching", lefts: ["a"], picks: [{ left: "a", right: "1" }] } };
it("parses the legacy exercise body, a quiz submission and a game submission", () => {
  for (const body of [ex, quiz, game]) expect(attemptBodySchema.parse(body)).toEqual(body);
});
it("rejects unknown keys on every branch", () => {
  for (const body of [{ ...ex, typo: true }, { ...quiz, extra: 1 }, { ...game, extra: 1 }, { ...game, play: { ...game.play, rights: [] } }])
    expect(attemptBodySchema.safeParse(body).success).toBe(false);
});
it("rejects a quiz-kind body carrying exercise fields", () =>
  expect(attemptBodySchema.safeParse({ kind: "quiz", packageId: "p", itemId: "i", answer: ex.answer }).success).toBe(false));
it("rejects a play whose fields do not match its template", () => {
  for (const play of [{ template: "matching", itemIds: ["i"], answers: [] }, { template: "order-it", lefts: ["a"], picks: [] },
    { template: "timed-round", itemIds: [], answers: [] }]) expect(gamePlaySchema.safeParse(play).success).toBe(false);
});
it("bounds elapsed time, list sizes and text", () => {
  expect(MAX_ELAPSED_SECONDS).toBe(86400); expect([MAX_PLAY_ITEMS, MAX_MATCH_TEXT]).toEqual([200, 2000]);
  for (const elapsedSeconds of [-1, 1.5, 86401]) expect(quizSubmissionSchema.safeParse({ ...quiz, elapsedSeconds }).success).toBe(false);
  expect(quizSubmissionSchema.safeParse({ ...quiz, elapsedSeconds: 86400 }).success).toBe(true);
  const many = Array.from({ length: 201 }, (_, k) => ({ itemId: `i${k}`, answer: null }));
  const long = [{ itemId: "i", answer: { type: "short-answer", text: "x".repeat(201) } }];
  for (const answers of [many, long]) expect(quizSubmissionSchema.safeParse({ ...quiz, answers }).success).toBe(false);
  expect(matchPickSchema.safeParse({ left: "a".repeat(2001), right: "b" }).success).toBe(false);
});
it("accepts either game move shape but not a mix", () => {
  expect(gameMoveSchema.safeParse({ itemId: "i", answer: ex.answer }).success).toBe(true);
  expect(gameMoveSchema.safeParse({ left: "a", right: "1" }).success).toBe(true);
  expect(gameMoveSchema.safeParse({ left: "a", right: "1", itemId: "i" }).success).toBe(false);
});
it("parses attempts queries", () => {
  expect(attemptsQuerySchema.parse({})).toEqual({ limit: 50 });
  expect(attemptsQuerySchema.parse({ packageId: "p", kind: "quiz", refId: "q", limit: "20" })).toEqual({ packageId: "p", kind: "quiz", refId: "q", limit: 20 });
  expect(attemptsQuerySchema.safeParse({ refId: "q" }).error?.issues[0]).toMatchObject({ path: ["refId"], message: "refId needs kind quiz or game" });
  for (const q of [{ kind: "exercise", refId: "q" }, { bogus: "1" }, { limit: "0" }, { limit: "201" }, { limit: "abc" }])
    expect(attemptsQuerySchema.safeParse(q).success).toBe(false);
});
it("keeps progress and grade bodies strict", () => {
  expect(progressRequestSchema.safeParse({ status: "completed" }).success).toBe(true);
  for (const b of [{ status: "done" }, { status: "completed", x: 1 }, null]) expect(progressRequestSchema.safeParse(b).success).toBe(false);
  const grade = { packageId: "p", itemId: "c", direction: "back", rating: "good" };
  expect(gradeRequestSchema.safeParse(grade).success).toBe(true);
  for (const b of [{ ...grade, rating: "perfect" }, { ...grade, itemId: 5 }, { ...grade, direction: "up" }, { ...grade, x: 1 }, { ...grade, packageId: "x".repeat(65) }])
    expect(gradeRequestSchema.safeParse(b).success).toBe(false);
});

it("bounds every game play list and matching text at the request boundary", () => {
  for (const template of ["timed-round", "order-it"]) {
    const itemIds = Array.from({ length: 200 }, (_, k) => `i${k}`);
    const answers = itemIds.map((itemId) => ({ itemId, answer: ex.answer }));
    expect(gamePlaySchema.safeParse({ template, itemIds, answers }).success).toBe(true);
    expect(gamePlaySchema.safeParse({ template, itemIds: [...itemIds, "extra"], answers }).success).toBe(false);
    expect(gamePlaySchema.safeParse({ template, itemIds, answers: [...answers, answers[0]] }).success).toBe(false);
  }
  const lefts = Array.from({ length: 200 }, (_, k) => `left${k}`);
  const picks = Array.from({ length: 2000 }, () => ({ left: "a", right: "b" }));
  expect(gamePlaySchema.safeParse({ template: "matching", lefts, picks }).success).toBe(true);
  expect(gamePlaySchema.safeParse({ template: "matching", lefts: [...lefts, "extra"], picks }).success).toBe(false);
  expect(gamePlaySchema.safeParse({ template: "matching", lefts, picks: [...picks, picks[0]] }).success).toBe(false);
  expect(gamePlaySchema.safeParse({ template: "matching", lefts: ["a".repeat(2001)], picks: [] }).success).toBe(false);
  expect(matchPickSchema.safeParse({ left: "a".repeat(2000), right: "b".repeat(2000) }).success).toBe(true);
  expect(matchPickSchema.safeParse({ left: "a", right: "b".repeat(2001) }).success).toBe(false);
  expect(gameSubmissionSchema.safeParse({ ...game, elapsedSeconds: 86400 }).success).toBe(true);
  for (const elapsedSeconds of [-1, 1.5, 86401])
    expect(gameSubmissionSchema.safeParse({ ...game, elapsedSeconds }).success).toBe(false);
});

it("rejects unknown fields on nested quiz answers and both move shapes", () => {
  expect(quizSubmissionSchema.safeParse({ ...quiz, answers: [{ itemId: "i", answer: null, typo: true }] }).success).toBe(false);
  expect(gameMoveSchema.safeParse({ itemId: "i", answer: ex.answer, typo: true }).success).toBe(false);
  expect(gameMoveSchema.safeParse({ left: "a", right: "b", typo: true }).success).toBe(false);
});
