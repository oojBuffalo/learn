import { describe, expect, it } from "vitest";
import { checkAnswer, regexHazard } from "@study/shared";
import type { Item } from "@study/shared";
import { REGEX_TIME_BUDGET_MS, timedRegexTest } from "../src/regexTest.js";

// Overlapping repeats in sequence pass the static guard, yet backtrack for hours on this text.
const SLOW = "^a*a*a*a*a*a*a*a*$";
const SLOW_TEXT = `${"a".repeat(200)}b`;

describe("timedRegexTest", () => {
  it("cuts off catastrophic backtracking that the static guard accepts, as no match", () => {
    expect(regexHazard(SLOW)).toBeNull();
    const start = performance.now();
    expect(timedRegexTest(SLOW, SLOW_TEXT)).toBe(false);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(REGEX_TIME_BUDGET_MS / 2); // it ran into the budget
    expect(elapsed).toBeLessThan(1000);
  });
  it("matches as new RegExp(pattern).test does", () => {
    const cases: [string, string][] = [["^\\d{4}$", "2026"], ["^\\d{4}$", "20x6"], [SLOW, "aaa"], ["^colou?r$", "Color"]];
    for (const [pattern, text] of cases) expect(timedRegexTest(pattern, text)).toBe(new RegExp(pattern).test(text));
  });
  it("keeps working after a timeout", () => {
    expect(timedRegexTest(SLOW, SLOW_TEXT)).toBe(false);
    expect(timedRegexTest("^ok$", "ok")).toBe(true);
  });
  it("still throws for a pattern that does not compile", () => {
    expect(() => timedRegexTest("(", "x")).toThrow(SyntaxError);
  });
  it("gives each accept entry its own budget, so a later entry can still match", () => {
    const item: Item = { id: "sa", type: "short-answer", prompt: "?", match: "regex", accept: [SLOW, "b$"] };
    expect(checkAnswer(item, { type: "short-answer", text: SLOW_TEXT.slice(1) }, timedRegexTest).correct).toBe(true);
  });
});
