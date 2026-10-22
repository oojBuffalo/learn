import { describe, expect, it } from "vitest";
import { activityIdsInBody } from "../src/index.js";

describe("activityIdsInBody", () => {
  it("collects the ids of all activity directives in order, repeats included", () => {
    const body = 'Intro.\n\n::activity{id="a"}\n\nMiddle.\n\n::activity{id="b"}\n\n::activity{id="a"}\n';
    expect(activityIdsInBody(body)).toEqual(["a", "b", "a"]);
  });

  it("ignores a directive that is not a block of its own", () => {
    expect(activityIdsInBody('text ::activity{id="x"} more')).toEqual([]);
  });

  it("recognizes a directive in a CRLF file", () => {
    expect(activityIdsInBody('Intro.\r\n\r\n::activity{id="mc1"}\r\n\r\nMore.\r\n')).toEqual(["mc1"]);
  });

  it("leaves directive text shown inside code alone", () => {
    const body = [
      "```md",
      '::activity{id="backtick"}',
      "```",
      "",
      "~~~~",
      '::activity{id="tilde"}',
      "~~~",
      "~~~~",
      "",
      "::activity{id=\"real\"}",
      "",
    ].join("\n");
    expect(activityIdsInBody(body)).toEqual(["real"]);
  });

  it("treats an unclosed fence as running to the end", () => {
    expect(activityIdsInBody('```\n::activity{id="x"}\n')).toEqual([]);
  });

  it("sees past a fence opened on a list-item line", () => {
    const body = '- ```text\n  hello\n  ```\n\n1. ```\n   code\n   ```\n\n::activity{id="mc1"}\n';
    expect(activityIdsInBody(body)).toEqual(["mc1"]);
  });

  it("does not count directive text nested in a list or quote", () => {
    expect(activityIdsInBody('- ::activity{id="li"}\n\n> ::activity{id="quote"}\n')).toEqual([]);
  });
});
