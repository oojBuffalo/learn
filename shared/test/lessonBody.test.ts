import { describe, expect, it } from "vitest";
import { activityIdsInBody, splitLessonBody } from "../src/index.js";

describe("splitLessonBody", () => {
  it("splits markdown around activity directives", () => {
    const body = 'Intro text.\n\n::activity{id="mcq-1"}\n\nMore text.\n';
    expect(splitLessonBody(body)).toEqual([
      { kind: "md", md: "Intro text.\n" },
      { kind: "activity", id: "mcq-1" },
      { kind: "md", md: "\nMore text.\n" },
    ]);
  });

  it("leaves a directive shown inside a fenced code block alone", () => {
    const body = 'Example:\n\n```md\n::activity{id="example"}\n```\n\n~~~~\n::activity{id="tilde"}\n~~~\n~~~~\n\n::activity{id="real"}\n';
    expect(activityIdsInBody(body)).toEqual(["real"]);
    expect(splitLessonBody(body)[0]).toEqual({
      kind: "md",
      md: 'Example:\n\n```md\n::activity{id="example"}\n```\n\n~~~~\n::activity{id="tilde"}\n~~~\n~~~~\n',
    });
  });

  it("treats an unclosed fence as running to the end", () => {
    expect(activityIdsInBody('```\n::activity{id="x"}\n')).toEqual([]);
  });

  it("recognizes a directive in a CRLF file", () => {
    const body = 'Intro.\r\n\r\n::activity{id="mc1"}\r\n\r\nMore.\r\n';
    expect(activityIdsInBody(body)).toEqual(["mc1"]);
  });

  it("returns one md segment when there are no directives", () => {
    expect(splitLessonBody("Just text.")).toEqual([{ kind: "md", md: "Just text." }]);
  });

  it("ignores a directive that is not alone on its line", () => {
    const body = 'text ::activity{id="x"} more';
    expect(splitLessonBody(body)).toEqual([{ kind: "md", md: body }]);
  });
});

describe("activityIdsInBody", () => {
  it("collects the ids of all activity directives in order", () => {
    const body = '::activity{id="a"}\ntext\n::activity{id="b"}';
    expect(activityIdsInBody(body)).toEqual(["a", "b"]);
  });

  it("returns an empty array when there are no directives", () => {
    expect(activityIdsInBody("Just text.")).toEqual([]);
  });
});
