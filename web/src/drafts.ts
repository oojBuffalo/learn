import { useEffect, useRef, useState } from "react";

export interface DraftStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type DraftKind = "note" | "explanation";
/** `origin` names the editor session the text started in; it stays with the text when it is restored or moved. */
export interface Draft { body: string; at: string; origin?: string }
const NO_STORE: DraftStore = { length: 0, key: () => null, getItem: () => null, setItem: () => {}, removeItem: () => {} };
export function browserDraftStore(): DraftStore {
  try { const store = window.localStorage; store.getItem("study.draft.probe"); return store; }
  catch { return NO_STORE; }
}
export const draftKey = (kind: DraftKind, id: number | "new"): string => `study.draft.${kind}.${id}`;
// A stored `{ <field>: string, at: string, origin?: string }`; an unavailable store or corrupt record counts as none.
function readRecord<F extends "body" | "text">(store: DraftStore, key: string, field: F): (Record<F, string> & { at: string; origin?: string }) | null {
  try {
    const r = JSON.parse(store.getItem(key) ?? "null") as Record<string, unknown> | null;
    if (r !== null && typeof r === "object" && typeof r[field] === "string" && typeof r.at === "string") {
      return { [field]: r[field], at: r.at, ...(typeof r.origin === "string" ? { origin: r.origin } : {}) } as Record<F, string> & { at: string; origin?: string };
    }
  } catch { /* Editing still works. */ }
  return null;
}
export const readDraft = (store: DraftStore, key: string): Draft | null => readRecord(store, key, "body");
// Every stored key that starts with the prefix; an unavailable store has none.
function keysUnder(store: DraftStore, prefix: string): string[] {
  const keys: string[] = [];
  try { for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k?.startsWith(prefix)) keys.push(k); } } catch { /* None to list. */ }
  return keys;
}
/** Returns whether the draft was stored. */
export function writeDraft(store: DraftStore, key: string, body: string, now: Date, origin?: string): boolean {
  try { store.setItem(key, JSON.stringify({ body, at: now.toISOString(), origin })); return true; } catch { /* Editing still works when storage is unavailable. */ }
  return false;
}
/** Returns whether the draft was removed. */
export function clearDraft(store: DraftStore, key: string): boolean {
  try { store.removeItem(key); return true; } catch { /* A failed storage write must not break saving. */ }
  return false;
}

/** Every draft stored under a row id of this kind (not the `new` slot), newest first. */
export function rowDrafts(store: DraftStore, kind: DraftKind): (Draft & { id: number })[] {
  const prefix = `study.draft.${kind}.`;
  const ids = keysUnder(store, prefix).map((key) => key.slice(prefix.length))
    .filter((rest) => /^[1-9][0-9]*$/.test(rest) && Number.isSafeInteger(Number(rest))).map(Number);
  return ids.flatMap((id) => { const draft = readDraft(store, draftKey(kind, id)); return draft ? [{ id, ...draft }] : []; })
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
}

