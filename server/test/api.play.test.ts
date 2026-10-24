import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Db } from "../src/db.js";
import { freshDb, makeZip, PLAY_FILES } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  db = freshDb();
  app = createApp(db);
  const res = await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(PLAY_FILES)) });
  expect(res.status).toBe(201);
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("quiz and game reads", () => {
  it("returns a quiz with its whole items keyed by id, in quiz order", async () => {
    const res = await app.request("/api/quizzes/demo/quiz-all");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quiz).toMatchObject({ id: "quiz-all", passThreshold: 0.5, timeLimitSeconds: 60 });
    expect(Object.keys(body.items)).toEqual(["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"]);
    expect(body.items.mc1.options[0]).toEqual({ id: "a", text: "A", correct: true });
  });
  it("returns each game's effective settings and pool", async () => {
    const get = async (id: string) => (await app.request(`/api/games/demo/${id}`)).json();
    const match = await get("g-match");
    expect(match.game.id).toBe("g-match");
    expect(match.settings).toEqual({ roundSize: 6, timeLimitSeconds: null });
    expect(ids(match.items)).toEqual(["mat1", "mat2"]);
    const speed = await get("g-speed");
    expect(speed.settings).toEqual({ roundSize: 10, timeLimitSeconds: 60 });
    expect(ids(speed.items)).toEqual(["mc1", "ms1"]);
    expect((await get("g-order")).settings).toEqual({ roundSize: 3, timeLimitSeconds: null });
  });
  it("reports g-small's authored roundSize", async () => {
    const small = await (await app.request("/api/games/demo/g-small")).json();
    expect(small.settings).toEqual({ roundSize: 2, timeLimitSeconds: null });
    expect(ids(small.items)).toEqual(["mat1"]);
  });
  it("404s unknown quizzes and games", async () => {
    const cases: [string, string][] = [
      ["/api/quizzes/demo/ghost", "unknown quiz"], ["/api/quizzes/other/quiz-all", "unknown quiz"],
      ["/api/games/demo/ghost", "unknown game"], ["/api/games/other/g-match", "unknown game"]];
    for (const [path, message] of cases) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toEqual({ code: "not_found", message });
    }
  });
});
afterEach(() => db?.close());

const send = (path: string, body: unknown) => app.request(path, {
  method: "POST", headers: { "content-type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const attemptCount = () => (db.prepare("SELECT COUNT(*) n FROM attempts").get() as { n: number }).n;

describe("game move checks", () => {
  const check = (gameId: string, move: unknown) => send(`/api/games/demo/${gameId}/check`, move);
  it("judges a matching pick without revealing the pair", async () => {
    expect(await (await check("g-match", { left: "cat", right: "meow" })).json()).toEqual({ correct: true });
    expect(await (await check("g-match", { left: "cat", right: "woof" })).json()).toEqual({ correct: false });
    expect(await (await check("g-match", { left: "cat", right: "quack" })).json()).toEqual({ correct: false });
    expect(attemptCount()).toBe(0);
  });
  it("checks a timed-round answer through checkAnswer", async () => {
    const mc = await check("g-speed", { itemId: "mc1", answer: { type: "multiple-choice", optionId: "a" } });
    expect(mc.status).toBe(200);
    expect(await mc.json()).toMatchObject({ correct: true, score: 1, expected: "a" });
    const ms = await check("g-speed", { itemId: "ms1", answer: { type: "multi-select", optionIds: ["a"] } });
    expect(await ms.json()).toMatchObject({ correct: false, score: 0.5, expected: ["a", "b"] });
    expect(attemptCount()).toBe(0);
  });
  it("422s moves outside the pool or of the wrong shape", async () => {
    const cases: [string, unknown][] = [
      ["g-match", { left: "bird", right: "meow" }],                                  // unknown left
      ["g-small", { left: "sheep", right: "baa" }],                                  // left outside this pool
      ["g-match", { itemId: "mat1", answer: { type: "matching", pairs: [] } }],       // item move on matching
      ["g-speed", { itemId: "card1", answer: { type: "short-answer", text: "x" } }], // not in the pool
      ["g-speed", { left: "cat", right: "meow" }],                                   // pick on timed-round
    ];
    for (const [gameId, move] of cases) {
      const res = await check(gameId, move);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("not_checkable");
    }
    const right = await check("g-small", { left: "cat", right: "baa" }); // mat2's right, not g-small's
    expect(right.status).toBe(422);
    expect((await right.json()).error.message).toMatch(/unknown matching choice/);
    expect(attemptCount()).toBe(0);
  });
  it("400s malformed moves before looking up the game", async () => {
    for (const move of ["{not json", "null", { left: "cat" }, { left: "cat", right: "meow", extra: 1 },
      { left: "x".repeat(2001), right: "meow" }, { itemId: "sa1", answer: { type: "short-answer", text: "y".repeat(201) } }]) {
      const res = await check("g-match", move);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
    expect((await check("ghost", { left: "cat" })).status).toBe(400);
  });
  it("404s an unknown game", async () => {
    const res = await check("ghost", { left: "cat", right: "meow" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({ code: "not_found", message: "unknown game" });
  });
});
