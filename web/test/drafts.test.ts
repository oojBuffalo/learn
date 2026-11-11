import { expect, it } from "vitest";
import { browserDraftStore, clearDraft, draftKey, draftSession, readDraft, recordDiscard, restoreState, restoredDraftId, rowDrafts, writeDraft } from "../src/drafts.js";
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
  expect(() => { session.write(k, "b", new Date()); session.clear(k); recordDiscard(broken(), k, "b", new Date()); }).not.toThrow();
  expect(session.owns(k, "b")).toBe(true); expect(session.dropped(k, "b")).toBe(false);
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
  const s = mem(); const mine = draftSession(s, at(0)); const other = draftSession(s, at(0));
  expect(mine.owns(k, "Typed")).toBe(true);
  mine.write(k, "Typed", at(1)); expect(mine.owns(k, "Typed")).toBe(true); expect(mine.owns(k, "Typed more")).toBe(true);
  other.write(k, "Other text", at(2)); expect(mine.owns(k, "Typed more")).toBe(false); expect(mine.owns(k, "Other text")).toBe(true);
  expect(mine.dropped(k, "Typed more")).toBe(false);
});

it("a session tells another editor's Discard from a clear by a save", () => {
  const s = mem(); const late = draftSession(s, at(0)); const other = draftSession(s, at(0));
  late.write(k, "Late text", at(1)); recordDiscard(s, k, "Late text", at(2)); other.clear(k, at(2));
  expect(late.dropped(k, "Late text")).toBe(true); expect(late.owns(k, "Late text")).toBe(true);
  late.write(k, "Typed after the discard", at(3));
  expect(late.dropped(k, "Typed after the discard")).toBe(false); expect(late.owns(k, "Typed after the discard")).toBe(true);
  // Another editor restored this text and saved it; a late request from this editor may since have overwritten that save.
  other.write(k, "Typed after the discard", at(4)); other.clear(k, at(5));
  expect(late.dropped(k, "Typed after the discard")).toBe(false); expect(late.owns(k, "Typed after the discard")).toBe(true);
});

it("a session never brings back text the user discarded after its last write or clear", () => {
  const s = mem(); const late = draftSession(s, at(0)); const other = draftSession(s, at(0));
  // Discarded, then the slot was typed over: the late text is still the discarded one.
  late.write(k, "Late text", at(1)); recordDiscard(s, k, "Late text", at(2)); other.write(k, "Newer text", at(3));
  expect(late.dropped(k, "Late text")).toBe(true); expect(late.dropped(k, "Late text, edited")).toBe(false);
  expect(late.dropped("study.draft.note.4", "Late text")).toBe(true); expect(late.dropped("study.draft.explanation.4", "Late text")).toBe(false);
  // This editor's own clear came first, then the same text was discarded in another tab.
  const reverted = draftSession(s, at(0)); const key = "study.draft.note.9";
  reverted.clear(key, at(4)); other.write(key, "Original", at(5)); recordDiscard(s, key, "Original", at(6)); other.clear(key, at(6));
  expect(reverted.owns(key, "Original")).toBe(true); expect(reverted.dropped(key, "Original")).toBe(true);
  // A discard older than this editor's last action is history.
  reverted.write(key, "Original", at(7)); reverted.clear(key, at(8));
  expect(reverted.dropped(key, "Original")).toBe(false);
  // An editor that never touched the key checks discards made since it opened.
  expect(draftSession(s, at(5)).dropped(key, "Original")).toBe(true); expect(draftSession(s, at(7)).dropped(key, "Original")).toBe(false);
});