/** Navigation state that opens a new editor on a kept draft of a deleted row. */
export const restoreState = (id: number) => ({ restoreDraft: id });
export function restoredDraftId(state: unknown): number | null {
  const id = state !== null && typeof state === "object" && "restoreDraft" in state ? state.restoreDraft : null;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Fired on this window when an editor stores or removes a draft; other tabs get a `storage` event instead. */
export const DRAFTS_CHANGED = "study:drafts-changed";
const changed = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(DRAFTS_CHANGED)); };
// Every discard is stored under its own key, `study.draft.discarded.<draft key>.<time>.<random>`, so two tabs
// discarding at once never overwrite each other's record.
const DISCARDS = "study.draft.discarded.";
// How long discard records are kept, and so how long an editor's last write can vouch for its text.
const KEPT_FOR = 7 * 24 * 60 * 60 * 1000;
// Orders discards against editors' writes across tabs: a stamp is never earlier than the last one any tab took and
// never equal to it, even when two actions share a millisecond or the system clock is set back.
const CLOCK = "study.draft.clock";
const MAX_TIME = 8.64e15;
function stamp(store: DraftStore, now: Date): string {
  let last = 0;
  try { last = Number(store.getItem(CLOCK)); } catch { /* No clock yet. */ }
  // A corrupt clock (not a number, or beyond what a Date holds) counts as none.
  if (!Number.isFinite(last) || last < 0 || last >= MAX_TIME) last = 0;
  const next = Math.max(now.getTime(), last + 1);
  try { store.setItem(CLOCK, String(next)); } catch { /* Ordering then falls back to this tab's clock. */ }
  return new Date(next).toISOString();
}
type Discard = { text: string; at: string; origin?: string };
// Length plus FNV-1a over the UTF-16 code units: enough to match a discarded body without storing it again.
function fingerprint(body: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) hash = Math.imul(hash ^ body.charCodeAt(i), 0x01000193) >>> 0;
  return `${body.length}:${hash.toString(16)}`;
}
/** The discard records whose storage key starts with `study.draft.discarded.` + `prefix`. */
const discardsUnder = (store: DraftStore, prefix: string): Discard[] =>
  keysUnder(store, DISCARDS + prefix).flatMap((k) => { const d = readRecord(store, k, "text"); return d ? [d] : []; });
/**
 * Remembers that the user discarded this text under the key, so a save that settles later never brings it back.
 * Pass the draft's `origin` only when the draft was actually removed; a draft only dismissed may have newer text.
 * Records are kept for a week, however many there are, so no number of later discards pushes out one that a save
 * still pending may need; week-old records, under any key, are removed here. Callers record around the clear with
 * `discardAround`.
 */
export function recordDiscard(store: DraftStore, key: string, draft: { body: string; origin?: string }, now: Date): boolean {
  const weekAgo = new Date(now.getTime() - KEPT_FOR).toISOString();
  for (const k of keysUnder(store, DISCARDS)) {
    const d = readRecord(store, k, "text");
    if (d === null || d.at <= weekAgo) { try { store.removeItem(k); } catch { /* Old records only cost space. */ } }
  }
  const record: Discard = { text: fingerprint(draft.body), at: stamp(store, now), ...(draft.origin ? { origin: draft.origin } : {}) };
  try { store.setItem(`${DISCARDS}${key}.${record.at}.${Math.random().toString(36).slice(2, 10)}`, JSON.stringify(record)); return true; }
  catch { /* Discarding still works without storage. */ }
  return false;
}

const newOrigin = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
/**
 * One editor's writes and clears. Each editor remembers when it last wrote or cleared every key, so a save that
 * settles late can tell a Discard or delete made since then from its own clear or another editor's save.
 */
