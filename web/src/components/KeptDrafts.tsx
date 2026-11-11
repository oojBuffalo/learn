import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, getExplanation, getNote } from "../api.js";
import { browserDraftStore, clearDraft, draftKey, DRAFTS_CHANGED, readDraft, recordDiscard, restoreState, rowDrafts } from "../drafts.js";
import type { Draft, DraftKind } from "../drafts.js";
import { headline, message } from "../text.js";

type Kept = Draft & { id: number };

export function KeptDraftsView({ kind, drafts, error, onRestore, onDiscard, onRetry }: {
  kind: DraftKind; drafts: Kept[]; error: string | null;
  onRestore: (draft: Kept) => void; onDiscard: (draft: Kept) => void; onRetry: () => void;
}) {
  const heading = useId();
  if (drafts.length === 0 && error === null) return null;
  return <section className="sheet kept-drafts" aria-labelledby={heading}><div className="sheet-head"><h2 id={heading}>Kept drafts</h2>
    <p className="note">{kind === "note" ? "Unsaved text from notes that were deleted. Restore it as a new note, or discard it."
      : "Unsaved text from explanations that were removed. Restore it as a new explanation, or discard it."}</p></div>
    {drafts.map((draft) => <div className="kept-row" key={draft.id}>
      <p className="kept-title">{headline(draft.body)}</p>
      <p className="meta">{`Unsaved since ${new Date(draft.at).toLocaleString()}`}</p>
      <div className="actions"><button className="btn" onClick={() => onRestore(draft)}>Restore</button>
        <button className="btn btn-quiet" onClick={() => onDiscard(draft)}>Discard</button></div>
    </div>)}
    {error !== null && <div className="kept-row"><p className="errors" role="alert">{`Some drafts couldn’t be checked (${error}).`}</p>
      <div><button className="btn" onClick={onRetry}>Check again</button></div></div>}
  </section>;
}

/**
 * Drafts whose note or explanation is gone, so no editor would offer them; text there is kept until restored or
 * discarded. The list is checked again when Notes retries, when this tab becomes visible, and when a draft changes
 * here or in another tab.
 */
export default function KeptDrafts({ kind, refreshKey }: { kind: DraftKind; refreshKey: number }) {
  const navigate = useNavigate();
  const [store] = useState(browserDraftStore);
  const [checks, setChecks] = useState(0);
  const [kept, setKept] = useState<{ kind: DraftKind; drafts: Kept[]; error: string | null }>({ kind, drafts: [], error: null });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const again = () => setChecks((n) => n + 1);
    // An editor rewrites its draft on every key, so a burst of changes is checked once it pauses.
    const soon = () => { clearTimeout(timer); timer = setTimeout(again, 300); };
    const visible = () => { if (document.visibilityState === "visible") again(); };
    const changed = (e: StorageEvent) => { if (e.key === null || e.key.startsWith("study.draft.")) soon(); };
    document.addEventListener("visibilitychange", visible); window.addEventListener("storage", changed); window.addEventListener(DRAFTS_CHANGED, soon);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible); window.removeEventListener("storage", changed); window.removeEventListener(DRAFTS_CHANGED, soon);
    };
  }, []);
  useEffect(() => {
    let live = true;
    const load = kind === "note" ? getNote : getExplanation;
    // Only a row that answers 404 is gone; a draft of a row that still exists is offered when that row opens.
    Promise.all(rowDrafts(store, kind).map((draft) => load(draft.id).then(() => ({ draft: null, error: null }),
      (e: unknown) => e instanceof ApiError && e.code === "not_found" ? { draft, error: null } : { draft: null, error: message(e) })))
      .then((found) => {
        if (!live) return;
        // A draft discarded, restored or rewritten while its row was being looked up shows as it is now.
        const drafts = found.flatMap((f) => {
          const current = f.draft && readDraft(store, draftKey(kind, f.draft.id));
          return f.draft && current ? [{ id: f.draft.id, ...current }] : [];
        });
        setKept({ kind, drafts, error: found.find((f) => f.error !== null)?.error ?? null });
      });
    return () => { live = false; };
  }, [kind, store, refreshKey, checks]);
  function discard(draft: Kept) {
    const key = draftKey(kind, draft.id);
    const current = readDraft(store, key);
    // Text written there since the list loaded, by an editor that restored it, stays and is shown instead.
    const same = current?.body === draft.body && current.at === draft.at;
    // Recorded before the clear, so a save settling in another tab in between sees it, and again after the clear,
    // which frees space, if storage was full. The origin is recorded only when the draft itself is removed.
    const record = () => recordDiscard(store, key, { body: draft.body, origin: same ? current.origin : undefined }, new Date());
    const recorded = record();
    if (same && clearDraft(store, key) && !recorded) record();
    const left = readDraft(store, key);
    setKept((list) => ({ ...list, drafts: list.drafts.flatMap((d) => d.id !== draft.id ? [d] : left ? [{ id: d.id, ...left }] : []) }));
  }
  const shown = kept.kind === kind ? kept : { drafts: [], error: null };
  return <KeptDraftsView kind={kind} drafts={shown.drafts} error={shown.error} onRetry={() => setChecks((n) => n + 1)}
    onRestore={(draft) => navigate(kind === "note" ? "/notes/new" : "/notes/explain/new", { state: restoreState(draft.id) })} onDiscard={discard} />;
}