it("a session counts a discard of its text under another key of the same kind, made after its last action", () => {
  const s = mem(); const late = draftSession(s, at(0)); const key = "study.draft.note.5";
  late.write(key, "Moved text", at(1));
  recordDiscard(s, "study.draft.explanation.new", "Moved text", at(2)); expect(late.dropped(key, "Moved text")).toBe(false);
  recordDiscard(s, "study.draft.note.new", "Other text", at(2)); expect(late.dropped(key, "Moved text")).toBe(false);
  recordDiscard(s, "study.draft.note.new", "Moved text", at(2)); expect(late.dropped(key, "Moved text")).toBe(true);
  late.write(key, "Moved text", at(3)); expect(late.dropped(key, "Moved text")).toBe(false);
});

it("keeps each key's 20 newest discards from the last week, untouched by discards under other keys, and ignores a corrupt list", () => {
  const s = mem(); const session = draftSession(s, at(0));
  recordDiscard(s, k, "Kept a long time", at(1));
  for (let i = 0; i < 100; i++) recordDiscard(s, `study.draft.note.${i + 1}`, "Elsewhere", at(2));
  expect(session.dropped(k, "Kept a long time")).toBe(true);
  for (let i = 0; i < 20; i++) recordDiscard(s, k, `Text ${i}`, at(3));
  expect(session.dropped(k, "Kept a long time")).toBe(false); expect(session.dropped(k, "Text 0")).toBe(true);
  recordDiscard(s, k, "A week later", new Date(at(3).getTime() + 8 * 24 * 60 * 60 * 1000));
  expect(session.dropped(k, "Text 19")).toBe(false); expect(session.dropped(k, "A week later")).toBe(true);
  for (const value of ["{not json", '{"text":1}', '[{"text":1,"at":"y"}, null]']) {
    s.setItem(`study.draft.discarded.${k}`, value); expect(session.dropped(k, "A week later")).toBe(false);
    expect(() => recordDiscard(s, k, "Text 50", at(4))).not.toThrow(); expect(session.dropped(k, "Text 50")).toBe(true);
  }
  expect(rowDrafts(s, "note")).toEqual([]);
});

it("a discard removes week-old discard records under every key and keeps recent ones", () => {
  const s = mem(); const session = draftSession(s, at(0));
  recordDiscard(s, "study.draft.note.1", "Old", at(1)); recordDiscard(s, "study.draft.note.2", "Recent", new Date(at(1).getTime() + 3 * 24 * 60 * 60 * 1000));
  s.setItem("study.draft.discarded.study.draft.note.3", "{not json");
  recordDiscard(s, k, "Now", new Date(at(1).getTime() + 8 * 24 * 60 * 60 * 1000));
  expect(s.getItem("study.draft.discarded.study.draft.note.1")).toBeNull(); expect(s.getItem("study.draft.discarded.study.draft.note.3")).toBeNull();
  expect(session.dropped("study.draft.note.2", "Recent")).toBe(true); expect(session.dropped(k, "Now")).toBe(true);
});

it("discarding older text spares newer text whose write failed", () => {
  const s = mem(); let full = false;
  const store: DraftStore = { ...s, get length() { return s.length; }, setItem: (key, value) => { if (full) throw new Error("quota"); s.setItem(key, value); } };
  const late = draftSession(store, at(0)); const other = draftSession(s, at(0));
  late.write(k, "Stored", at(1)); full = true; late.write(k, "Stored and more", at(2));
  recordDiscard(s, k, "Stored", at(3)); other.clear(k, at(3));
  expect(late.dropped(k, "Stored and more")).toBe(false); expect(late.owns(k, "Stored and more")).toBe(true);
  expect(late.dropped(k, "Stored")).toBe(true);
});

it("a failed write keeps a session's claim on the text it last stored", () => {
  const s = mem(); let full = false;
  const store: DraftStore = { ...s, get length() { return s.length; }, setItem: (key, value) => { if (full) throw new Error("quota"); s.setItem(key, value); } };
  const session = draftSession(store);
  expect(session.write(k, "Stored", at(1))).toBe(true); full = true; expect(session.write(k, "Too big", at(2))).toBe(false);
  expect(readDraft(s, k)?.body).toBe("Stored"); expect(session.owns(k, "Too big")).toBe(true);
});
