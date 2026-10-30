import { describe, expect, it } from "vitest";
import type { Game, Item } from "../src/index.js";
import {
  GAME_DEFAULTS,
  MAX_MATCH_DISTRACTORS,
  gameSettings,
  matchingPairs,
  resolveGameItems,
  roundSizeFor,
  unitCount,
} from "../src/index.js";

/** A deterministic mulberry32 PRNG, so a failing seed can be replayed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mc1: Item = {
  id: "mc1", type: "multiple-choice", prompt: "?", tags: ["t"],
  options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }],
};
const card1: Item = { id: "card1", type: "flashcard", tags: ["t"], front: "f", back: "b" };
const ms1: Item = {
  id: "ms1", type: "multi-select", prompt: "?", tags: ["t"], partialCredit: true,
  options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B", correct: true }, { id: "c", text: "C" }],
};
const mc2: Item = {
  id: "mc2", type: "multiple-choice", prompt: "?", tags: ["u"],
  options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }],
};
const ord1: Item = {
  id: "ord1", type: "ordering", prompt: "?",
  steps: [{ id: "s1", text: "One" }, { id: "s2", text: "Two" }, { id: "s3", text: "Three" }],
};
const mat1: Item = {
  id: "mat1", type: "matching", prompt: "?", tags: ["m"],
  pairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }, { left: "c", right: "3" }],
  distractors: ["1", "x", "y", "z"],
};
const mat2: Item = {
  id: "mat2", type: "matching", prompt: "?", tags: ["m", "t"],
  pairs: [{ left: "d", right: "4" }, { left: "a", right: "9" }],
};
const ITEMS: Item[] = [mc1, card1, ms1, mc2, ord1, mat1, mat2];

const game = (template: Game["template"], source: Game["source"], settings?: Game["settings"]): Game =>
  ({ id: "g", title: "G", template, source, settings });
const pool = (g: Game) => resolveGameItems(g, ITEMS);
const ids = (g: Game) => pool(g).map((i) => i.id);
const gMatch = game("matching", { itemIds: ["mat1"] }), gMatchM = game("matching", { tags: ["m"] }),
  gMatchSmall = game("matching", { itemIds: ["mat1"] }, { roundSize: 2 }), gSpeed = game("timed-round", { itemIds: ["mc1", "ms1"] }),
  gSpeed2 = game("timed-round", { itemIds: ["mc1", "ms1", "mc2"] }, { roundSize: 2 }), gOrder = game("order-it", { itemIds: ["ord1"] });

describe("game sources", () => {
  it("resolves itemIds in listed order, first occurrence, dropping missing and incompatible ids", () =>
    expect(ids(game("timed-round", { itemIds: ["ms1", "ghost", "mc1", "ms1", "card1", "ord1"] }))).toEqual(["ms1", "mc1"]));
  it("resolves tags by any matching tag, in items order", () => {
    expect(ids(game("timed-round", { tags: ["u", "t"] }))).toEqual(["mc1", "ms1", "mc2"]);
    expect(ids(gMatchM)).toEqual(["mat1", "mat2"]);
    expect(ids(game("order-it", { itemIds: ["ord1", "mc1"] }))).toEqual(["ord1"]);
  });
  it("overlays settings on the template defaults field by field", () => {
    expect(GAME_DEFAULTS).toEqual({ matching: { roundSize: 6, timeLimitSeconds: null },
      "timed-round": { roundSize: 10, timeLimitSeconds: 60 }, "order-it": { roundSize: 3, timeLimitSeconds: null } });
    expect(MAX_MATCH_DISTRACTORS).toBe(2);
    expect(gameSettings(gMatch)).toEqual({ roundSize: 6, timeLimitSeconds: null });
    expect(gameSettings(game("timed-round", { tags: ["t"] }, { timeLimitSeconds: 30 }))).toEqual({ roundSize: 10, timeLimitSeconds: 30 });
    expect(gameSettings(game("order-it", { tags: ["t"] }, { roundSize: 5 }))).toEqual({ roundSize: 5, timeLimitSeconds: null });
  });
  it("pools pairs across items, keeping the first pair for a repeated left", () =>
    expect(matchingPairs(pool(gMatchM))).toEqual([{ itemId: "mat1", left: "a", right: "1" }, { itemId: "mat1", left: "b", right: "2" },
      { itemId: "mat1", left: "c", right: "3" }, { itemId: "mat2", left: "d", right: "4" }]));
  it("counts units and caps the round size by them", () => {
    expect(unitCount(gMatchM, pool(gMatchM))).toBe(4);
    expect(unitCount(gSpeed2, pool(gSpeed2))).toBe(3);
    expect([gMatchM, gMatchSmall, gSpeed, gSpeed2, gOrder].map((g) => roundSizeFor(g, pool(g)))).toEqual([4, 2, 2, 2, 1]);
  });
});
