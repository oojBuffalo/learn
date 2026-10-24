import { expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
const issues = (s: ZodTypeAny, v: unknown) => {
  const r = s.safeParse(v);
  return r.success ? "ok" : r.error.issues.map((i) => i.message).join("; ");
};
import { noteCreateSchema, notePatchSchema, explanationCreateSchema, explanationPatchSchema, confidenceSchema, CONFIDENCE_LEVELS, isLowConfidence, LOW_CONFIDENCE_MAX } from "../src/index.js";
it("rejects a blank body and caps it at 100 000 characters", () => {
  expect(issues(noteCreateSchema, { body: " \n\t", target: null })).toMatch(/body must not be blank/);
  expect(issues(noteCreateSchema, { body: "x".repeat(100_000), target: null })).toBe("ok");
  expect(issues(noteCreateSchema, { body: "x".repeat(100_001), target: null })).toMatch(/at most 100000 characters/);
});
it("needs the target key, and a target needs its packageId", () => {
  expect(issues(noteCreateSchema, { body: "a", target: { packageId: "demo", lessonId: null } })).toBe("ok");
  expect(issues(noteCreateSchema, { body: "a", target: { packageId: "demo", lessonId: "intro" } })).toBe("ok");
  for (const bad of [{ body: "a" }, { body: "a", target: { packageId: "demo" } }, { body: "a", target: { lessonId: "intro" } }])
    expect(issues(noteCreateSchema, bad)).not.toBe("ok");
});
it("rejects unknown keys on every schema", () => {
  expect(issues(noteCreateSchema, { body: "a", target: null, title: "t" })).toMatch(/Unrecognized key/);
  expect(issues(noteCreateSchema, { body: "a", target: { packageId: "demo", lessonId: null, x: 1 } })).toMatch(/Unrecognized key/);
  expect(issues(notePatchSchema, { body: "a", pinned: true })).toMatch(/Unrecognized key/);
  expect(issues(explanationCreateSchema, { packageId: "demo", lessonId: "intro", body: "a", confidence: 2, revisit: true })).toMatch(/Unrecognized key/);
  expect(issues(explanationPatchSchema, { lessonId: "intro", confidence: 3 })).toMatch(/Unrecognized key/);
});
it("a patch must change something; an absent target stays absent, null detaches", () => {
  expect(issues(notePatchSchema, {})).toMatch(/patch must change body or target/);
  expect(issues(explanationPatchSchema, {})).toMatch(/patch must change body or confidence/);
  expect(notePatchSchema.parse({ target: null })).toEqual({ target: null });
  expect(notePatchSchema.parse({ body: "b" })).toEqual({ body: "b" });
});
it("confidence is a whole number from 1 to 5, and 1-2 is low", () => {
  for (const c of [0, 6, 2.5, "3"]) expect(issues(confidenceSchema, c)).toMatch(/confidence must be a whole number from 1 to 5/);
  for (const c of CONFIDENCE_LEVELS) expect(issues(confidenceSchema, c)).toBe("ok");
  expect([1, 2, 3, 5].map(isLowConfidence)).toEqual([true, true, false, false]);
  expect(LOW_CONFIDENCE_MAX).toBe(2);
});
