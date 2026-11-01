import { expect, it } from "vitest";
import type { Explanation, Note } from "@study/shared";
import { filterExplanations, filterNotes, filterSearch, parseListFilter } from "../src/listFilter.js";
import type { ListFilter } from "../src/listFilter.js";
const target = (packageId: string, lessonId: string | null) => ({ packageId, lessonId, packageTitle: packageId, lessonTitle: lessonId });
const note = (id: number, t: Note["target"], orphaned = false): Note => ({ id, target: t, orphaned, body: "b", createdAt: "x", updatedAt: "x" });
const notes = [note(1, null), note(2, target("p", null)), note(3, target("p", "l1")), note(4, target("p", "l2")), note(5, target("q", "x"), true), note(6, target("p", "gone"), true)];
const explain = (id: number, lessonId: string, revisit = false, orphaned = false): Explanation => ({ id, packageId: orphaned ? "q" : "p", packageTitle: "P", lessonId, lessonTitle: lessonId, body: "b", confidence: 2, revisit, orphaned, createdAt: "x", updatedAt: "x" });
const explanations = [explain(1, "l1", true), explain(2, "l1"), explain(3, "l2", true), explain(4, "x", false, true)];
const parse = (s: string) => parseListFilter(new URLSearchParams(s));
const shapes: ListFilter[] = [{ kind: "all" }, { kind: "standalone" }, { kind: "orphaned" }, { kind: "orphaned", packageId: "p" }, { kind: "package", packageId: "p" }, { kind: "package", packageId: "p", lessonId: "l" }];
it("parses with orphaned first, then standalone, then package", () => {
  expect(parse("orphaned=1&standalone=1&packageId=p")).toEqual({ kind: "orphaned", packageId: "p" });
  expect(parse("orphaned=1")).toEqual({ kind: "orphaned" }); expect(parse("standalone=1&packageId=p")).toEqual({ kind: "standalone" });
  expect(parse("packageId=p&lessonId=l")).toEqual({ kind: "package", packageId: "p", lessonId: "l" }); expect(parse("packageId=p")).toEqual({ kind: "package", packageId: "p" });
  expect(parse("lessonId=l")).toEqual({ kind: "all" }); expect(parse("orphaned=true")).toEqual({ kind: "all" });
});
it("filterSearch puts extra keys first and round-trips", () => {
  expect(filterSearch({ kind: "all" })).toBe(""); expect(filterSearch({ kind: "standalone" })).toBe("?standalone=1");
  expect(filterSearch({ kind: "orphaned", packageId: "p" }, { tab: "explanations" })).toBe("?tab=explanations&orphaned=1&packageId=p");
  expect(filterSearch({ kind: "all" }, { tab: "explanations", revisit: "1" })).toBe("?tab=explanations&revisit=1");
  for (const f of shapes) expect(parse(filterSearch(f))).toEqual(f);
});
it("filters notes", () => {
  const cases: [ListFilter, number[]][] = [[{ kind: "all" }, [1, 2, 3, 4]], [{ kind: "standalone" }, [1]], [{ kind: "package", packageId: "p" }, [2, 3, 4]], [{ kind: "package", packageId: "p", lessonId: "l1" }, [3]], [{ kind: "orphaned" }, [5, 6]], [{ kind: "orphaned", packageId: "q" }, [5]], [{ kind: "package", packageId: "q" }, []]];
  for (const [f, want] of cases) expect(filterNotes(notes, f).map((n) => n.id)).toEqual(want);
});
it("filters explanations", () => {
  const cases: [ListFilter, boolean, number[]][] = [[{ kind: "all" }, false, [1, 2, 3]], [{ kind: "all" }, true, [1, 3]], [{ kind: "package", packageId: "p", lessonId: "l2" }, true, [3]], [{ kind: "orphaned" }, false, [4]], [{ kind: "orphaned" }, true, []], [{ kind: "standalone" }, false, []]];
  for (const [f, revisit, want] of cases) expect(filterExplanations(explanations, f, revisit).map((e) => e.id)).toEqual(want);
});
