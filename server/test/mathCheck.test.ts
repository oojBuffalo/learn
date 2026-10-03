import { describe, expect, it } from "vitest";
import type { LoadedPackage } from "@study/shared";
import { validateMath } from "../src/mathCheck.js";

function pkg(over: Partial<LoadedPackage> = {}): LoadedPackage {
  return {
    manifest: { formatVersion: "1.0.0", id: "p", title: "P", version: "1" },
    lessons: [{ file: "lessons/01-a.md", order: 0, frontmatter: { id: "l1", title: "L1" }, body: "Plain body." }],
    items: [],
    quizzes: [],
    games: [],
    assets: [],
    ...over,
  };
}

const lesson = (body: string): Partial<LoadedPackage> => ({
  lessons: [{ file: "lessons/01-a.md", order: 0, frontmatter: { id: "l1", title: "L1" }, body }],
});

const mc = (over: Record<string, unknown>): Partial<LoadedPackage> => ({
  items: [
    {
      id: "mc",
      type: "multiple-choice",
      prompt: "Which?",
      options: [{ id: "a", text: "First", correct: true }, { id: "b", text: "Second" }],
      ...over,
    } as LoadedPackage["items"][number],
  ],
});

describe("validateMath", () => {
  it("accepts a package with no math at all", () => {
    expect(validateMath(pkg())).toEqual([]);
  });

  it("accepts valid inline and display math in a lesson body", () => {
    expect(validateMath(pkg(lesson("Cost is $O(n^3)$.\n\n$$R = e^{-t/S}$$\n")))).toEqual([]);
  });

  it("accepts a ```math fenced block", () => {
    expect(validateMath(pkg(lesson("```math\n\\sum_{i=1}^{n} w_i\n```\n")))).toEqual([]);
  });

  it("reports a KaTeX parse error with the file and path", () => {
    const errs = validateMath(pkg(mc({ prompt: "What is $\\fracc{1}{2}$?" })));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ file: "items.json", path: "mc.prompt" });
    expect(errs[0]!.message).toMatch(/fracc/);
  });

  it("gives a line number for an error inside a lesson body", () => {
    const errs = validateMath(pkg(lesson("One\n\nTwo\n\nBroken $\\fracc12$ here\n")));
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toMatch(/^line 5: /);
  });

  it("refuses math in a matching right-hand value, which renders plain", () => {
    const errs = validateMath(
      pkg({
        items: [
          {
            id: "m",
            type: "matching",
            prompt: "Pair",
            pairs: [{ left: "$O(n)$", right: "$O(n^2)$" }, { left: "b", right: "c" }],
          } as LoadedPackage["items"][number],
        ],
      }),
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ file: "items.json", path: "m.pairs[0].right" });
    expect(errs[0]!.message).toMatch(/plain text/);
  });

  it("refuses display math in an option, which cannot hold a block", () => {
    const errs = validateMath(
      pkg(mc({ options: [{ id: "a", text: "$$\nx = y\n$$", correct: true }, { id: "b", text: "no" }] })),
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toMatch(/display math/);
  });

  // Only the multi-line form becomes a display block; `$$x$$` on one line is inline
  // math, so it is harmless inside a label and stays allowed.
  it("allows single-line $$…$$ in an option", () => {
    expect(
      validateMath(pkg(mc({ options: [{ id: "a", text: "$$x = y$$", correct: true }, { id: "b", text: "no" }] }))),
    ).toEqual([]);
  });

  it("refuses display math on a flashcard back, which is laid out inline", () => {
    const errs = validateMath(
      pkg({
        items: [
          { id: "fc", type: "flashcard", front: "F", back: "$$\nx = y\n$$" } as LoadedPackage["items"][number],
        ],
      }),
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ path: "fc.back" });
  });

  it("reports an unpaired dollar rather than letting it render as prose", () => {
    const errs = validateMath(pkg(lesson("Tickets cost $5 today.\n")));
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toMatch(/unpaired \$/);
  });

  it("accepts an escaped dollar", () => {
    expect(validateMath(pkg(lesson("Tickets cost \\$5 today.\n")))).toEqual([]);
  });

  it("ignores dollars inside code spans and fenced blocks", () => {
    expect(validateMath(pkg(lesson("Use `$PATH` here.\n\n```sh\necho $HOME\n```\n")))).toEqual([]);
  });

  it("leaves a plain field's lone dollar alone", () => {
    const errs = validateMath(
      pkg({
        items: [
          {
            id: "m",
            type: "matching",
            prompt: "Pair",
            pairs: [{ left: "price", right: "$5" }, { left: "b", right: "c" }],
          } as LoadedPackage["items"][number],
        ],
      }),
    );
    expect(errs).toEqual([]);
  });

  it("reports every problem in one pass", () => {
    const errs = validateMath(
      pkg({
        ...lesson("Broken $\\fracc12$ here\n"),
        ...mc({ options: [{ id: "a", text: "$\\notacommand{}$", correct: true }, { id: "b", text: "ok" }] }),
      }),
    );
    expect(errs.map((e) => e.path).sort()).toEqual(["body", "mc.options[0].text"]);
  });
});
