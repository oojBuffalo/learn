import vm from "node:vm";
import type { RegexTest } from "@study/shared";

/**
 * How long one stored short-answer pattern may run against one answer, in milliseconds.
 * A legitimate pattern and answer, each at most 200 characters, finish in well under one.
 */
export const REGEX_TIME_BUDGET_MS = 50;

/**
 * How long all the regex checks of one request may run together, in milliseconds. The
 * accept list has no length cap and a quiz holds up to 200 items, so without it the
 * per-entry budgets of one request could add up to minutes.
 */
export const REGEX_REQUEST_BUDGET_MS = 200;

/** One reused context: grading is synchronous, so no two checks share it at once. */
const context = vm.createContext({ regex: /(?:)/, text: "" });
const script = new vm.Script("regex.test(text)");

/**
 * Makes the regex tester for one grading request.
 *
 * The static guard (`regexHazard`) blocks nested repetition but lets through patterns
 * such as `^a*a*a*a*a*a*a*a*$`, which backtrack for hours on a 200-character answer.
 * The tester runs each pattern under `REGEX_TIME_BUDGET_MS`, cut down to what is left of
 * `REGEX_REQUEST_BUDGET_MS`. The `vm` timeout interrupts the regex engine itself, so a
 * check ends at its budget instead of blocking the event loop. A check that runs out of
 * time, or that finds the request's budget spent, counts as no match. The pattern
 * compiles outside the context, so a bad one throws an ordinary `SyntaxError`.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   A `RegexTest` with a fresh request budget. Pass one per request to `checkAnswer`,
 *   `scoreQuiz`, `checkGameMove` or `scoreGame`.
 *
 * Raises:
 *   None. The tester throws a `SyntaxError` when a pattern does not compile.
 */
export function createTimedRegexTest(): RegexTest {
  let left = REGEX_REQUEST_BUDGET_MS;
  return (pattern, text) => {
    const regex = new RegExp(pattern);
    if (left <= 0) return false;
    context.regex = regex;
    context.text = text;
    const start = performance.now();
    try {
      return script.runInContext(context, { timeout: Math.ceil(Math.min(REGEX_TIME_BUDGET_MS, left)) }) === true;
    } catch (error) {
      if ((error as { code?: unknown }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") return false;
      throw error;
    } finally {
      left -= performance.now() - start;
    }
  };
}
