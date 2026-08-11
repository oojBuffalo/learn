import { describe, expect, it } from "vitest";
import type { LoadedPackage } from "../src/index.js";
import { fillBlankSegments, prosePassages, stripMath } from "../src/index.js";

describe("stripMath", () => {
  it("drops balanced delimiters and keeps the source", () => {
    expect(stripMath("costs $O(n^3)$ time")).toBe("costs O(n^3) time");
    expect(stripMath("$$x = y$$")).toBe("x = y");
    expect(stripMath("$a$ then $b$")).toBe("a then b");
  });

  it("restores an escaped dollar", () => {
    expect(stripMath("costs \\$5")).toBe("costs $5");
  });

  it("leaves an unpaired dollar alone rather than guessing", () => {
    expect(stripMath("unbalanced $")).toBe("unbalanced $");
  });

  it("passes ordinary prose through untouched", () => {
    expect(stripMath("no math here")).toBe("no math here");
  });
});

describe("fillBlankSegments", () => {
  it("returns the literal chunks either side of each placeholder", () => {
    expect(fillBlankSegments("Recall is {{1}} than {{2}}.")).toEqual(["Recall is ", " than ", "."]);
  });
});

function pkg(items: LoadedPackage["items"]): LoadedPackage {
  return {
    manifest: { formatVersion: "1.0.0", id: "p", title: "P", version: "1" },
    lessons: [{ file: "lessons/01-a.md", order: 0, frontmatter: { id: "l1", title: "L1" }, body: "Body" }],
    items,
    quizzes: [],
    games: [],
    assets: [],
  };
}

/** The field map is the renderer contract, so it gets an exact-value test. */
describe("prosePassages", () => {
  it("tags the lesson body as block prose", () => {
    expect(prosePassages(pkg([]))).toEqual([
      { file: "lessons/01-a.md", path: "body", text: "Body", mode: "block" },
    ]);
  });

  it("separates a multiple-choice item's block prose from its inline fields", () => {
    const passages = prosePassages(
      pkg([
        {
          id: "mc",
          type: "multiple-choice",
          prompt: "Which?",
          explanation: "Because.",
          hints: ["a hint"],
          options: [
            { id: "a", text: "First", correct: true, feedback: "yes" },
            { id: "b", text: "Second" },
          ],
        },
      ]),
    ).filter((p) => p.file === "items.json");

    expect(passages).toEqual([
      { file: "items.json", path: "mc.prompt", text: "Which?", mode: "block" },
      { file: "items.json", path: "mc.explanation", text: "Because.", mode: "block" },
      { file: "items.json", path: "mc.hints[0]", text: "a hint", mode: "inline" },
      { file: "items.json", path: "mc.options[0].text", text: "First", mode: "inline" },
      { file: "items.json", path: "mc.options[0].feedback", text: "yes", mode: "inline" },
      { file: "items.json", path: "mc.options[1].text", text: "Second", mode: "inline" },
    ]);
  });

  it("marks a matching item's left rich and its right plain", () => {
    const passages = prosePassages(
      pkg([
        {
          id: "m",
          type: "matching",
          prompt: "Pair them",
          pairs: [{ left: "L", right: "R" }, { left: "L2", right: "R2" }],
          distractors: ["D"],
        },
      ]),
    );
    const modes = Object.fromEntries(passages.map((p) => [p.path, p.mode]));
    expect(modes["m.pairs[0].left"]).toBe("inline");
    expect(modes["m.pairs[0].right"]).toBe("plain");
    expect(modes["m.distractors[0]"]).toBe("plain");
  });

  it("splits a fill-blank template and treats accepted answers as plain", () => {
    const passages = prosePassages(
      pkg([
        {
          id: "fb",
          type: "fill-blank",
          prompt: "Fill it",
          template: "Recall beats {{1}}.",
          blanks: [{ slot: 1, accept: ["review"] }],
        },
      ]),
    );
    const modes = Object.fromEntries(passages.map((p) => [p.path, p.mode]));
    expect(modes["fb.template#0"]).toBe("inline");
    expect(modes["fb.template#1"]).toBe("inline");
    expect(modes["fb.blanks[0].accept[0]"]).toBe("plain");
  });

  it("keeps flashcard faces inline, since the answer face is laid out inline", () => {
    const passages = prosePassages(
      pkg([{ id: "fc", type: "flashcard", front: "F", back: "B", examples: ["E"] }]),
    );
    const modes = Object.fromEntries(passages.map((p) => [p.path, p.mode]));
    expect(modes["fc.front"]).toBe("inline");
    expect(modes["fc.back"]).toBe("inline");
    expect(modes["fc.examples[0]"]).toBe("inline");
  });

  it("skips regex short-answer patterns, which are not prose", () => {
    const paths = prosePassages(
      pkg([{ id: "sa", type: "short-answer", prompt: "?", accept: ["^a$"], match: "regex" }]),
    ).map((p) => p.path);
    expect(paths).not.toContain("sa.accept[0]");
  });
});
