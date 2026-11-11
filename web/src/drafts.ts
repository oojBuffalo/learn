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
export function readDraft(store: DraftStore, key: string): Draft | null {
  try {
    const parsed: unknown = JSON.parse(store.getItem(key) ?? "null");
    if (parsed !== null && typeof parsed === "object" && "body" in parsed && "at" in parsed && typeof parsed.body === "string" && typeof parsed.at === "string") {
      const origin = "origin" in parsed && typeof parsed.origin === "string" ? { origin: parsed.origin } : {};
      return { body: parsed.body, at: parsed.at, ...origin };
    }
  } catch { /* An unavailable store or corrupt draft must not break editing. */ }
  return null;
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
  const ids: number[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      const rest = key?.startsWith(prefix) ? key.slice(prefix.length) : "";
      if (/^[1-9][0-9]*$/.test(rest) && Number.isSafeInteger(Number(rest))) ids.push(Number(rest));
    }
  } catch { /* An unavailable store lists nothing. */ }
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
// Each draft key keeps its own discards, so discards elsewhere never push one out.
const DISCARDS = "study.draft.discarded.";
const discardsKey = (key: string) => DISCARDS + key;
type Discard = { text: string; at: string; origin?: string };
// Length plus FNV-1a over the UTF-16 code units: enough to match a discarded body without storing it again.
function fingerprint(body: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) hash = Math.imul(hash ^ body.charCodeAt(i), 0x01000193) >>> 0;
  return `${body.length}:${hash.toString(16)}`;
}
function readDiscards(store: DraftStore, storageKey: string): Discard[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((d): d is Discard => d !== null && typeof d === "object"
      && typeof d.text === "string" && typeof d.at === "string" && (d.origin === undefined || typeof d.origin === "string")) : [];
  } catch { return []; }
}
/**
 * Remembers that the user discarded this text under the key, so a save that settles later never brings it back.
 * Pass the draft's `origin` only when the draft was actually removed; a draft only dismissed may have newer text.
 * A key keeps its 20 newest discards from the last week; no save stays pending that long, so older records, under
 * any key, are removed here.
 */
export function recordDiscard(store: DraftStore, key: string, draft: { body: string; origin?: string }, now: Date): void {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const expired: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const other = store.key(i);
      if (other?.startsWith(DISCARDS) && !readDiscards(store, other).some((d) => d.at > weekAgo)) expired.push(other);
    }
    for (const other of expired) store.removeItem(other);
  } catch { /* Old records only cost space. */ }
  const discards = [...readDiscards(store, discardsKey(key)).filter((d) => d.at > weekAgo),
    { text: fingerprint(draft.body), at: now.toISOString(), origin: draft.origin }];
  try { store.setItem(discardsKey(key), JSON.stringify(discards.slice(-20))); } catch { /* Discarding still works without storage. */ }
}

/**
 * One editor's writes and clears. Each editor remembers when it last wrote or cleared every key, so a save that
 * settles late can tell a Discard or delete made since then from its own clear or another editor's save.
 */
export interface DraftSession {
  /** Returns whether the draft was stored. */
  write(key: string, body: string, now: Date): boolean;
  clear(key: string, now?: Date): void;
  /** The editor now holds this draft's text, restored from storage, so its writes carry the draft's origin. */
  adopt(draft: Draft): void;
  /**
   * The key keeps this editor's older text because moving it failed. It is removed, if it still holds that text,
   * when the editor next stores or clears a draft under another key, or by `dropAside`.
   */
  setAside(key: string): void;
  dropAside(): void;
  /** The key is empty, or holds `holding` or the text this editor last stored there. */
  owns(key: string, holding: string): boolean;
  /**
   * Since this editor last wrote or cleared any draft, the user discarded `holding` under the key (or deleted it with
   * its note), or removed `holding` in a draft of this editor's origin under any key of its kind, where another
   * editor may have moved it.
   */
  dropped(key: string, holding: string): boolean;
}
const newOrigin = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function draftSession(store: DraftStore, started = new Date(), origin = newOrigin()): DraftSession {
  const last = new Map<string, { body: string | null; at: string }>();
  let lineage = origin;
  // Every write stores the editor's current text, so its latest write or clear anywhere is when it last stood by it.
  let latest = started.toISOString();
  let aside: string | null = null;
  const mineStill = (key: string) => {
    const stored = readDraft(store, key); const mine = last.get(key);
    return stored === null || (mine !== undefined && mine.body === stored.body && mine.at === stored.at);
  };
  const dropAside = () => { const key = aside; aside = null; if (key !== null && mineStill(key) && clearDraft(store, key)) last.set(key, { body: null, at: latest }); };
  const acted = (key: string, body: string | null, now: Date) => {
    last.set(key, { body, at: now.toISOString() }); latest = now.toISOString();
    // Storing or clearing the set-aside key itself settles it; storing or clearing elsewhere supersedes its text.
    if (aside === key) aside = null; else if (aside !== null) dropAside();
    changed();
  };
  return {
    setAside(key) { aside = key; },
    dropAside,
    adopt(draft) { if (draft.origin) lineage = draft.origin; },
    write(key, body, now) {
      if (!writeDraft(store, key, body, now, lineage)) return false;
      acted(key, body, now); return true;
    },
    clear(key, now = new Date()) { if (clearDraft(store, key)) acted(key, null, now); },
    owns(key, holding) {
      const stored = readDraft(store, key);
      const mine = last.get(key);
      return stored === null || stored.body === holding || (mine !== undefined && mine.body === stored.body && mine.at === stored.at);
    },
    // An emptied key alone proves nothing: another editor that restored and saved this text clears it too, and this
    // editor's late request may since have overwritten that save. Only a recorded Discard or delete counts.
    // The same words discarded under another row are a different draft, and an older revision of this editor's
    // draft is not its current text; across keys only this origin's current words count.
    dropped(key, holding) {
      const text = fingerprint(holding);
      if (readDiscards(store, discardsKey(key)).some((d) => d.text === text && d.at > latest)) return true;
      const kind = discardsKey(key.slice(0, key.lastIndexOf(".") + 1));
      const keys: string[] = [];
      try { for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k?.startsWith(kind)) keys.push(k); } } catch { /* None to read. */ }
      return keys.some((k) => readDiscards(store, k).some((d) => d.origin === lineage && d.text === text && d.at > latest));
    },
  };
}

export function useDraft(key: string, savedBody: string | null, shownBody?: string): {
  offer: Draft | null; session: DraftSession; write(body: string): void; clear(): void; dismiss(): void;
} {
  const [store] = useState(browserDraftStore);
  const [session] = useState(() => draftSession(store));
  const [offer, setOffer] = useState<Draft | null>(null);
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || savedBody === null) return;
    checked.current = true;
    const draft = readDraft(store, key);
    if (draft && draft.body !== savedBody && draft.body !== shownBody) setOffer(draft);
  }, [key, savedBody, shownBody, store]);
  return {
    offer, session,
    write: (body) => session.write(key, body, new Date()),
    clear: () => { session.clear(key); setOffer(null); },
    dismiss: () => setOffer(null),
  };
}
