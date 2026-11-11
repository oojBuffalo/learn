import { expect, it } from "vitest";
import { browserDraftStore, clearDraft, draftKey, draftSession, readDraft, restoreState, restoredDraftId, rowDrafts, writeDraft } from "../src/drafts.js";
import type { DraftStore } from "../src/drafts.js";
function mem(): DraftStore {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: (k) => { values.delete(k); } };
}
function broken(): DraftStore {
  const fail = () => { throw new Error("blocked"); };
  return { get length(): number { return fail(); }, key: fail, getItem: fail, setItem: fail, removeItem: fail };
}
const k = "study.draft.note.new";
const at = (minute: number) => new Date(Date.UTC(2026, 9, 22, 10, minute));
it("draftKey format", () => {
  expect(draftKey("note", "new")).toBe(k); expect(draftKey("explanation", 7)).toBe("study.draft.explanation.7");
});
it("round-trips and clears a draft", () => {
  const s = mem(); expect(writeDraft(s, k, "body", new Date("2026-10-22T10:00:00.000Z"))).toBe(true);
  expect(readDraft(s, k)).toEqual({ body: "body", at: "2026-10-22T10:00:00.000Z" });
  expect(clearDraft(s, k)).toBe(true); expect(readDraft(s, k)).toBeNull();
});
it("treats corrupt or foreign values as no draft", () => {
  const s = mem();
  for (const value of ["{not json", '{"body":1,"at":"x"}', '"text"', "null"]) { s.setItem(k, value); expect(readDraft(s, k)).toBeNull(); }
});
it("never throws on a broken store", () => {
  expect(readDraft(broken(), k)).toBeNull();
  expect(writeDraft(broken(), k, "b", new Date())).toBe(false); expect(clearDraft(broken(), k)).toBe(false);
  expect(rowDrafts(broken(), "note")).toEqual([]);
  const session = draftSession(broken());
  expect(() => { session.write(k, "b", new Date()); session.clear(k); }).not.toThrow();
  expect(session.owns(k, "b")).toBe(true); expect(session.dropped(k)).toBe(false);
  expect(() => { const s = browserDraftStore(); s.setItem(k, "b"); s.getItem(k); s.removeItem(k); }).not.toThrow();
});

it("lists drafts kept under row ids, newest first, and keeps reading drafts stored before sessions existed", () => {
  const s = mem();
  s.setItem("study.draft.note.12", JSON.stringify({ body: "Older format draft", at: at(5).toISOString() }));
  writeDraft(s, "study.draft.note.3", "Earlier", at(1)); writeDraft(s, k, "New slot", at(2));
  writeDraft(s, "study.draft.explanation.4", "Other kind", at(3));
  for (const key of ["study.draft.note.07", "study.draft.note.0", "study.draft.note.1x", "study.draft.note.99999999999999999999", "study.draft.note"]) writeDraft(s, key, "Not a row", at(4));
  s.setItem("study.draft.note.8", "{not json"); s.setItem("unrelated", "x");
  expect(rowDrafts(s, "note")).toEqual([
    { id: 12, body: "Older format draft", at: at(5).toISOString() }, { id: 3, body: "Earlier", at: at(1).toISOString() }]);
  expect(rowDrafts(s, "explanation")).toEqual([{ id: 4, body: "Other kind", at: at(3).toISOString() }]);
});

it("passes a kept draft's id to a new editor through navigation state", () => {
  expect(restoredDraftId(restoreState(5))).toBe(5);
  for (const state of [null, undefined, "5", {}, { restoreDraft: "5" }, { restoreDraft: 0 }, { restoreDraft: 1.5 }, { restoreDraft: 2 ** 60 }, { editorKey: "x" }]) {
    expect(restoredDraftId(state)).toBeNull();
  }
});

it("a session owns an empty key it never wrote, its own text and the text it holds, but not another editor's", () => {
  const s = mem(); const mine = draftSession(s); const other = draftSession(s);
  expect(mine.owns(k, "Typed")).toBe(true);
  mine.write(k, "Typed", at(1)); expect(mine.owns(k, "Typed")).toBe(true); expect(mine.owns(k, "Typed more")).toBe(true);
  other.write(k, "Other text", at(2)); expect(mine.owns(k, "Typed more")).toBe(false); expect(mine.owns(k, "Other text")).toBe(true);
  expect(mine.dropped(k)).toBe(false);
});

it("a session tells its own clear from another editor's Discard", () => {
  const s = mem(); const late = draftSession(s); const other = draftSession(s);
  late.write(k, "Late text", at(1)); other.clear(k);
  expect(late.dropped(k)).toBe(true); expect(late.owns(k, "Late text")).toBe(false);
  late.write(k, "Typed after the discard", at(2));
  expect(late.dropped(k)).toBe(false); expect(late.owns(k, "Typed after the discard")).toBe(true);
  late.clear(k);
  expect(late.dropped(k)).toBe(false); expect(late.owns(k, "Anything")).toBe(true);
  other.write(k, "Other text", at(3)); other.clear(k);
  expect(late.dropped(k)).toBe(false);
});

it("a failed write keeps a session's claim on the text it last stored", () => {
  const s = mem(); let full = false;
  const store: DraftStore = { ...s, get length() { return s.length; }, setItem: (key, value) => { if (full) throw new Error("quota"); s.setItem(key, value); } };
  const session = draftSession(store);
  session.write(k, "Stored", at(1)); full = true; session.write(k, "Too big", at(2));
  expect(readDraft(s, k)?.body).toBe("Stored"); expect(session.owns(k, "Too big")).toBe(true);
});
