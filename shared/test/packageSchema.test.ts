import { describe, expect, it } from "vitest";
import { gameSchema, lessonFrontmatterSchema, manifestSchema, quizSchema } from "../src/index.js";

describe("manifestSchema", () => {
  it("accepts a minimal manifest", () => {
    const m = manifestSchema.parse({
      formatVersion: "1.0.0",
      id: "spanish-basics",
      title: "Spanish Basics",
      version: "1.0.0",
    });
    expect(m.id).toBe("spanish-basics");
  });

  it("rejects a formatVersion the importer doesn't know", () => {
    expect(() =>
      manifestSchema.parse({ formatVersion: "9.0.0", id: "x", title: "X", version: "1" }),
    ).toThrow(/formatVersion/i);
  });

  it("accepts optional units and meta, rejects unknown fields", () => {
    const m = manifestSchema.parse({
      formatVersion: "1.0.0",
      id: "p",
      title: "P",
      version: "2",
      language: "es-MX",
      units: [{ id: "u1", title: "Unit 1", lessonIds: ["l1"] }],
      meta: { anything: { goes: true } },
    });
    expect(m.units?.[0]?.lessonIds).toEqual(["l1"]);
    expect(() =>
      manifestSchema.parse({ formatVersion: "1.0.0", id: "p", title: "P", version: "2", nope: 1 }),
    ).toThrow();
  });
});

describe("lessonFrontmatterSchema", () => {
  it("accepts minimal frontmatter (id + title)", () => {
    const fm = lessonFrontmatterSchema.parse({ id: "greetings", title: "Greetings" });
    expect(fm.title).toBe("Greetings");
  });
});

describe("quizSchema / gameSchema", () => {
  it("accepts a quiz", () => {
    expect(
      quizSchema.parse({ id: "q", title: "Quiz", items: ["a", "b"], passThreshold: 0.8 }).items,
    ).toHaveLength(2);
  });
  it("rejects passThreshold outside 0..1", () => {
    expect(() => quizSchema.parse({ id: "q", title: "Q", items: ["a"], passThreshold: 2 })).toThrow();
  });
  it("accepts a game with tag source", () => {
    const g = gameSchema.parse({ id: "g", template: "matching", title: "Match!", source: { tags: ["food"] } });
    expect(g.template).toBe("matching");
  });
});
