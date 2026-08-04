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

  it("rejects multi-select with zero correct options", () => {
    expect(() =>
      itemSchema.parse({
        ...base,
        type: "multi-select",
        options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
      }),
    ).toThrow(/at least one/i);
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
});
