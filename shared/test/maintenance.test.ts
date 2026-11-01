import { expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
const issues = (s: ZodTypeAny, v: unknown) => {
  const r = s.safeParse(v);
  return r.success ? "ok" : r.error.issues.map((i) => i.message).join("; ");
};
import { purgedKinds, ORPHAN_KINDS, WRITING_KINDS, orphanCountsSchema, purgeOrphansRequestSchema } from "../src/index.js";
const ZERO = { cardState: 0, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 };
it("always purges progress and purges writing only when asked", () => {
  expect(purgedKinds(false)).toEqual(["cardState", "reviewLog", "attempts", "lessonProgress"]);
  expect(purgedKinds(true)).toEqual([...ORPHAN_KINDS]);
  expect(WRITING_KINDS).toEqual(["notes", "explanations"]);
});
it("counts are strict non-negative integers", () => {
  expect(issues(orphanCountsSchema, ZERO)).toBe("ok");
  for (const bad of [{ ...ZERO, cardState: -1 }, { ...ZERO, notes: 1.5 }, { ...ZERO, extra: 0 }, { cardState: 0 }])
    expect(issues(orphanCountsSchema, bad)).not.toBe("ok");
});
it("a purge request carries back the counts the user saw", () => {
  expect(issues(purgeOrphansRequestSchema, { packageId: "demo", includeWriting: true, expected: ZERO })).toBe("ok");
  expect(issues(purgeOrphansRequestSchema, { packageId: "demo", includeWriting: false })).not.toBe("ok");
  expect(issues(purgeOrphansRequestSchema, { packageId: "no spaces", includeWriting: false, expected: ZERO })).toMatch(/id must match/);
});
