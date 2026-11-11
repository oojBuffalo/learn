import vm from "node:vm";
import type { RegexTest } from "@study/shared";

/**
 * How long one stored short-answer pattern may run against one answer, in milliseconds.
 * A legitimate pattern and answer, each at most 200 characters, finish in well under one.
 */
export const REGEX_TIME_BUDGET_MS = 50;

/** One reused context: grading is synchronous, so no two checks share it at once. */
const context = vm.createContext({ regex: /(?:)/, text: "" });
const script = new vm.Script("regex.test(text)");

/**
 * Runs a stored short-answer pattern under `REGEX_TIME_BUDGET_MS`.
 *
 * The static guard (`regexHazard`) blocks nested repetition but lets through patterns
 * such as `^a*a*a*a*a*a*a*a*$`, which backtrack for hours on a 200-character answer.
 * The `vm` timeout interrupts the regex engine itself, so such a check ends at the
 * budget instead of blocking the event loop. The pattern compiles outside the context,
 * so a bad one throws an ordinary `SyntaxError`.
 *
 * Args:
 *   pattern: The accept entry's source, already vetted by `regexHazard`.
 *   text: The learner's answer, trimmed.
 *
 * Returns:
 *   Whether the pattern matches the text. A check that runs out of time counts as no match.
 *
 * Raises:
 *   SyntaxError: The pattern does not compile.
 */
export const timedRegexTest: RegexTest = (pattern, text) => {
  context.regex = new RegExp(pattern);
  context.text = text;
  try {
    return script.runInContext(context, { timeout: REGEX_TIME_BUDGET_MS }) === true;
  } catch (error) {
    if ((error as { code?: unknown }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT") return false;
    throw error;
  }
};
