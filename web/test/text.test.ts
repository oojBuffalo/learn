import { expect, it } from "vitest";
import { describeCounts, headline, message, plural, purgeTotal } from "../src/text.js";
const zero = { cardState: 0, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 };
const counts = { cardState: 3, reviewLog: 12, attempts: 2, lessonProgress: 1, notes: 2, explanations: 1 };
it("headline takes the first real line without markdown markers or math", () => {
  for (const [body, want] of [["# Title\n\nBody", "Title"], ["\n\n> - nested", "nested"], ["1. first", "first"], ["2) second", "second"], ["```js\ncode line\n```", "code line"], ["#\n\nReal title", "Real title"], ["#hashtag", "#hashtag"], ["Area is $a^2$", "Area is a^2"], ["a   b\t c", "a b c"]]) expect(headline(body!)).toBe(want);
});
it("headline truncates with an ellipsis and falls back", () => {
  expect(headline("x".repeat(100))).toBe("x".repeat(79) + "…");
  for (const s of ["", "  \n\n", "```\n```", "~~~js\n~~~"]) expect(headline(s)).toBe("Untitled note");
});
it("message and plural", () => {
  expect(message(new Error("boom"))).toBe("boom"); expect(message("x")).toBe("x");
  expect([plural(1, "note"), plural(0, "note"), plural(2, "note")]).toEqual(["1 note", "0 notes", "2 notes"]);
});
it("describeCounts omits zeros and pluralises", () => {
  expect(describeCounts(counts)).toBe("3 card schedules · 12 reviews · 2 results · 1 lesson mark · 2 notes · 1 explanation");
  expect(describeCounts({ ...zero, reviewLog: 1 })).toBe("1 review"); expect(describeCounts(zero)).toBe("");
});
it("purgeTotal counts writing only when included", () => {
  expect(purgeTotal(counts, false)).toBe(18); expect(purgeTotal(counts, true)).toBe(21);
});