export function draftSession(store: DraftStore, started = new Date(), origin = newOrigin()) {
  const last = new Map<string, { body: string | null; at: string }>();
  let lineage = origin;
  // Every write stores the editor's current text, so its latest write or clear anywhere is when it last stood by it.
  let latest = stamp(store, started);
  let lastStored: string | null = null;
  let aside: string | null = null;
  const mineStill = (key: string) => {
    const stored = readDraft(store, key); const mine = last.get(key);
    return stored === null || (mine !== undefined && mine.body === stored.body && mine.at === stored.at);
  };
  const dropAside = () => { const key = aside; aside = null; if (key !== null && mineStill(key) && clearDraft(store, key)) last.set(key, { body: null, at: latest }); };
  // The stamp is taken before the write or clear is visible to other tabs, so a discard of that text in another tab
  // has to read the clock afterwards and always stamps later.
  const acted = (key: string, body: string | null, now: Date, at: string) => {
    last.set(key, { body, at: now.toISOString() }); latest = at;
    // Storing or clearing the set-aside key itself settles it; storing or clearing elsewhere supersedes its text.
    if (aside === key) aside = null; else if (aside !== null) dropAside();
    changed();
  };
  return {
    /**
     * The key keeps this editor's older text because moving it failed. It is removed, if it still holds that text,
     * when the editor next stores or clears a draft under another key, or by `dropAside`.
     */
    setAside(key: string) { aside = key; },
    dropAside,
    /**
     * The editor now holds this draft's text, restored from the key, so its writes carry the draft's origin and the
     * stored draft counts as this editor's own.
     */
    adopt(draft: Draft, key: string) { if (draft.origin) lineage = draft.origin; if (!last.has(key)) last.set(key, { body: draft.body, at: draft.at }); },
    /** Returns whether the draft was stored. */
    write(key: string, body: string, now: Date) {
      const at = stamp(store, now);
      if (!writeDraft(store, key, body, now, lineage)) return false;
      lastStored = body; acted(key, body, now, at); return true;
    },
    clear(key: string, now = new Date()) { const at = stamp(store, now); if (clearDraft(store, key)) acted(key, null, now, at); },
    /** The key is empty, or holds `holding` or the text this editor last stored there. */
    owns: (key: string, holding: string) => mineStill(key) || readDraft(store, key)?.body === holding,
    /**
     * Since this editor last wrote or cleared any draft, the user discarded `holding` under the key (or deleted it with
     * its note), or removed `holding` in a draft of this editor's origin under any key of its kind, where another
     * editor may have moved it. Also true once that write is a week old, since discards older than that are removed,
     * if `holding` is the text the editor last stored: a save resuming that late (a suspended computer) leaves it where
     * it is. Text that never reached storage is still written.
     *
     * An emptied key alone proves nothing: another editor that restored and saved this text clears it too, and this
     * editor's late request may since have overwritten that save. Only a recorded Discard or delete counts. The same
     * words discarded under another row are a different draft, and an older revision of this editor's draft is not
     * its current text; across keys only this origin's current words count.
     */
    dropped(key: string, holding: string, now = new Date()) {
      if (lastStored === holding && Date.parse(latest) <= now.getTime() - KEPT_FOR) return true;
      const text = fingerprint(holding);
      if (discardsUnder(store, `${key}.`).some((d) => d.text === text && d.at > latest)) return true;
      return discardsUnder(store, key.slice(0, key.lastIndexOf(".") + 1)).some((d) => d.origin === lineage && d.text === text && d.at > latest);
    },
  };
}

/**
 * Records a discard before `clear` runs, so a save settling in another tab in between already sees the record, and
 * again after it (which frees space) if storage was full.
 */
export function discardAround(record: () => boolean, clear: () => unknown): void {
  const recorded = record(); clear(); if (!recorded) record();
}

