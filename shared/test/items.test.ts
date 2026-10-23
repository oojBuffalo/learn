import { describe, expect, it } from "vitest";
import { itemSchema } from "../src/index.js";

const base = { id: "q1", prompt: "Pick one." };

describe("itemSchema", () => {
  it("accepts a minimal multiple-choice item", () => {
    const item = itemSchema.parse({
      ...base,
      type: "multiple-choice",
      options: [
        { id: "a", text: "Right", correct: true },
        { id: "b", text: "Wrong" },
      ],
    });
    expect(item.type).toBe("multiple-choice");
  });

  it("rejects multiple-choice without exactly one correct option", () => {
    expect(() =>
      itemSchema.parse({
        ...base,
        type: "multiple-choice",
        options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
      }),
    ).toThrow(/exactly one/i);
  });

  it("rejects duplicate option ids", () => {
    expect(() => itemSchema.parse({
      ...base,
      type: "multiple-choice",
      options: [
        { id: "dup", text: "Right", correct: true },
        { id: "dup", text: "Wrong" },
      ],
    })).toThrow(/unique option ids/i);
  });

  it("rejects multi-select with zero correct options", () => {
    expect(() =>
      itemSchema.parse({
        ...base,
        type: "multi-select",
        options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
      }),
    ).toThrow(/at least one/i);
    expect(() => itemSchema.parse({
      ...base,
      type: "multi-select",
      options: [
        { id: "dup", text: "A", correct: true },
        { id: "dup", text: "B" },
      ],
    })).toThrow(/unique option ids/i);
  });

  it("rejects fill-blank whose blanks don't match {{n}} placeholders", () => {
    expect(() =>
      itemSchema.parse({
        ...base,
        type: "fill-blank",
        template: "Capital of {{1}} is {{2}}.",
        blanks: [{ slot: 1, accept: ["France"] }],
      }),
    ).toThrow(/blank/i);
  });

  it("rejects fill-blank that declares the same slot twice", () => {
    expect(() =>
      itemSchema.parse({
        ...base,
        type: "fill-blank",
        template: "{{1}} then {{1}}",
        blanks: [
          { slot: 1, accept: ["first"] },
          { slot: 1, accept: ["second"] },
        ],
      }),
    ).toThrow(/only once/);
  });

  it("accepts a flashcard and defaults reverse to undefined", () => {
    const card = itemSchema.parse({
      id: "c1",
      type: "flashcard",
      front: "hola",
      back: "hello",
    });
    expect(card.type).toBe("flashcard");
  });

  it("rejects unknown fields", () => {
    expect(() =>
      itemSchema.parse({ ...base, type: "short-answer", accept: ["x"], bogus: 1 }),
    ).toThrow();
  });

  it("rejects bad ids", () => {
    expect(() =>
      itemSchema.parse({ id: "bad id!", type: "short-answer", prompt: "p", accept: ["x"] }),
    ).toThrow(/id/i);
  });

  it("rejects an invalid short-answer regular expression at import time", () => {
    expect(() => itemSchema.parse({
      ...base,
      type: "short-answer",
      match: "regex",
      accept: ["[unterminated"],
    })).toThrow(/regular expression/i);
  });

  it("rejects a backtracking-prone regular expression at accept.0", () => {
    const r = itemSchema.safeParse({ ...base, type: "short-answer", match: "regex", accept: ["(a+)+$"] });
    expect(r.success).toBe(false);
    expect(r.error?.issues).toEqual([expect.objectContaining({ path: ["accept", 0], message: expect.stringMatching(/^a repeated group/) })]);
  });

  it("reports an uncompilable pattern once, as invalid", () => {
    const r = itemSchema.safeParse({ ...base, type: "short-answer", match: "regex", accept: ["[unterminated"] });
    expect(r.error?.issues).toEqual([expect.objectContaining({ path: ["accept", 0], message: "must be a valid regular expression" })]);
  });

  it("checks hazards only in regex mode", () =>
    expect(itemSchema.safeParse({ ...base, type: "short-answer", accept: ["(a+)+$"] }).success).toBe(true));

  it("rejects duplicate ordering step ids", () => {
    expect(() => itemSchema.parse({
      ...base,
      type: "ordering",
      steps: [{ id: "dup", text: "First" }, { id: "dup", text: "Second" }],
    })).toThrow(/unique step ids/i);
  });

  it("rejects duplicate matching left-hand values", () => {
    expect(() => itemSchema.parse({
      ...base,
      type: "matching",
      pairs: [{ left: "dup", right: "First" }, { left: "dup", right: "Second" }],
    })).toThrow(/unique left/i);
  });
});
