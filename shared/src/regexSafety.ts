/** The longest pattern a short-answer `match: "regex"` accept entry may hold. */
export const MAX_PATTERN_LENGTH = 200;

const TOO_LONG = `pattern is longer than ${MAX_PATTERN_LENGTH} characters`;
const BACKREFERENCE = "backreferences are not allowed";
const NESTED =
  "a repeated group may not contain another repeat or an alternation — list alternatives as separate accept entries or use a character class";

/** What a group, or the whole pattern, contains at any depth. */
interface Frame {
  /** A `*`, `+`, `{n,}`, `{n,m}` with m > 1, `?` or `{0,1}`. */
  repeats: boolean;
  /** A `*`, `+` or `{n,}`. */
  unbounded: boolean;
  /** A `|`. */
  alternation: boolean;
}

interface Quantifier {
  length: number;
  /** `*`, `+` or `{n,}`. */
  unbounded: boolean;
  /** `{n,m}` with m > 1. */
  ranged: boolean;
  /** `{n}` with n > 1. */
  fixed: boolean;
  /** `?` or `{0,1}`. */
  optional: boolean;
}

/** What follows `(` in a non-capturing, lookaround, named or modifier group. */
const GROUP_PREFIX = /\?(?:[=!]|<[=!]|<[^>]*>|[A-Za-z-]*:)/y;

/** A quantifier with its optional lazy `?`. A `{` that does not complete one is a literal. */
const QUANTIFIER = /(?:([*+?])|\{(\d+)(?:(,)(\d*))?\})\??/y;

function frame(): Frame {
  return { repeats: false, unbounded: false, alternation: false };
}

function quantifierAt(pattern: string, index: number): Quantifier | null {
  QUANTIFIER.lastIndex = index;
  const match = QUANTIFIER.exec(pattern);
  if (!match) return null;
  const [text, symbol, min, comma, max] = match;
  const q = { length: text.length, unbounded: false, ranged: false, fixed: false, optional: false };
  if (symbol === "?") q.optional = true;
  else if (symbol) q.unbounded = true;
  else if (!comma) q.fixed = Number(min) > 1;
  else if (max === "") q.unbounded = true;
  else if (Number(max) > 1) q.ranged = true;
  else q.optional = Number(min) < Number(max);
  return q;
}

/** The index just past the `]` that closes the class opened at `index`. */
function afterClass(pattern: string, index: number): number {
  let i = index + 1;
  while (i < pattern.length && pattern[i] !== "]") i += pattern[i] === "\\" ? 2 : 1;
  return i + 1;
}

/**
 * Why a short-answer accept pattern is unsafe to run, if it is.
 *
 * `checkAnswer` runs stored patterns synchronously in the request handler, and a
 * repeated group that can match the same text in more than one way backtracks
 * exponentially: `(a+)+$` stalls the process on an answer of about 30 characters.
 * This scanner rejects that shape in one pass with no dependency, so `shared` stays
 * safe to bundle into the web app. It reads patterns as `new RegExp(pattern)` does,
 * with no flags. A class is one atom and its contents are ignored; an escape is one
 * atom.
 *
 * A group followed by `*`, `+` or `{n,}` may not contain, at any depth, `*`, `+`,
 * `{n,}`, `{n,m}` with m > 1, `?`, `{0,1}` or an alternation. A group followed by
 * `{n}` with n > 1 or `{n,m}` with m > 1 may not contain `*`, `+`, `{n,}` or an
 * alternation. Lazy forms count the same. This is a guard against nested repetition,
 * not a full backtracking analysis: repeats in sequence (`a*a*a*`) and a ranged
 * repeat under a bounded one (`(a{1,2}){50}`) still pass.
 *
 * Args:
 *   pattern: The accept entry's source, as stored in items.json.
 *
 * Returns:
 *   null when the pattern passes these checks; otherwise the first one it fails,
 *   which is one of "pattern is longer than 200 characters", "backreferences are
 *   not allowed", or the nested-repetition message.
 *
 * Raises:
 *   Nothing: a pattern that does not compile is scanned like any other, and
 *   `new RegExp` reports it.
 */
export function regexHazard(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return TOO_LONG;
  const stack: Frame[] = [frame()];
  const top = (): Frame => stack[stack.length - 1]!;
  let i = 0;
  while (i < pattern.length) {
    let closed: Frame | null = null;
    const char = pattern[i];
    if (char === "\\") {
      const next = pattern[i + 1] ?? "";
      if ((next >= "1" && next <= "9") || pattern.startsWith("k<", i + 1)) return BACKREFERENCE;
      i += 2;
    } else if (char === "[") {
      i = afterClass(pattern, i);
    } else if (char === "(") {
      stack.push(frame());
      GROUP_PREFIX.lastIndex = i + 1;
      const prefix = GROUP_PREFIX.exec(pattern);
      i += 1 + (prefix ? prefix[0].length : 0);
      continue; // "(" itself takes no quantifier
    } else if (char === ")") {
      closed = stack.length > 1 ? stack.pop()! : null; // never pop the root
      i += 1;
    } else if (char === "|") {
      top().alternation = true;
      i += 1;
      continue;
    } else {
      i += 1;
    }

    const q = quantifierAt(pattern, i);
    if (q) {
      i += q.length;
      if (closed && q.unbounded && (closed.repeats || closed.alternation)) return NESTED;
      if (closed && (q.ranged || q.fixed) && (closed.unbounded || closed.alternation)) return NESTED;
      top().repeats ||= q.unbounded || q.ranged || q.optional;
      top().unbounded ||= q.unbounded;
    }
    if (closed) {
      top().repeats ||= closed.repeats;
      top().unbounded ||= closed.unbounded;
      top().alternation ||= closed.alternation;
    }
  }
  return null;
}
