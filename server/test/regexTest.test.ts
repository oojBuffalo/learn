import { describe, expect, it } from "vitest";
import { checkAnswer, regexHazard } from "@study/shared";
import type { Item } from "@study/shared";
import { REGEX_REQUEST_BUDGET_MS, REGEX_TIME_BUDGET_MS, createTimedRegexTest } from "../src/regexTest.js";

// Overlapping repeats in sequence pass the static guard, yet backtrack for hours on this text.
const SLOW = "^a*a*a*a*a*a*a*a*$";
const SLOW_TEXT = `${"a".repeat(200)}b`;
const slowItem = (accept: string[]): Item => ({ id: "sa", type: "short-answer", prompt: "?", match: "regex", accept });
const slowAnswer = { type: "short-answer", text: SLOW_TEXT.slice(1) } as const; // at the 200-character cap

describe("createTimedRegexTest", () => {
  it("cuts off catastrophic backtracking that the static guard accepts, as no match", () => {
    expect(regexHazard(SLOW)).toBeNull();
    const start = performance.now();
    expect(createTimedRegexTest()(SLOW, SLOW_TEXT)).toBe(false);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(REGEX_TIME_BUDGET_MS / 2); // it ran into the budget
    expect(elapsed).toBeLessThan(1000);
  });
  it("matches as new RegExp(pattern).test does", () => {
    const test = createTimedRegexTest();
    const cases: [string, string][] = [["^\\d{4}$", "2026"], ["^\\d{4}$", "20x6"], [SLOW, "aaa"], ["^colou?r$", "Color"]];
    for (const [pattern, text] of cases) expect(test(pattern, text)).toBe(new RegExp(pattern).test(text));
  });
  it("keeps working after a timeout", () => {
    const test = createTimedRegexTest();
    expect(test(SLOW, SLOW_TEXT)).toBe(false);
    expect(test("^ok$", "ok")).toBe(true);
  });
  it("still throws for a pattern that does not compile", () => {
    expect(() => createTimedRegexTest()("(", "x")).toThrow(SyntaxError);
  });
  it("gives each accept entry its own budget, so a later entry can still match", () => {
    expect(checkAnswer(slowItem([SLOW, "b$"]), slowAnswer, createTimedRegexTest()).correct).toBe(true);
  });
  it("caps one request's checks at the request budget, then counts every entry as no match", () => {
    const test = createTimedRegexTest();
    const start = performance.now();
    expect(checkAnswer(slowItem([...Array(25).fill(SLOW), "b$"]), slowAnswer, test).correct).toBe(false);
    expect(performance.now() - start).toBeLessThan(REGEX_REQUEST_BUDGET_MS * 2); // not 25 × the entry budget
    expect(test("^ok$", "ok")).toBe(false);
    expect(createTimedRegexTest()("^ok$", "ok")).toBe(true); // the next request starts afresh
  });
});
