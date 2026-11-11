import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BODY_MAX } from "@study/shared";
import type { NotePatch, NoteTarget, NoteTargetView } from "@study/shared";
import { ApiError, createNote, deleteNote, getNote, listPackages, updateNote } from "../api.js";
import MarkdownEditor from "../components/MarkdownEditor.js";
import Icon from "../components/Icon.js";
import TargetSelect, { decodeTarget, encodeTarget } from "../components/TargetSelect.js";
import type { TargetPackage } from "../components/TargetSelect.js";
import { browserDraftStore, draftKey, readDraft, recordDiscard, restoredDraftId, useDraft } from "../drafts.js";
import { headline, message } from "../text.js";

type Fields = { body: string; target: NoteTarget | null };
function fallbackPackages(target: NoteTargetView | NoteTarget | null): TargetPackage[] {
  return target === null ? [] : [{ id: target.packageId,
    title: "packageTitle" in target ? target.packageTitle ?? target.packageId : target.packageId,
    lessons: target.lessonId === null ? [] : [{ id: target.lessonId,
      title: "lessonTitle" in target ? target.lessonTitle ?? target.lessonId : target.lessonId }] }];
}

export default function NoteEditor({ editorKey }: { editorKey: string }) {
  const { noteId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initial = useRef({ noteId, prefill: params.get("packageId")
    ? decodeTarget(`${params.get("packageId")}/${params.get("lessonId") ?? ""}`) : null,
    restore: noteId === undefined ? restoredDraftId(location.state) : null });
  const invalidId = initial.current.noteId !== undefined && !/^[1-9][0-9]*$/.test(initial.current.noteId);
  const [id, setId] = useState<number | null>(() => initial.current.noteId && !invalidId ? Number(initial.current.noteId) : null);
  // Restore on Notes opens a deleted note's kept draft here, and its key stays this editor's draft until the save.
  const [recoveryId, setRecoveryId] = useState<number | null>(initial.current.restore);
  const [body, setBody] = useState("");
  const latestBody = useRef("");
  const [target, setTarget] = useState<NoteTarget | null>(initial.current.prefill);
  const [saved, setSaved] = useState<Fields | null>(null);
  const [packages, setPackages] = useState<TargetPackage[]>([]);
  const [fallback, setFallback] = useState<TargetPackage[]>([]);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [orphaned, setOrphaned] = useState(false);
  const [missing, setMissing] = useState(invalidId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const session = useRef(0);
  const slot = draftKey("note", id ?? recoveryId ?? "new");
  const draft = useDraft(slot, saved?.body ?? null, body);
  const dirty = saved !== null && (body !== saved.body || encodeTarget(target) !== encodeTarget(saved.target));
  const canSave = dirty && body.trim().length > 0 && body.length <= BODY_MAX && !pending;

  useEffect(() => {
    mounted.current = true;
    const current = ++session.current;
    if (!invalidId) {
      const oldId = initial.current.noteId;
      Promise.allSettled([oldId ? getNote(Number(oldId)) : Promise.resolve(null), listPackages()]).then(([n, p]) => {
        if (session.current !== current) return;
        if (n.status === "rejected") {
          if (n.reason instanceof ApiError && n.reason.code === "not_found") setMissing(true);
          else setLoadError(message(n.reason));
          return;
        }
        const note = n.value;
        const originalTarget = note ? note.target : initial.current.prefill;
        const value = note ? note.target && { packageId: note.target.packageId, lessonId: note.target.lessonId } : initial.current.prefill;
        const restore = initial.current.restore;
        const kept = restore === null ? null : readDraft(browserDraftStore(), draftKey("note", restore));
        if (restore !== null && !kept) setRecoveryId(null);
        if (kept) draft.session.adopt(kept, draftKey("note", restore!));
        latestBody.current = note?.body ?? kept?.body ?? "";
        setBody(latestBody.current); setTarget(value); setSaved({ body: note?.body ?? "", target: value });
        setOrphaned(note?.orphaned ?? false); setFallback(fallbackPackages(originalTarget));
        setLibraryFailed(p.status === "rejected"); setPackages(p.status === "fulfilled" ? p.value : []);
      });
    }
    return () => { mounted.current = false; session.current += 1; };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(value: string) {
    const last = latestBody.current;
    latestBody.current = value; setBody(value);
    if (value !== saved?.body || encodeTarget(target) !== encodeTarget(saved?.target ?? null)) draft.write(value);
    else {
      if (ownsSlot(last)) draft.clear(); else draft.dismiss();
      // Back at the saved text: an older draft set aside after a failed move is no longer wanted either.
      draft.session.dropAside();
    }
  }

  // Discard drops the offered draft; text typed since the offer, here or in another tab, stays as the current draft.
  function discard() {
    const offered = draft.offer;
    const stored = readDraft(browserDraftStore(), slot);
    // Only the offer itself is removed. Newer text over it, from this editor or another tab, stays where it is.
    const isOffer = offered !== null && stored !== null && stored.at === offered.at && stored.body === offered.body;
    const record = () => offered === null || recordDiscard(browserDraftStore(), slot,
      { body: offered.body, origin: isOffer ? stored.origin : undefined }, new Date());
    // Recorded before the clear, so a save settling in another tab in between sees it; again after it if storage was full.
    const recorded = record();
    if (!isOffer) { draft.dismiss(); if (stored === null && latestBody.current !== saved?.body) draft.write(latestBody.current); return; }
    draft.clear(); if (!recorded) record();
    if (latestBody.current !== saved?.body) draft.write(latestBody.current);
  }

  // A newer editor of the same key may have stored its own text, or discarded this editor's, since this save started;
  // a late settle leaves that key alone.
  function ownsDraft(key: string): boolean {
    return draft.session.owns(key, latestBody.current);
  }

  // This editor's slot holds nothing, its own last text or the offer it showed; anything else is newer text from another editor of the row.
  function ownsSlot(last = latestBody.current): boolean {
    const stored = readDraft(browserDraftStore(), slot);
    return stored === null || stored.body === last || stored.body === draft.offer?.body;
  }

  // A deleted note's text moves to the new-note draft, which New note offers, unless another new note's text is
  // there; then it stays under the old key, and Notes lists it as a kept draft. Text another editor discarded stays
  // gone. Returns whether the new-note draft now holds this editor's text.
  function keepGoneText(oldId: number): boolean {
    const drafts = draft.session;
    const old = draftKey("note", oldId); const fresh = draftKey("note", "new");
    const free = ownsDraft(fresh);
    // Discarded text stays gone whichever of the two keys it was discarded from, even after other text took the new draft.
    if (drafts.dropped(old, latestBody.current) || drafts.dropped(fresh, latestBody.current)) return free;
    // The old key keeps the text, and stays this editor's draft, until the new draft holds it.
    if (free && drafts.write(fresh, latestBody.current, new Date())) { if (ownsDraft(old)) drafts.clear(old); return true; }
    if (ownsDraft(old)) drafts.write(old, latestBody.current, new Date());
    return false;
  }

  async function save() {
    if (inFlight.current || !canSave || !saved) return;
    inFlight.current = true; setPending(true); setError(null);
    const sent: Fields = { body, target };
    const creating = id === null;
    try {
      const patch: NotePatch = {};
      if (sent.body !== saved.body) patch.body = sent.body;
      if (encodeTarget(sent.target) !== encodeTarget(saved.target)) patch.target = sent.target;
      const note = creating ? await createNote(sent) : await updateNote(id, patch);
      const drafts = draft.session;
      // Text that another editor discarded, or removed with a delete, while this save was pending stays gone.
      const key = draftKey("note", note.id);
      const dropped = drafts.dropped(slot, latestBody.current) || drafts.dropped(key, latestBody.current);
      // A create's old draft goes only once its text is saved or stored under the new note, so nothing is lost when
      // another editor holds that key, the write fails or the text was discarded elsewhere.
      const settled = latestBody.current === sent.body;
      let moved = false;
      if (ownsDraft(key)) {
        if (settled) drafts.clear(key);
        else if (!dropped) moved = drafts.write(key, latestBody.current, new Date());
      }
      if (creating && (settled || moved) && recoveryId !== null && ownsDraft(draftKey("note", recoveryId))) drafts.clear(draftKey("note", recoveryId));
      if (creating && (settled || moved) && ownsDraft(draftKey("note", "new"))) drafts.clear(draftKey("note", "new"));
      // Until this editor next stores or clears its draft, the old one keeps the text the new row's key couldn't.
      if (creating && !settled && !moved) drafts.setAside(slot);
      if (!mounted.current) return;
      draft.dismiss();
      setId(note.id); setSaved(sent); setOrphaned(note.orphaned);
      if (creating) navigate(`/notes/${note.id}`, { replace: true, state: { editorKey } });
    } catch (e) {
      const gone = !creating && e instanceof ApiError && e.code === "not_found" && e.message === "unknown note";
      if (!mounted.current) {
        if (gone) keepGoneText(id);
        return;
      }
      if (gone) {
        setId(null); setSaved({ body: "", target });
        // Recovery edits stay on the old key while another new note's text holds the new-note draft.
        setRecoveryId(keepGoneText(id) ? null : id);
        setError("This note was deleted elsewhere — Save will create it again.");
      } else setError(`Your note wasn’t saved (${message(e)}).`);
    } finally {
      inFlight.current = false; if (mounted.current) setPending(false);
    }
  }

  async function remove() {
    if (id === null || inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null);
    try {
      try { await deleteNote(id); }
      catch (e) { if (!(e instanceof ApiError && e.code === "not_found")) throw e; }
      // Another editor of this note, here or in another tab, may have stored newer text before the delete settled.
      // Text deleted with the note (its draft, its saved body and the text on screen) is recorded as discarded, so a
      // late save from another editor never brings it back. Another editor's newer draft stays, and is not recorded.
      const store = browserDraftStore(); const now = new Date();
      const deleted = readDraft(store, slot);
      if (ownsSlot()) {
        const recorded = !deleted || recordDiscard(store, slot, deleted, now);
        draft.session.clear(slot); if (!recorded && deleted) recordDiscard(store, slot, deleted, now);
      }
      for (const body of new Set([saved?.body, latestBody.current])) if (body) recordDiscard(store, slot, { body }, now);
      draft.session.dropAside();
      if (mounted.current) navigate("/notes");
    } catch (e) {
      if (mounted.current) { setConfirming(false); setError(`This note wasn’t deleted (${message(e)}).`); }
    } finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  if (missing) return <div className="page empty"><p className="empty-title">This note doesn’t exist — it may have been deleted.</p><Link className="btn" to="/notes">Back to notes</Link></div>;
  if (loadError) return <div className="page"><p className="errors" role="alert">{`This note didn’t load (${loadError}).`}</p><Link to="/notes">Back to notes</Link></div>;
  if (!saved) return <p className="loading">Loading…</p>;
  return <div className="page">
    <Link className="back-link" to="/notes"><Icon name="left" size={18} />Notes</Link>
    <header className="page-head"><p className="eyebrow">Note</p><h1 className="page-title">{id === null ? "New note" : headline(saved.body)}</h1></header>
    {libraryFailed && <p className="note">Couldn’t load your library — you can still edit the text.</p>}
    {orphaned && <p className="note">Its lesson is no longer in your library — attach it somewhere else, keep it standalone, or leave it for a re-import.</p>}
    <TargetSelect label="Attach to" packages={libraryFailed ? fallback : packages} currentOnly={libraryFailed} value={target}
      onChange={(value) => { setTarget(value); draft.write(latestBody.current); }} />
    {draft.offer && <p className="note">{`Restore unsaved text from ${new Date(draft.offer.at).toLocaleString()}?`}{" "}
      <button className="btn" onClick={() => { draft.session.adopt(draft.offer!, slot); edit(draft.offer!.body); draft.dismiss(); }}>Restore</button>
      <button className="btn btn-quiet" onClick={discard}>Discard</button></p>}
    <MarkdownEditor label="Note" value={body} packageId={target?.packageId} onChange={edit} onSave={() => void save()} />
    <div className="actions"><button className="btn btn-primary" disabled={!canSave} onClick={() => void save()}>Save</button>
      {id !== null && !confirming && <button className="btn btn-danger push" disabled={pending} onClick={() => setConfirming(true)}>Delete</button>}
      {confirming && <span className="confirm">Delete this note? This can’t be undone.
        <button className="btn btn-quiet" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
        <button className="btn btn-danger" disabled={pending} onClick={() => void remove()}>Delete</button></span>}
    </div>
    <p className="meta" role="status">{pending ? "Saving…" : dirty ? "Unsaved changes" : id !== null ? "Saved" : ""}</p>
    {error && <p className="errors" role="alert">{error}</p>}
    <p className="note">Notes live in data/study.db on this machine. Package exports don’t include them; npm run backup -w server does.</p>
  </div>;
}
