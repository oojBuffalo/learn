import { expect, it } from "vitest";
import { browserDraftStore, clearDraft, draftKey, readDraft, writeDraft } from "../src/drafts.js";
import type { DraftStore } from "../src/drafts.js";
function mem(): DraftStore {
  const values = new Map<string, string>();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: (k) => { values.delete(k); } };
}
function broken(): DraftStore { const fail = () => { throw new Error("blocked"); }; return { getItem: fail, setItem: fail, removeItem: fail }; }
const k = "study.draft.note.new";
it("draftKey format", () => {
  expect(draftKey("note", "new")).toBe(k); expect(draftKey("explanation", 7)).toBe("study.draft.explanation.7");
});
it("round-trips and clears a draft", () => {
  const s = mem(); writeDraft(s, k, "body", new Date("2026-10-22T10:00:00.000Z"));
  expect(readDraft(s, k)).toEqual({ body: "body", at: "2026-10-22T10:00:00.000Z" });
  clearDraft(s, k); expect(readDraft(s, k)).toBeNull();
});
it("treats corrupt or foreign values as no draft", () => {
  const s = mem();
  for (const value of ["{not json", '{"body":1,"at":"x"}', '"text"', "null"]) { s.setItem(k, value); expect(readDraft(s, k)).toBeNull(); }
});
it("never throws on a broken store", () => {
  expect(readDraft(broken(), k)).toBeNull();
  expect(() => writeDraft(broken(), k, "b", new Date())).not.toThrow(); expect(() => clearDraft(broken(), k)).not.toThrow();
  expect(() => { const s = browserDraftStore(); s.setItem(k, "b"); s.getItem(k); s.removeItem(k); }).not.toThrow();
});
