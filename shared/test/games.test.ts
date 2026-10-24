import { describe, expect, it } from "vitest";
import type { Game, GamePlay, Item } from "../src/index.js";
import {
  GAME_DEFAULTS,
  scoreGame,
  dealGame,
  checkGameMove,
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

function matchDeal(g: Game, seed: number) {
  const d = dealGame(g, pool(g), seeded(seed));
  if (d.template !== "matching") throw new Error("expected matching deal");
  return d;
}
function itemDeal(g: Game, seed: number) {
  const d = dealGame(g, pool(g), seeded(seed));
  if (d.template === "matching") throw new Error("expected item deal");
  return d;
}
it("deals min(roundSize, units) distinct units", () => {
  const all = matchDeal(gMatchM, 1);
  expect([...all.lefts].sort()).toEqual(["a", "b", "c", "d"]);
  expect(all.rights).toHaveLength(6);                           // 4 rights + 2 of x/y/z
  expect(new Set(matchDeal(gMatchSmall, 1).lefts).size).toBe(2);
  const two = itemDeal(gSpeed2, 1).itemIds;
  expect(new Set(two).size).toBe(2);
  expect(two.every((id) => ["mc1", "ms1", "mc2"].includes(id))).toBe(true);
  expect([...itemDeal(gSpeed, 1).itemIds].sort()).toEqual(["mc1", "ms1"]);
  expect(dealGame(gOrder, pool(gOrder), seeded(1))).toEqual({ template: "order-it", itemIds: ["ord1"] });
});
it("adds at most 2 distractors and never one equal to a dealt right", () => {
  for (let s = 1; s <= 50; s++) {
    const all = matchDeal(gMatch, s);                            // all 3 pairs dealt, so "1" is a dealt right
    expect(all.rights).toHaveLength(5);
    expect(all.rights.filter((r) => r === "1")).toHaveLength(1);
    const two = matchDeal(gMatchSmall, s);
    const dealt = two.lefts.map((l) => ({ a: "1", b: "2", c: "3" })[l as "a" | "b" | "c"]);
    const extras = [...two.rights];
    for (const r of dealt) extras.splice(extras.indexOf(r), 1);
    expect(extras).toHaveLength(2);
    expect(extras.some((e) => dealt.includes(e))).toBe(false);
  }
});
it("takes distractors only from the dealt pairs' items", () => {
  const one = game("matching", { tags: ["m"] }, { roundSize: 1 });
  let dealtD = 0;
  for (let s = 1; s <= 50; s++) {
    const d = matchDeal(one, s);
    if (d.lefts[0] === "d") { dealtD++; expect(d.rights).toEqual(["4"]); } else expect(d.rights).toHaveLength(3);
  }
  expect(dealtD).toBeGreaterThan(0);
});
it("keeps repeated right texts as separate tiles", () => {
  const dup: Item = { id: "dup", type: "matching", prompt: "?", pairs: [{ left: "p", right: "same" }, { left: "q", right: "same" }] };
  const g = game("matching", { itemIds: ["dup"] });
  expect(dealGame(g, resolveGameItems(g, [dup]), seeded(3))).toMatchObject({ rights: ["same", "same"] });
});
it("deals the same round for the same random", () =>
  expect(dealGame(gMatchM, pool(gMatchM), seeded(7))).toEqual(dealGame(gMatchM, pool(gMatchM), seeded(7))));
it("checks a matching pick without revealing the pair", () => {
  const p = pool(gMatchM);
  expect(checkGameMove(gMatchM, p, { left: "a", right: "1" })).toEqual({ correct: true });
  expect(checkGameMove(gMatchM, p, { left: "a", right: "2" })).toEqual({ correct: false });
  expect(checkGameMove(gMatchM, p, { left: "a", right: "x" })).toEqual({ correct: false });  // authored distractor
  expect(checkGameMove(gMatchM, p, { left: "a", right: "9" })).toEqual({ correct: false });  // right of the shadowed mat2 pair
  expect(() => checkGameMove(gMatchM, p, { left: "zz", right: "1" })).toThrow('unknown matching left "zz"');
  expect(() => checkGameMove(gMatchM, p, { left: "a", right: "nope" })).toThrow('unknown matching choice "nope"');
  expect(() => checkGameMove(gMatchM, p, { itemId: "mat1", answer: { type: "matching", pairs: [] } }))
    .toThrow("matching games take { left, right } picks");
});
it("checks an item move with checkAnswer", () => {
  const optionA = { type: "multiple-choice", optionId: "a" } as const;
  expect(checkGameMove(gSpeed, pool(gSpeed), { itemId: "mc1", answer: optionA })).toMatchObject({ correct: true, score: 1, expected: "a" });
  expect(checkGameMove(gOrder, pool(gOrder), { itemId: "ord1", answer: { type: "ordering", orderedIds: ["s1", "s2", "s3"] } }))
    .toMatchObject({ correct: true, score: 1 });
  expect(() => checkGameMove(gSpeed, pool(gSpeed), { itemId: "card1", answer: optionA })).toThrow('item "card1" is not in this game');
  expect(() => checkGameMove(gSpeed, pool(gSpeed), { left: "a", right: "1" })).toThrow("timed-round games take { itemId, answer } moves");
});

const pick = (left: string, right: string) => ({ left, right });
const mPlay = (lefts: string[], picks: { left: string; right: string }[]): GamePlay => ({ template: "matching", lefts, picks });
const mcA = { itemId: "mc1", answer: { type: "multiple-choice" as const, optionId: "a" } };
const perfect = mPlay(["a", "b", "c"], [pick("a", "1"), pick("b", "2"), pick("c", "3")]);

it("scores matching as matched / (dealt + mistakes)", () => {
  expect(scoreGame(gMatch, pool(gMatch), mPlay(["b", "a", "c"], [pick("a", "2"), pick("a", "1"), pick("b", "2"), pick("c", "3")]), 42))
    .toEqual({ template: "matching", score: 0.75, correctCount: 3, total: 3, mistakes: 1, completed: true, timedOut: false, elapsedSeconds: 42 });
  expect(scoreGame(gMatch, pool(gMatch), perfect, 9)).toMatchObject({ score: 1, mistakes: 0, completed: true });
  expect(scoreGame(gMatch, pool(gMatch), mPlay(["a", "b", "c"], [pick("a", "x"), pick("a", "1"), pick("b", "2")]), 9))
    .toMatchObject({ score: 0.5, correctCount: 2, mistakes: 1, completed: false });
});
it("clamps elapsed time to the limit and never scores time", () => {
  const timed = { ...gMatch, settings: { timeLimitSeconds: 30 } };
  expect(scoreGame(timed, pool(timed), perfect, 45)).toMatchObject({ score: 1, elapsedSeconds: 30, timedOut: true });
  expect(scoreGame(timed, pool(timed), perfect, 30)).toMatchObject({ elapsedSeconds: 30, timedOut: true });
  expect(scoreGame(timed, pool(timed), perfect, 29)).toMatchObject({ elapsedSeconds: 29, timedOut: false });
  expect(scoreGame(gMatch, pool(gMatch), perfect, 400)).toMatchObject({ elapsedSeconds: 400, timedOut: false });
});
it("keeps multi-select partial credit in a timed round", () =>
  expect(scoreGame(gSpeed, pool(gSpeed), { template: "timed-round", itemIds: ["ms1", "mc1"],
    answers: [{ itemId: "ms1", answer: { type: "multi-select", optionIds: ["a"] } }, mcA] }, 61))
    .toEqual({ template: "timed-round", score: 0.75, correctCount: 1, total: 2, mistakes: 1, completed: true, timedOut: true, elapsedSeconds: 60 }));
it("scores order-it by position and an unanswered item as 0", () => {
  const r = scoreGame(gOrder, pool(gOrder), { template: "order-it", itemIds: ["ord1"],
    answers: [{ itemId: "ord1", answer: { type: "ordering", orderedIds: ["s1", "s3", "s2"] } }] }, 5);
  expect(r.score).toBeCloseTo(1 / 3, 12);
  expect(r).toMatchObject({ correctCount: 0, mistakes: 1, completed: true });
  expect(scoreGame(gSpeed, pool(gSpeed), { template: "timed-round", itemIds: ["mc1", "ms1"], answers: [mcA] }, 5))
    .toMatchObject({ score: 0.5, correctCount: 1, mistakes: 0, completed: false });
});
it("rejects plays the deal could not have produced", () => {
  const cases: [Game, GamePlay, string][] = [
    [gSpeed, { template: "order-it", itemIds: ["mc1", "ms1"], answers: [] }, 'play template "order-it" does not match game template "timed-round"'],
    [gMatch, mPlay(["a", "b"], []), "the deal must hold 3 distinct units of this game"],
    [gMatch, mPlay(["a", "b", "q"], []), "the deal must hold 3 distinct units of this game"],
    [gSpeed, { template: "timed-round", itemIds: ["mc1", "mc1"], answers: [] }, "the deal must hold 2 distinct units of this game"],
    [gSpeed, { template: "timed-round", itemIds: ["mc1", "zz"], answers: [] }, "the deal must hold 2 distinct units of this game"],
    [gSpeed2, { template: "timed-round", itemIds: ["mc1", "ms1"], answers: [{ ...mcA, itemId: "mc2" }] }, 'answer for an undealt or already answered item "mc2"'],
    [gSpeed, { template: "timed-round", itemIds: ["mc1", "ms1"], answers: [mcA, mcA] }, 'answer for an undealt or already answered item "mc1"'],
    [gMatchSmall, mPlay(["a", "b"], [pick("c", "3")]), 'pick for an undealt or already matched left "c"'],
    [gMatch, mPlay(["a", "b", "c"], [pick("a", "1"), pick("a", "1")]), 'pick for an undealt or already matched left "a"'],
    [gMatch, mPlay(["a", "b", "c"], [pick("a", "nope")]), 'unknown matching choice "nope"'],
  ];
  for (const [g, play, message] of cases) expect(() => scoreGame(g, pool(g), play, 0)).toThrow(message);
});
it("accepts every genuine deal", () => {
  const rightOf = new Map(matchingPairs(pool(gMatchM)).map((p) => [p.left, p.right]));
  for (let s = 1; s <= 20; s++) {
    for (const g of [gMatchM, gMatchSmall]) {
      const d = matchDeal(g, s);
      expect(scoreGame(g, pool(g), mPlay(d.lefts, d.lefts.map((l) => pick(l, rightOf.get(l)!))), 0).score).toBe(1);
    }
    const d = itemDeal(gSpeed2, s);
    expect(scoreGame(gSpeed2, pool(gSpeed2), { template: "timed-round", itemIds: d.itemIds, answers: [] }, 0)).toMatchObject({ score: 0, total: 2 });
  }
});
