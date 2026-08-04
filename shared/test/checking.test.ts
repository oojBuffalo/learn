import { describe, expect, it } from "vitest";
import type { Item } from "../src/index.js";
import { checkAnswer, fold } from "../src/index.js";

const mc: Item = {
  id: "m1", type: "multiple-choice", prompt: "?",
  options: [
    { id: "a", text: "A", correct: true },
    { id: "b", text: "B", feedback: "Nope — B is a distractor." },
  ],
};

describe("fold", () => {
  it("trims, lowercases, strips accents", () => {
    expect(fold("  Café ")).toBe("cafe");
  });
});

describe("checkAnswer", () => {
  it("multiple-choice: right and wrong, with per-option feedback", () => {
    expect(checkAnswer(mc, { type: "multiple-choice", optionId: "a" })).toMatchObject({ correct: true, score: 1 });
    const wrong = checkAnswer(mc, { type: "multiple-choice", optionId: "b" });
    expect(wrong).toMatchObject({ correct: false, score: 0, expected: "a", feedback: "Nope — B is a distractor." });
  });

  it("multi-select: exact set required unless partialCredit", () => {
    const ms: Item = {
      id: "s1", type: "multi-select", prompt: "?", partialCredit: true,
      options: [
        { id: "a", text: "A", correct: true },
        { id: "b", text: "B", correct: true },
        { id: "c", text: "C" },
      ],
    };
    expect(checkAnswer(ms, { type: "multi-select", optionIds: ["a", "b"] }).correct).toBe(true);
    const partial = checkAnswer(ms, { type: "multi-select", optionIds: ["a", "c"] });
    expect(partial.correct).toBe(false);
    expect(partial.score).toBe(0); // (1 right - 1 wrong) / 2 correct → 0
    const noPartial: Item = { ...ms, partialCredit: false };
    expect(checkAnswer(noPartial, { type: "multi-select", optionIds: ["a"] }).score).toBe(0);
  });

  it("fill-blank: per-blank accept lists, case sensitivity respected", () => {
    const fb: Item = {
      id: "f1", type: "fill-blank", prompt: "?", template: "{{1}} and {{2}}",
      blanks: [
        { slot: 1, accept: ["Paris"] },
        { slot: 2, accept: ["Lyon"], caseSensitive: true },
      ],
    };
    expect(checkAnswer(fb, { type: "fill-blank", answers: { "1": "paris", "2": "Lyon" } }).correct).toBe(true);
    const half = checkAnswer(fb, { type: "fill-blank", answers: { "1": "Paris", "2": "lyon" } });
    expect(half).toMatchObject({ correct: false, score: 0.5 });
  });

  it("short-answer: fold (default), exact, regex", () => {
    const sa: Item = { id: "a1", type: "short-answer", prompt: "?", accept: ["Café"] };
    expect(checkAnswer(sa, { type: "short-answer", text: "cafe " }).correct).toBe(true);
    const rx: Item = { id: "a2", type: "short-answer", prompt: "?", accept: ["^\\d{4}$"], match: "regex" };
    expect(checkAnswer(rx, { type: "short-answer", text: "2026" }).correct).toBe(true);
    expect(checkAnswer(rx, { type: "short-answer", text: "20x6" }).correct).toBe(false);
  });

  it("ordering: binary correct, positional partial score", () => {
    const ord: Item = {
      id: "o1", type: "ordering", prompt: "?",
      steps: [{ id: "s1", text: "1" }, { id: "s2", text: "2" }, { id: "s3", text: "3" }],
    };
    expect(checkAnswer(ord, { type: "ordering", orderedIds: ["s1", "s2", "s3"] }).correct).toBe(true);
    const off = checkAnswer(ord, { type: "ordering", orderedIds: ["s1", "s3", "s2"] });
    expect(off).toMatchObject({ correct: false, score: 1 / 3 });
  });

  it("matching: fraction of correct pairs", () => {
    const mt: Item = {
      id: "x1", type: "matching", prompt: "?",
      pairs: [{ left: "perro", right: "dog" }, { left: "gato", right: "cat" }],
    };
    const r = checkAnswer(mt, { type: "matching", pairs: [{ left: "perro", right: "dog" }, { left: "gato", right: "dog" }] });
    expect(r).toMatchObject({ correct: false, score: 0.5 });
  });

  it("throws on flashcards and on type mismatch", () => {
    const card: Item = { id: "c", type: "flashcard", front: "f", back: "b" };
    expect(() => checkAnswer(card, { type: "short-answer", text: "b" })).toThrow(/flashcard/i);
    expect(() => checkAnswer(mc, { type: "short-answer", text: "a" })).toThrow(/mismatch/i);
  });
});