/** An editor's draft of one row (or the `new` slot), with the moves its saves, discards and deletes make. */
export function useDraft(kind: DraftKind, id: number | "new", savedBody: string | null, shownBody: string) {
  const [store] = useState(browserDraftStore);
  const [session] = useState(() => draftSession(store));
  const [offer, setOffer] = useState<Draft | null>(null);
  const latest = useRef("");
  const checked = useRef(false);
  const slot = draftKey(kind, id);
  useEffect(() => {
    if (checked.current || savedBody === null) return;
    checked.current = true;
    const draft = readDraft(store, slot);
    if (draft && draft.body !== savedBody && draft.body !== shownBody) setOffer(draft);
  }, [slot, savedBody, shownBody, store]);
  const write = (body: string) => session.write(slot, body, new Date());
  // A newer editor of the same key may have stored its own text, or discarded this editor's, since a save started;
  // a late settle leaves that key alone.
  const owns = (key: string) => session.owns(key, latest.current);
  // The slot holds nothing, this editor's own last text or the offer it showed; anything else is newer text from
  // another editor of the row.
  const ownsSlot = (last = latest.current) => {
    const stored = readDraft(store, slot);
    return stored === null || stored.body === last || stored.body === offer?.body;
  };
  return {
    offer, latest, write, dismiss: () => setOffer(null),
    /** Opens a deleted row's kept draft from Notes; its key stays this editor's draft until the save. */
    adoptKept(restore: number | null): Draft | null {
      const kept = restore === null ? null : readDraft(store, draftKey(kind, restore));
      if (kept) session.adopt(kept, draftKey(kind, restore!));
      return kept;
    },
    /** Restore on the offer: returns the text to put in the editor. */
    adoptOffer(): string { session.adopt(offer!, slot); setOffer(null); return offer!.body; },
    /** Stores the edit when it `differs` from the saved row, or else clears this editor's draft. */
    edit(value: string, differs: boolean) {
      const last = latest.current; latest.current = value;
      if (differs) { write(value); return; }
      if (ownsSlot(last)) session.clear(slot);
      setOffer(null);
      // Back at the saved text: an older draft set aside after a failed move is no longer wanted either.
      session.dropAside();
    },
    /** Drops the offered draft; text typed since the offer, here or in another tab, stays as the current draft. */
    discard() {
      if (!offer) return;
      const stored = readDraft(store, slot);
      // Only the offer itself is removed. Newer text over it, from this editor or another tab, stays where it is.
      const isOffer = stored !== null && stored.at === offer.at && stored.body === offer.body;
      const record = () => recordDiscard(store, slot, { body: offer.body, origin: isOffer ? stored.origin : undefined }, new Date());
      if (isOffer) discardAround(record, () => session.clear(slot)); else record();
      setOffer(null);
      if ((isOffer || stored === null) && latest.current !== savedBody) write(latest.current);
    },
    /**
     * After a save of `sent` stored row `rowId`. Text another editor discarded, or removed with a delete, while the save
     * was pending stays gone. A create's old draft goes only once its text is saved or stored under the new row, so
     * nothing is lost when another editor holds that key, the write fails or the text was discarded elsewhere.
     */
    saved(rowId: number, sent: string, creating: boolean, recoveryId: number | null) {
      const key = draftKey(kind, rowId); const text = latest.current;
      const dropped = session.dropped(slot, text) || session.dropped(key, text);
      const settled = text === sent;
      let moved = false;
      if (owns(key)) { if (settled) session.clear(key); else if (!dropped) moved = session.write(key, text, new Date()); }
      if (creating && (settled || moved)) {
        for (const old of [recoveryId, "new" as const]) if (old !== null && owns(draftKey(kind, old))) session.clear(draftKey(kind, old));
      }
      // Until this editor next stores or clears its draft, the old one keeps the text the new row's key couldn't.
      if (creating && !settled && !moved) session.setAside(slot);
      setOffer(null);
    },
    /**
     * A deleted row's text moves to the new draft, which the new editor offers, unless another new draft's text is
     * there; then it stays under the old key, and Notes lists it as a kept draft. Text another editor discarded stays
     * gone. Returns whether the new draft now holds this editor's text.
     */
    keepGone(oldId: number): boolean {
      const old = draftKey(kind, oldId); const fresh = draftKey(kind, "new"); const text = latest.current;
      const free = owns(fresh);
      // Discarded text stays gone whichever of the two keys it was discarded from, even after other text took the new draft.
      if (session.dropped(old, text) || session.dropped(fresh, text)) return free;
      // The old key keeps the text, and stays this editor's draft, until the new draft holds it.
      if (free && session.write(fresh, text, new Date())) { if (owns(old)) session.clear(old); return true; }
      if (owns(old)) session.write(old, text, new Date());
      return false;
    },
    /**
     * The row was deleted. Text deleted with it (its draft, its saved body and the text on screen) is recorded as
     * discarded, so a late save from another editor never brings it back. Another editor's newer draft stays, and is
     * not recorded.
     */
    deleted() {
      const now = new Date(); const stored = readDraft(store, slot);
      if (ownsSlot()) discardAround(() => !stored || recordDiscard(store, slot, stored, now), () => session.clear(slot));
      for (const body of new Set([savedBody, latest.current])) if (body) recordDiscard(store, slot, { body }, now);
      session.dropAside();
    },
  };
}
