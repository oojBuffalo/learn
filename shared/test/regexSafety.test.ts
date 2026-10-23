import { describe, expect, it } from "vitest";
import { MAX_PATTERN_LENGTH, regexHazard } from "../src/index.js";

const NESTED = "a repeated group may not contain another repeat or an alternation — list alternatives as separate accept entries or use a character class";
const SAFE = ["^\\d{4}$", "^colou?r$", "^(the )?mitochondri(a|on)$", "(ab)+", "(\\d{1,3}\\.){3}",
  "^[a-z]+(-[a-z]+)?$", "[(a+)+]", "\\(a+\\)+", "(?<=a)b+"];
const UNSAFE = ["(a+)+$", "(a*)*", "(a|aa)+", "(\\w+\\s?)+", "((a)+)+", "(.*a){20}", "(a+){2,5}", "(?:a|b)*", "(a{1,2})+"];

describe("regexHazard", () => {
  it.each(SAFE)("accepts %s", (p) => expect(regexHazard(p)).toBeNull());
  it.each(UNSAFE)("rejects nested repetition in %s", (p) => expect(regexHazard(p)).toBe(NESTED));
  it("rejects backreferences", () => {
    expect(regexHazard("(a)\\1")).toBe("backreferences are not allowed");
    expect(regexHazard("(?<x>a)\\k<x>")).toBe("backreferences are not allowed");
  });
  it("caps the pattern length", () => {
    expect(MAX_PATTERN_LENGTH).toBe(200);
    expect(regexHazard("a".repeat(200))).toBeNull();
    expect(regexHazard("a".repeat(201))).toBe("pattern is longer than 200 characters");
  });
});

describe("regexHazard parsing", () => {
  // Classes, escapes, group prefixes and literal braces must not hide or invent a group.
  const PARSED_SAFE = [
    "([(|)]x)+", // a class holding ( | ) is one atom, not a group or an alternation
    "([\\]|]x)+", // an escaped ] does not end the class early
    "\\[(ab)+\\]", // escaped brackets are literals
    "(a{1, 2})+", // a { that does not complete a quantifier is a literal
    "(a+)?", // ? never repeats a group
    "(a+){1}",
    "(a+){0,1}",
    "(?<year>\\d{4})-\\d{2}",
    "[\\1]", // in a class \1 is an octal escape, not a backreference
  ];
  const PARSED_UNSAFE = [
    "[\\\\](a+)+", // the class ends at the ] after an escaped backslash
    "[\\]](a+)+", // the class ends at the second ]
    "\\\\(a+)+", // an escaped backslash does not escape the (
    "(a+){2,}", // {n,} outside
    "(a{2,})+", // {n,} inside
    "(a+)+?", // lazy forms
    "(a+){2,}?",
    "(?<x>a+)+", // a named group's prefix is skipped
    "((?=a)b+)+", // a lookahead inside a repeated group
    "(?<=(a+)+)b", // nesting inside a lookbehind still counts
  ];
  it.each(PARSED_SAFE)("accepts %s", (p) => {
    expect(() => new RegExp(p)).not.toThrow();
    expect(regexHazard(p)).toBeNull();
  });
  it.each(PARSED_UNSAFE)("rejects nested repetition in %s", (p) => {
    expect(() => new RegExp(p)).not.toThrow();
    expect(regexHazard(p)).toBe(NESTED);
  });
  // Modifier groups compile only on Node 23+, so these skip the compile check.
  it("reads a (?flags: prefix as a group opener", () => {
    expect(regexHazard("(?i:ab)+")).toBeNull();
    expect(regexHazard("(?i-m:a+)+")).toBe(NESTED);
  });
});

describe("regexHazard conservative rejections", () => {
  // Each of these backtracks exponentially in V8 on an answer well under MAX_ANSWER_TEXT.
  it.each([
    "((a|aa))+", // an alternation reached through a wrapping group
    "(?:(?:a|a)c)+",
    "(a|a){30}", // an alternation under a bounded repeat
    "(a?a)+", // an optional under an unbounded repeat
    "(a?a?)+",
    "(a{0,1}a)+",
  ])("rejects %s", (p) => expect(regexHazard(p)).toBe(NESTED));
});
