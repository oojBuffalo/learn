import { useEffect, useRef, useState } from "react";

export interface DraftStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const NO_STORE: DraftStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
export function browserDraftStore(): DraftStore {
  try { const store = window.localStorage; store.getItem("study.draft.probe"); return store; }
  catch { return NO_STORE; }
}
export const draftKey = (kind: "note" | "explanation", id: number | "new"): string => `study.draft.${kind}.${id}`;
export function readDraft(store: DraftStore, key: string): { body: string; at: string } | null {
  try {
    const parsed: unknown = JSON.parse(store.getItem(key) ?? "null");
    if (parsed !== null && typeof parsed === "object" && "body" in parsed && "at" in parsed && typeof parsed.body === "string" && typeof parsed.at === "string") return { body: parsed.body, at: parsed.at };
  } catch { /* An unavailable store or corrupt draft must not break editing. */ }
  return null;
}
export function writeDraft(store: DraftStore, key: string, body: string, now: Date): void {
  try { store.setItem(key, JSON.stringify({ body, at: now.toISOString() })); } catch { /* Editing still works when storage is unavailable. */ }
}
export function clearDraft(store: DraftStore, key: string): void {
  try { store.removeItem(key); } catch { /* A failed storage write must not break saving. */ }
}
export function useDraft(key: string, savedBody: string | null): {
  offer: { body: string; at: string } | null; write(body: string): void; clear(): void; dismiss(): void;
} {
  const [store] = useState(browserDraftStore);
  const [offer, setOffer] = useState<{ body: string; at: string } | null>(null);
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || savedBody === null) return;
    checked.current = true;
    const draft = readDraft(store, key);
    if (draft && draft.body !== savedBody) setOffer(draft);
  }, [key, savedBody, store]);
  return {
    offer,
    write: (body) => writeDraft(store, key, body, new Date()),
    clear: () => { clearDraft(store, key); setOffer(null); },
    dismiss: () => setOffer(null),
  };
}
