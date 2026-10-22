import { describe, expect, it } from "vitest";
import type { LoadedPackage } from "../src/index.js";
import { validatePackage } from "../src/index.js";

function pkg(overrides: Partial<LoadedPackage> = {}): LoadedPackage {
  return {
    manifest: { formatVersion: "1.0.0", id: "p", title: "P", version: "1" },
    lessons: [
      {
        file: "lessons/01-a.md",
        order: 0,
        frontmatter: { id: "l1", title: "L1" },
        body: 'Hello\n\n::activity{id="i1"}\n',
      },
    ],
    items: [
      { id: "i1", type: "flashcard", front: "a", back: "b" },
      { id: "i2", type: "short-answer", prompt: "?", accept: ["yes"] },
    ],
    quizzes: [],
    games: [],
    assets: [],
    ...overrides,
  };
}

describe("validatePackage", () => {
  it("passes a consistent package", () => {
    expect(validatePackage(pkg())).toEqual([]);
  });

  it("flags a directive referencing a missing item", () => {
    const errs = validatePackage(
      pkg({ lessons: [{ file: "lessons/01-a.md", order: 0, frontmatter: { id: "l1", title: "L1" }, body: '::activity{id="ghost"}' }] }),
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ file: "lessons/01-a.md", message: expect.stringContaining("ghost") });
  });

  it("flags duplicate item ids, quiz refs to missing items, unit refs to missing lessons, and bad media paths", () => {
    const errs = validatePackage(
      pkg({
        manifest: {
          formatVersion: "1.0.0", id: "p", title: "P", version: "1",
          units: [{ id: "u1", title: "U", lessonIds: ["nope"] }],
        },
        items: [
          { id: "dup", type: "flashcard", front: "a", back: "b" },
          { id: "dup", type: "flashcard", front: "c", back: "d" },
          { id: "img", type: "short-answer", prompt: "?", accept: ["y"], media: [{ src: "assets/missing.png" }] },
        ],
        quizzes: [{ id: "q1", title: "Q", items: ["absent"] }],
        lessons: [{ file: "lessons/01-a.md", order: 0, frontmatter: { id: "l1", title: "L1", activities: ["alsoAbsent"] }, body: "text" }],
      }),
    );
    const messages = errs.map((e) => e.message).join("\n");
    for (const needle of ["dup", "absent", "alsoAbsent", "nope", "assets/missing.png"]) {
      expect(messages).toContain(needle);
    }
  });

  it("flags a game whose source resolves to zero compatible items", () => {
    const errs = validatePackage(
      pkg({ games: [{ id: "g1", template: "matching", title: "M", source: { itemIds: ["i1"] } }] }),
    );
    expect(errs.map((e) => e.message).join()).toMatch(/no compatible items/i);
  });

  it("flags ambiguous unit identities and lesson ordering", () => {
    const errs = validatePackage(pkg({
      manifest: {
        formatVersion: "1.0.0", id: "p", title: "P", version: "1",
        units: [
          { id: "dup", title: "First", lessonIds: ["l1"] },
          { id: "dup", title: "Second", lessonIds: ["l1"] },
        ],
      },
    }));
    const messages = errs.map((error) => error.message).join("\n");
    expect(messages).toMatch(/duplicate unit id "dup"/i);
    expect(messages).toMatch(/lesson "l1" appears in more than one unit position/i);
  });
});
