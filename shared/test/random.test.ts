import { describe, expect, it } from "vitest";
import { scramble, shuffle } from "../src/index.js";

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

describe("shuffle and scramble", () => {
  it("shuffles with a descending Fisher–Yates", () => {
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
    expect(shuffle([1, 2, 3], () => 0.999)).toEqual([1, 2, 3]);
  });
  it("returns a permutation and leaves the input alone", () => {
    const input = [5, 1, 4, 2, 3];
    for (let s = 1; s <= 50; s++) expect([...shuffle(input, seeded(s))].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([5, 1, 4, 2, 3]);
  });
  it("scramble swaps the first two when the shuffle comes out unchanged", () => {
    expect(scramble([1, 2, 3], () => 0.999)).toEqual([2, 1, 3]);
    expect(scramble([7], () => 0.999)).toEqual([7]);
    expect(scramble([], () => 0.999)).toEqual([]);
  });
  it("scramble never returns the identity for lengths 2–7", () => {
    for (let n = 2; n <= 7; n++) for (let s = 1; s <= 200; s++) {
      const xs = [...Array(n).keys()];
      expect(scramble(xs, seeded(s))).not.toEqual(xs);
    }
  });
});
