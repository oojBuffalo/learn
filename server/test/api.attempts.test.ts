import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { Db } from "../src/db.js";
import { PLAY_FILES, makeZip } from "./helpers.js";

let db: Db;
let dir: string;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "study-"));
  db = openDb(dir);
  app = createApp(db);
  expect((await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(PLAY_FILES)) })).status).toBe(201);
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
const send = (path: string, body: unknown) => app.request(path, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const attemptCount = () => (db.prepare("SELECT COUNT(*) n FROM attempts").get() as { n: number }).n;

const attempt = (body: unknown) => send("/api/attempts", body);
const QUIZ_IDS = ["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"];
const RIGHT: Record<string, unknown> = {
  mc1: { type: "multiple-choice", optionId: "a" }, ms1: { type: "multi-select", optionIds: ["a", "b"] },
  fb1: { type: "fill-blank", answers: { "1": "salt", "2": "pepper" } }, sa1: { type: "short-answer", text: "yes" },
  ord1: { type: "ordering", orderedIds: ["s1", "s2", "s3"] },
  mat1: { type: "matching", pairs: [{ left: "cat", right: "meow" }, { left: "dog", right: "woof" }, { left: "cow", right: "moo" }] },
};
const quizBody = (answers: Record<string, unknown>, elapsedSeconds = 42) => ({
  kind: "quiz", packageId: "demo", quizId: "quiz-all", elapsedSeconds,
  answers: QUIZ_IDS.map((itemId) => ({ itemId, answer: answers[itemId] ?? null })),
});
const lastAttempt = () => db.prepare("SELECT kind, ref_id, item_id, correct, score, answer FROM attempts ORDER BY id DESC")
  .get() as { kind: string; ref_id: string | null; item_id: string | null; correct: number | null; score: number; answer: string };

describe("quiz submissions", () => {
  it("scores a full run and logs one quiz row with its run record", async () => {
    const body = quizBody(RIGHT);
    const res = await attempt(body);
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toMatchObject({ score: 1, correctCount: 6, answeredCount: 6, total: 6,
      passThreshold: 0.5, passed: true, timedOut: false, elapsedSeconds: 42 });
    expect(result.results.map((r: { itemId: string }) => r.itemId)).toEqual(QUIZ_IDS);
    expect(lastAttempt()).toMatchObject({ kind: "quiz", ref_id: "quiz-all", item_id: null, correct: 1, score: 1 });
    const record = JSON.parse(lastAttempt().answer);
    expect(record).toMatchObject({ v: 1, correctCount: 6, answeredCount: 6, total: 6, passThreshold: 0.5, timedOut: false, elapsedSeconds: 42 });
    expect(record.answers).toEqual(body.answers);
    expect(record.results[0]).toEqual({ itemId: "mc1", answered: true, correct: true, score: 1 });
    expect(attemptCount()).toBe(1);
  });
  it("scores nulls as 0 without checking them, and still returns their key", async () => {
    const result = await (await attempt(quizBody({ mc1: RIGHT.mc1, ms1: { type: "multi-select", optionIds: ["a"] },
      fb1: { type: "fill-blank", answers: { "1": "salt", "2": "" } }, sa1: RIGHT.sa1 }))).json();
    expect(result).toMatchObject({ score: 0.5, passed: true, correctCount: 2, answeredCount: 4 });
    expect(result.results[4]).toEqual({ itemId: "ord1", answered: false, correct: false, score: 0, expected: ["s1", "s2", "s3"] });
    expect(await (await attempt(quizBody({}))).json()).toMatchObject({ score: 0, passed: false, answeredCount: 0 });
    expect(lastAttempt().correct).toBe(0);
  });
  it("gives passed null and correct NULL for a quiz with no threshold", async () => {
    const res = await attempt({ kind: "quiz", packageId: "demo", quizId: "quiz-plain", elapsedSeconds: 5,
      answers: [{ itemId: "mc1", answer: { type: "multiple-choice", optionId: "b" } }] });
    expect(await res.json()).toMatchObject({ score: 0, passThreshold: null, passed: null });
    expect(lastAttempt()).toMatchObject({ ref_id: "quiz-plain", correct: null, score: 0 });
  });
  it("clamps elapsed time to the limit and marks the run timed out", async () => {
    expect(await (await attempt(quizBody(RIGHT, 75))).json()).toMatchObject({ score: 1, elapsedSeconds: 60, timedOut: true });
    expect(JSON.parse(lastAttempt().answer)).toMatchObject({ elapsedSeconds: 60, timedOut: true });
  });
  it("rejects bad quiz runs without writing a row", async () => {
    const body = quizBody({}, 10);
    const a = body.answers;
    const cases: [unknown, number][] = [
      [{ ...body, answers: a.slice(0, 5) }, 422],                                   // mat1 missing
      [{ ...body, answers: [...a, { itemId: "mc1", answer: null }] }, 422],          // mc1 twice
      [{ ...body, answers: [...a, { itemId: "card1", answer: null }] }, 422],        // not in the quiz
      [{ ...body, answers: [{ itemId: "mc1", answer: { type: "multiple-choice", optionId: "z" } }, ...a.slice(1)] }, 422],
      [{ ...body, answers: [...a.slice(0, 3), { itemId: "sa1", answer: { type: "short-answer", text: "y".repeat(201) } }, ...a.slice(4)] }, 400],
      [{ ...body, itemId: "mc1" }, 400], [{ ...body, quizId: "x".repeat(65) }, 400],
      [{ ...body, elapsedSeconds: -1 }, 400], [{ ...body, elapsedSeconds: 86401 }, 400],
      [{ ...body, quizId: "ghost" }, 404],
    ];
    for (const [b, status] of cases) expect((await attempt(b)).status).toBe(status);
    expect((await (await attempt(cases[0]![0])).json()).error)
      .toEqual({ code: "not_checkable", message: "quiz answers must list every quiz item exactly once" });
    expect(attemptCount()).toBe(0);
  });
  it("404s an exercise or a quiz in an unknown item or package, writing nothing", async () => {
    const cases: [unknown, string][] = [
      [{ packageId: "demo", itemId: "ghost", answer: RIGHT.mc1 }, "unknown item"],
      [{ packageId: "other", itemId: "mc1", answer: RIGHT.mc1 }, "unknown item"],
      [{ ...quizBody({}), packageId: "other" }, "unknown quiz"],
    ];
    for (const [b, message] of cases) {
      const res = await attempt(b);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toEqual({ code: "not_found", message });
    }
    expect(attemptCount()).toBe(0);
  });
  it("422s an exercise or a quiz whose stored regex is hazardous, writing nothing", async () => {
    // Import now refuses such a pattern (Task 2), so plant it the way a row imported before Stage 2 could hold it.
    db.prepare("UPDATE items SET data = ? WHERE package_id = 'demo' AND id = 'sa1'").run(JSON.stringify(
      { id: "sa1", type: "short-answer", prompt: "Say yes", match: "regex", accept: ["^yes$", "(a+)+$"] }));
    const exercise = await attempt({ packageId: "demo", itemId: "sa1", answer: RIGHT.sa1 });
    expect(exercise.status).toBe(422);
    expect((await exercise.json()).error).toEqual({ code: "not_checkable", message: "unsafe regular expression" });
    expect((await attempt(quizBody({ sa1: RIGHT.sa1 }))).status).toBe(422);
    expect(attemptCount()).toBe(0);
  });
});

const SMALL_PLAY = { template: "matching", lefts: ["cat", "dog"],
  picks: [{ left: "cat", right: "woof" }, { left: "cat", right: "meow" }, { left: "dog", right: "woof" }] };
const gameBody = (gameId: string, play: unknown, elapsedSeconds = 30) =>
  ({ kind: "game", packageId: "demo", gameId, play, elapsedSeconds });
const speedPlay = (answers: unknown[]) => ({ template: "timed-round", itemIds: ["ms1", "mc1"], answers });

describe("game submissions", () => {
  it("scores a matching play as matched / (dealt + misses) and logs one game row", async () => {
    const res = await attempt(gameBody("g-small", SMALL_PLAY));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toMatchObject({ template: "matching", correctCount: 2, total: 2, mistakes: 1,
      completed: true, timedOut: false, elapsedSeconds: 30 });
    expect(result.score).toBeCloseTo(2 / 3);
    const row = lastAttempt();
    expect(row).toMatchObject({ kind: "game", ref_id: "g-small", item_id: null, correct: null });
    expect(row.score).toBeCloseTo(2 / 3);
    expect(JSON.parse(row.answer)).toEqual({ v: 1, template: "matching", play: SMALL_PLAY, correctCount: 2,
      total: 2, mistakes: 1, completed: true, timedOut: false, elapsedSeconds: 30 });
  });
  it("scores timed-round and order-it answers through checkAnswer", async () => {
    const speed = await (await attempt(gameBody("g-speed", speedPlay([{ itemId: "mc1", answer: RIGHT.mc1 },
      { itemId: "ms1", answer: { type: "multi-select", optionIds: ["a"] } }])))).json();
    expect(speed).toMatchObject({ template: "timed-round", score: 0.75, correctCount: 1, total: 2, mistakes: 1, completed: true });
    const late = await (await attempt(gameBody("g-speed", speedPlay([{ itemId: "mc1", answer: RIGHT.mc1 }]), 61))).json();
    expect(late).toMatchObject({ score: 0.5, completed: false, timedOut: true, elapsedSeconds: 60, mistakes: 0 });
    const order = await (await attempt(gameBody("g-order", { template: "order-it", itemIds: ["ord1"],
      answers: [{ itemId: "ord1", answer: { type: "ordering", orderedIds: ["s1", "s3", "s2"] } }] }))).json();
    expect(order).toMatchObject({ template: "order-it", correctCount: 0, total: 1, mistakes: 1, completed: true });
    expect(order.score).toBeCloseTo(1 / 3);
  });
  it("rejects illegal plays without writing a row", async () => {
    const cases: [unknown, number][] = [
      [gameBody("g-small", { ...SMALL_PLAY, lefts: ["cat"] }), 422],                         // deals 1, not 2
      [gameBody("g-small", { ...SMALL_PLAY, lefts: ["cat", "dog", "cow"] }), 422],           // deals 3
      [gameBody("g-small", { ...SMALL_PLAY, lefts: ["cat", "cat"] }), 422],                  // repeated unit
      [gameBody("g-small", { ...SMALL_PLAY, lefts: ["cat", "sheep"] }), 422],                // not in the pool
      [gameBody("g-small", { ...SMALL_PLAY, picks: [{ left: "cow", right: "moo" }] }), 422], // undealt left
      [gameBody("g-small", { ...SMALL_PLAY, picks: [{ left: "cat", right: "meow" }, { left: "cat", right: "meow" }] }), 422],
      [gameBody("g-speed", speedPlay([{ itemId: "mc1", answer: RIGHT.mc1 }, { itemId: "mc1", answer: RIGHT.mc1 }])), 422],
      [gameBody("g-speed", speedPlay([{ itemId: "card1", answer: { type: "short-answer", text: "x" } }])), 422],
      [gameBody("g-small", { template: "timed-round", itemIds: ["mat1"], answers: [] }), 422], // template mismatch
      [gameBody("ghost", SMALL_PLAY), 404],
      [{ kind: "game", packageId: "demo", gameId: "g-small", elapsedSeconds: 30 }, 400],
      [gameBody("g-small", SMALL_PLAY, -1), 400],
    ];
    for (const [b, status] of cases) expect((await attempt(b)).status).toBe(status);
    expect(attemptCount()).toBe(0);
  });
});

describe("attempt history", () => {
  const history = async (query = "") => {
    const res = await app.request(`/api/attempts${query}`);
    expect(res.status).toBe(200);
    return (await res.json()).attempts as { id: number; kind: string }[];
  };
  const kinds = async (query = "") => (await history(query)).map((a) => a.kind);
  const importZip = (files: Record<string, string | Buffer>) =>
    app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(files)) });
  beforeEach(async () => {
    for (const body of [{ packageId: "demo", itemId: "mc1", answer: RIGHT.mc1 }, quizBody(RIGHT),
      quizBody({}, 75), gameBody("g-small", SMALL_PLAY)]) expect((await attempt(body)).status).toBe(200);
  });

  it("lists visible attempts newest first", async () => {
    const all = await history();
    expect(all.map((a) => a.kind)).toEqual(["game", "quiz", "quiz", "exercise"]);
    expect(all.map((a) => a.id)).toEqual(all.map((a) => a.id).sort((x, y) => y - x));
  });
  it("filters by package, kind, refId and limit", async () => {
    expect(await kinds("?packageId=demo")).toHaveLength(4);
    expect(await kinds("?packageId=other")).toEqual([]);
    expect(await kinds("?kind=quiz&refId=quiz-all")).toEqual(["quiz", "quiz"]);
    expect(await kinds("?kind=quiz&refId=quiz-plain")).toEqual([]);
    expect(await kinds("?kind=game&refId=g-small")).toEqual(["game"]);
    expect(await kinds("?kind=exercise")).toEqual(["exercise"]);
    expect(await kinds("?limit=1")).toEqual(["game"]);
  });
  it("maps rows to summary records and never returns raw answers", async () => {
    const [game, timedOut, quiz, exercise] = await history();
    expect(exercise).toEqual({ id: expect.any(Number), kind: "exercise", packageId: "demo", itemId: "mc1",
      correct: true, score: 1, at: expect.any(String) });
    expect(quiz).toEqual({ id: expect.any(Number), kind: "quiz", packageId: "demo", quizId: "quiz-all", score: 1,
      passed: true, correctCount: 6, total: 6, timedOut: false, elapsedSeconds: 42, at: expect.any(String) });
    expect(timedOut).toMatchObject({ score: 0, passed: false, correctCount: 0, timedOut: true, elapsedSeconds: 60 });
    expect(game).toEqual({ id: expect.any(Number), kind: "game", packageId: "demo", gameId: "g-small",
      template: "matching", score: expect.closeTo(2 / 3, 5), correctCount: 2, total: 2, mistakes: 1,
      completed: true, timedOut: false, elapsedSeconds: 30, at: expect.any(String) });
  });
  it("400s invalid filters", async () => {
    for (const q of ["?refId=quiz-all", "?kind=exercise&refId=mc1", "?foo=1", "?kind=bogus",
      "?limit=0", "?limit=201", "?packageId=bad%20id"]) {
      const res = await app.request(`/api/attempts${q}`);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
  });
  it("hides runs whose content is gone and shows them again on re-import, deleting nothing", async () => {
    expect((await app.request("/api/packages/demo", { method: "DELETE" })).status).toBe(204);
    expect(await kinds()).toEqual([]);
    expect(attemptCount()).toBe(4);
    await importZip(PLAY_FILES);
    expect(await kinds()).toEqual(["game", "quiz", "quiz", "exercise"]);
    const quizzes = JSON.parse(PLAY_FILES["quizzes.json"] as string).filter((q: { id: string }) => q.id !== "quiz-all");
    await importZip({ ...PLAY_FILES, "quizzes.json": JSON.stringify(quizzes) });
    expect(await kinds()).toEqual(["game", "exercise"]);
    expect(attemptCount()).toBe(4);
    await importZip(PLAY_FILES);
    expect(await kinds()).toEqual(["game", "quiz", "quiz", "exercise"]);
  });
});
