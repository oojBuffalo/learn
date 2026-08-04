import { describe, expect, it } from "vitest";
import { splitLessonBody } from "../src/index.js";

describe("splitLessonBody", () => {
  it("splits markdown around activity directives", () => {
    const body = 'Intro text.\n\n::activity{id="mcq-1"}\n\nMore text.\n';
    expect(splitLessonBody(body)).toEqual([
      { kind: "md", md: "Intro text.\n" },
      { kind: "activity", id: "mcq-1" },
      { kind: "md", md: "\nMore text.\n" },
    ]);
  });

  it("returns one md segment when there are no directives", () => {
    expect(splitLessonBody("Just text.")).toEqual([{ kind: "md", md: "Just text." }]);
  });

  it("ignores a directive that is not alone on its line", () => {
    const body = 'text ::activity{id="x"} more';
    expect(splitLessonBody(body)).toEqual([{ kind: "md", md: body }]);
  });
});
