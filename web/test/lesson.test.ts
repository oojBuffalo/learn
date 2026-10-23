import { describe, expect, it } from "vitest";
import { lessonExtras } from "../src/pages/Lesson.js";

describe("lessonExtras", () => {
  it("lessonExtras lists each frontmatter extra once and skips the ones the body embeds", () => {
    expect(lessonExtras(["x", "x", "y"], 'A\n\n::activity{id="y"}\n')).toEqual(["x"]);
    expect(lessonExtras(undefined, "A")).toEqual([]);
  });
});
