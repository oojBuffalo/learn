import { afterEach, expect, it, vi } from "vitest";
import { ApiError, isStale, getQuiz, getGame, checkMove, submitQuiz, submitGame, listAttempts, listExplanations, updateNote, createNote, setProgress, deleteNote, purgeOrphans } from "../src/api.js";
import type { GameSubmission, QuizSubmission } from "@study/shared";

afterEach(() => vi.unstubAllGlobals());

it("isStale is true only when a quiz or game vanished or changed", () => {
  expect(isStale(new ApiError("x", "not_found"))).toBe(true); expect(isStale(new ApiError("x", "not_checkable"))).toBe(true);
  expect(isStale(new ApiError("x", "invalid_request"))).toBe(false); expect(isStale(new Error("x"))).toBe(false);
});
it("reads play payloads and sends moves and submissions as JSON", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ accepted: true })));
  vi.stubGlobal("fetch", fetch);
  await getQuiz("demo", "quiz");
  expect(fetch).toHaveBeenLastCalledWith("/api/quizzes/demo/quiz", undefined);
  await getGame("demo", "game");
  expect(fetch).toHaveBeenLastCalledWith("/api/games/demo/game", undefined);
  const move = { left: "cat", right: "meow" };
  await checkMove("demo", "game", move);
  expect(fetch).toHaveBeenLastCalledWith("/api/games/demo/game/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(move) });
  const quiz: QuizSubmission = { kind: "quiz", packageId: "demo", quizId: "quiz", answers: [], elapsedSeconds: 0 };
  await submitQuiz(quiz);
  expect(fetch).toHaveBeenLastCalledWith("/api/attempts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(quiz) });
  const game: GameSubmission = { kind: "game", packageId: "demo", gameId: "game", play: { template: "matching", lefts: ["cat"], picks: [] }, elapsedSeconds: 0 };
  await submitGame(game);
  expect(fetch).toHaveBeenLastCalledWith("/api/attempts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(game) });
});
it("lists attempt summaries, omitting unset filters", async () => {
  const attempts = [{ id: 1, kind: "quiz", quizId: "quiz" }];
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ attempts })));
  vi.stubGlobal("fetch", fetch);
  expect(await listAttempts({ packageId: "demo", kind: "quiz", refId: undefined, limit: 20 })).toEqual(attempts);
  expect(fetch).toHaveBeenLastCalledWith("/api/attempts?packageId=demo&kind=quiz&limit=20", undefined);
});
it("asks for revisit prompts only when told to", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ explanations: [] }))); vi.stubGlobal("fetch", fetch);
  await listExplanations(); await listExplanations({ revisit: false }); await listExplanations({ revisit: true });
  expect(fetch.mock.calls.map((c) => c[0])).toEqual(["/api/explanations", "/api/explanations", "/api/explanations?revisit=1"]);
});
it("sends a note update as PATCH JSON", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ note: {} }))); vi.stubGlobal("fetch", fetch);
  await updateNote(3, { body: "x" }); expect(fetch).toHaveBeenCalledWith("/api/notes/3", { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"body":"x"}' });
});
it("still POSTs when no method is given", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ note: {} }))); vi.stubGlobal("fetch", fetch);
  await createNote({ body: "x", target: null }); await setProgress("p", "l", "completed");
  expect(fetch.mock.calls.map((c) => c[1].method)).toEqual(["POST", "POST"]);
});
it("resolves a 204 delete to undefined", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetch);
  await expect(deleteNote(3)).resolves.toBeUndefined(); expect(fetch).toHaveBeenCalledWith("/api/notes/3", { method: "DELETE" });
});
it("surfaces a stale purge as orphans_changed", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ error: { code: "orphans_changed", message: "m" } }), { status: 409 })));
  const req = { packageId: "p", includeWriting: false, expected: { cardState: 0, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 } };
  await expect(purgeOrphans(req)).rejects.toBeInstanceOf(ApiError); await expect(purgeOrphans(req)).rejects.toMatchObject({ code: "orphans_changed" });
});
