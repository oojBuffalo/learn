import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BODY_MAX } from "@study/shared";
import type { NotePatch, NoteTarget, NoteTargetView } from "@study/shared";
import { ApiError, createNote, deleteNote, getNote, listPackages, updateNote } from "../api.js";
import MarkdownEditor from "../components/MarkdownEditor.js";
import Icon from "../components/Icon.js";
import TargetSelect, { decodeTarget, encodeTarget } from "../components/TargetSelect.js";
import type { TargetPackage } from "../components/TargetSelect.js";
import { browserDraftStore, clearDraft, draftKey, readDraft, useDraft, writeDraft } from "../drafts.js";
import type { DraftStore } from "../drafts.js";
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
  const initial = useRef({ noteId, prefill: params.get("packageId")
    ? decodeTarget(`${params.get("packageId")}/${params.get("lessonId") ?? ""}`) : null });
  const invalidId = initial.current.noteId !== undefined && !/^[1-9][0-9]*$/.test(initial.current.noteId);
  const [id, setId] = useState<number | null>(() => initial.current.noteId && !invalidId ? Number(initial.current.noteId) : null);
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
  const draft = useDraft(draftKey("note", id ?? "new"), saved?.body ?? null);
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
        latestBody.current = note?.body ?? "";
        setBody(latestBody.current); setTarget(value); setSaved({ body: latestBody.current, target: value });
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
    latestBody.current = value; setBody(value);
    if (value !== saved?.body || encodeTarget(target) !== encodeTarget(saved?.target ?? null)) draft.write(value);
    else draft.clear();
  }

  // A newer editor of the same key may have stored its own text since this save started; a late settle leaves that draft alone.
  function ownsDraft(store: DraftStore, key: string): boolean {
    const stored = readDraft(store, key);
    return stored === null || stored.body === latestBody.current;
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
      const store = browserDraftStore();
      if (creating && ownsDraft(store, draftKey("note", "new"))) clearDraft(store, draftKey("note", "new"));
      const key = draftKey("note", note.id);
      if (ownsDraft(store, key)) {
        if (latestBody.current === sent.body) clearDraft(store, key);
        else writeDraft(store, key, latestBody.current, new Date());
      }
      if (!mounted.current) return;
      setId(note.id); setSaved(sent); setOrphaned(note.orphaned);
      if (creating) navigate(`/notes/${note.id}`, { replace: true, state: { editorKey } });
    } catch (e) {
      const gone = !creating && e instanceof ApiError && e.code === "not_found" && e.message === "unknown note";
      if (!mounted.current) {
        if (gone) {
          // The editor and its note are both gone: New note offers the text, unless another new note's text is there.
          const store = browserDraftStore();
          if (ownsDraft(store, draftKey("note", "new"))) {
            writeDraft(store, draftKey("note", "new"), latestBody.current, new Date()); clearDraft(store, draftKey("note", id));
          }
        }
        return;
      }
      if (gone) {
        setId(null); setSaved({ body: "", target });
        writeDraft(browserDraftStore(), draftKey("note", "new"), latestBody.current, new Date());
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
      draft.clear(); if (mounted.current) navigate("/notes");
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
      <button className="btn" onClick={() => { edit(draft.offer!.body); draft.dismiss(); }}>Restore</button>
      <button className="btn btn-quiet" onClick={draft.clear}>Discard</button></p>}
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
