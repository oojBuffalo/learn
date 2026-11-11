import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, getExplanation, getNote } from "../api.js";
import { browserDraftStore, clearDraft, draftKey, readDraft, restoreState, rowDrafts } from "../drafts.js";
import type { Draft, DraftKind } from "../drafts.js";
import { headline } from "../text.js";

type Kept = Draft & { id: number };

export function KeptDraftsView({ kind, drafts, onRestore, onDiscard }: {
  kind: DraftKind; drafts: Kept[]; onRestore: (draft: Kept) => void; onDiscard: (draft: Kept) => void;
}) {
  const heading = useId();
  if (drafts.length === 0) return null;
  return <section className="sheet kept-drafts" aria-labelledby={heading}><div className="sheet-head"><h2 id={heading}>Kept drafts</h2>
    <p className="note">{kind === "note" ? "Unsaved text from notes that were deleted. Restore it as a new note, or discard it."
      : "Unsaved text from explanations that were removed. Restore it as a new explanation, or discard it."}</p></div>
    {drafts.map((draft) => <div className="kept-row" key={draft.id}>
      <p className="kept-title">{headline(draft.body)}</p>
      <p className="meta">{`Unsaved since ${new Date(draft.at).toLocaleString()}`}</p>
      <div className="actions"><button className="btn" onClick={() => onRestore(draft)}>Restore</button>
        <button className="btn btn-quiet" onClick={() => onDiscard(draft)}>Discard</button></div>
    </div>)}
  </section>;
}

/** Drafts whose note or explanation is gone, so no editor would offer them; text there is kept until restored or discarded. */
export default function KeptDrafts({ kind }: { kind: DraftKind }) {
  const navigate = useNavigate();
  const [store] = useState(browserDraftStore);
  const [kept, setKept] = useState<{ kind: DraftKind; drafts: Kept[] }>({ kind, drafts: [] });
  useEffect(() => {
    let live = true;
    const load = kind === "note" ? getNote : getExplanation;
    // Only a row that answers 404 is gone; a draft of a row that still exists is offered when that row opens.
    Promise.all(rowDrafts(store, kind).map((draft) => load(draft.id).then(() => [],
      (e: unknown) => e instanceof ApiError && e.code === "not_found" ? [draft] : [])))
      .then((found) => { if (live) setKept({ kind, drafts: found.flat() }); });
    return () => { live = false; };
  }, [kind, store]);
  function discard(draft: Kept) {
    const key = draftKey(kind, draft.id);
    const current = readDraft(store, key);
    // Text written there since the list loaded, by an editor that restored it, stays and is shown instead.
    if (current?.body === draft.body && current.at === draft.at) clearDraft(store, key);
    const left = readDraft(store, key);
    setKept((list) => ({ ...list, drafts: list.drafts.flatMap((d) => d.id !== draft.id ? [d] : left ? [{ id: d.id, ...left }] : []) }));
  }
  return <KeptDraftsView kind={kind} drafts={kept.kind === kind ? kept.drafts : []}
    onRestore={(draft) => navigate(kind === "note" ? "/notes/new" : "/notes/explain/new", { state: restoreState(draft.id) })} onDiscard={discard} />;
}
