import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BODY_MAX } from "@study/shared";
import type { Confidence, Explanation, ExplanationPatch, NoteTarget } from "@study/shared";
import { ApiError, createExplanation, getExplanation, listExplanations, listPackages, updateExplanation } from "../api.js";
import ConfidencePicker, { ConfidenceChip, CONFIDENCE_LABEL } from "../components/ConfidencePicker.js";
import Markdown from "../components/Markdown.js";
import MarkdownEditor from "../components/MarkdownEditor.js";
import TargetSelect, { decodeTarget, encodeTarget } from "../components/TargetSelect.js";
import type { TargetPackage } from "../components/TargetSelect.js";
import { browserDraftStore, draftKey, readDraft, recordDiscard, restoredDraftId, useDraft } from "../drafts.js";
import { formatDay } from "../format.js";
import { filterSearch } from "../listFilter.js";
import { message } from "../text.js";

type Fields = { body: string; confidence: Confidence | null; target: NoteTarget | null };

export default function ExplanationEditor({ editorKey }: { editorKey: string }) {
  const { explanationId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const hintId = useId();
  const location = useLocation();
  const initial = useRef({ explanationId, prefill: params.get("packageId")
    ? decodeTarget(`${params.get("packageId")}/${params.get("lessonId") ?? ""}`) : null,
    restore: explanationId === undefined ? restoredDraftId(location.state) : null });
  const invalidId = initial.current.explanationId !== undefined && !/^[1-9][0-9]*$/.test(initial.current.explanationId);
  const [id, setId] = useState<number | null>(() => initial.current.explanationId && !invalidId ? Number(initial.current.explanationId) : null);
  // Restore on Notes opens a removed explanation's kept draft here, and its key stays this editor's draft until the save.
  const [recoveryId, setRecoveryId] = useState<number | null>(initial.current.restore);
  const [body, setBody] = useState("");
  const latestBody = useRef("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [target, setTarget] = useState<NoteTarget | null>(null);
  const [saved, setSaved] = useState<Fields | null>(null);
  const [info, setInfo] = useState<Explanation | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [packages, setPackages] = useState<TargetPackage[]>([]);
  const [earlier, setEarlier] = useState<Explanation[] | null>(null);
  const [stalePrefill, setStalePrefill] = useState(false);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [missing, setMissing] = useState(invalidId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const session = useRef(0);
  const slot = draftKey("explanation", id ?? recoveryId ?? "new");
  const draft = useDraft(slot, saved?.body ?? null, body);
  const dirty = saved !== null && (body !== saved.body || confidence !== saved.confidence || encodeTarget(target) !== encodeTarget(saved.target));
  const hint = !target?.lessonId ? "Pick a lesson to save." : !body.trim() ? "Write your explanation to save."
    : body.length > BODY_MAX ? "Shorten it to 100,000 characters to save." : confidence === null ? "Rate your confidence to save." : null;
  const canSave = dirty && hint === null && !pending;

  useEffect(() => {
    mounted.current = true;
    const current = ++session.current;
    if (!invalidId) {
      const oldId = initial.current.explanationId;
      Promise.allSettled([oldId ? getExplanation(Number(oldId)) : Promise.resolve(null),
        oldId ? Promise.resolve([]) : listPackages(), listExplanations()]).then(([e, p, all]) => {
        if (session.current !== current) return;
        if (e.status === "rejected") {
          if (e.reason instanceof ApiError && e.reason.code === "not_found") setMissing(true);
          else setLoadError(message(e.reason));
          return;
        }
        const explanation = e.value;
        const pkgs = p.status === "fulfilled" ? p.value : [];
        const prefill = initial.current.prefill;
        const livePrefill = prefill && pkgs.some((pkg) => pkg.id === prefill.packageId && pkg.lessons.some((lesson) => lesson.id === prefill.lessonId));
        const selected = explanation ? { packageId: explanation.packageId, lessonId: explanation.lessonId } : livePrefill ? prefill : null;
        const restore = initial.current.restore;
        const kept = restore === null ? null : readDraft(browserDraftStore(), draftKey("explanation", restore));
        if (restore !== null && !kept) setRecoveryId(null);
        latestBody.current = explanation?.body ?? kept?.body ?? ""; setBody(latestBody.current);
        setTarget(selected); setConfidence(explanation?.confidence ?? null); setInfo(explanation);
        setSaved({ body: explanation?.body ?? "", confidence: explanation?.confidence ?? null, target: selected });
        setStalePrefill(!explanation && prefill !== null && !livePrefill);
        setPackages(pkgs); setLibraryFailed(p.status === "rejected"); setEarlier(all.status === "fulfilled" ? all.value : null);
      });
    }
    return () => { mounted.current = false; session.current += 1; };
  }, [loadKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(value: string) {
    const last = latestBody.current;
    latestBody.current = value; setBody(value);
    if (value !== saved?.body || confidence !== saved?.confidence) draft.write(value);
    else if (ownsSlot(last)) draft.clear(); else draft.dismiss();
  }

  // Discard drops the offered draft; text typed since the offer, here or in another tab, stays as the current draft.
  function discard() {
    const offered = draft.offer;
    const record = () => { if (offered) recordDiscard(browserDraftStore(), slot, offered.body, new Date()); };
    if (!ownsSlot()) { record(); draft.dismiss(); return; }
    // Recorded once the clear has freed its space, and before this editor stores its own text again.
    draft.clear(); record();
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

  // An edit-mode mount never loaded the library; create mode after a 404 needs it to offer live lessons.
  function loadLibrary() {
    const current = session.current;
    setLibraryFailed(false);
    listPackages().then((pkgs) => { if (session.current === current) setPackages(pkgs); },
      () => { if (session.current === current) setLibraryFailed(true); });
  }

  // A removed explanation's text moves to the new draft, which Explain a lesson offers, unless another new explanation's
  // text is there; then it stays under the old key, and Notes lists it as a kept draft. Text another editor discarded
  // stays gone. Returns whether the new draft is free for this editor.
  function keepGoneText(oldId: number): boolean {
    const drafts = draft.session;
    const old = draftKey("explanation", oldId); const fresh = draftKey("explanation", "new");
    const free = ownsDraft(fresh);
    // Discarded text stays gone whichever of the two keys it was discarded from, even after other text took the new draft.
    if (drafts.dropped(old, latestBody.current) || drafts.dropped(fresh, latestBody.current)) return free;
    // The old key keeps the text until the new draft holds it.
    if (free) { if (drafts.write(fresh, latestBody.current, new Date()) && ownsDraft(old)) drafts.clear(old); }
    else if (ownsDraft(old)) drafts.write(old, latestBody.current, new Date());
    return free;
  }

  async function save() {
    if (inFlight.current || !canSave || !saved || confidence === null || !target?.lessonId) return;
    inFlight.current = true; setPending(true); setError(null);
    const sent = { body, confidence, target };
    const creating = id === null;
    try {
      const patch: ExplanationPatch = {};
      if (sent.body !== saved.body) patch.body = sent.body;
      if (sent.confidence !== saved.confidence) patch.confidence = sent.confidence;
      const explanation = creating ? await createExplanation({ body: sent.body, confidence: sent.confidence,
        packageId: sent.target.packageId, lessonId: sent.target.lessonId! }) : await updateExplanation(id, patch);
      const drafts = draft.session;
      // Text that another editor discarded while this save was pending stays gone.
      const key = draftKey("explanation", explanation.id);
      const dropped = drafts.dropped(slot, latestBody.current) || drafts.dropped(key, latestBody.current);
      // A create's old draft stays until the new key holds the text typed since, so a failed write loses nothing.
      let moved = true;
      if (ownsDraft(key)) {
        if (latestBody.current === sent.body) drafts.clear(key); else if (!dropped) moved = drafts.write(key, latestBody.current, new Date());
      }
      if (creating && moved && recoveryId !== null && ownsDraft(draftKey("explanation", recoveryId))) drafts.clear(draftKey("explanation", recoveryId));
      if (creating && moved && ownsDraft(draftKey("explanation", "new"))) drafts.clear(draftKey("explanation", "new"));
      if (!mounted.current) return;
      draft.dismiss();
      setId(explanation.id); setSaved(sent); setInfo(explanation); setHasSaved(true);
      if (creating) navigate(`/notes/explain/${explanation.id}`, { replace: true, state: { editorKey } });
    } catch (e) {
      const gone = !creating && e instanceof ApiError && e.code === "not_found";
      if (!mounted.current) {
        if (gone) keepGoneText(id);
        return;
      }
      if (gone) {
        setId(null); setSaved({ body: "", confidence: null, target }); setHasSaved(false);
        // Recovery edits stay on the old key while another new explanation's text holds the new draft.
        setRecoveryId(keepGoneText(id) ? null : id);
        if (initial.current.explanationId) loadLibrary();
        setError("This explanation was removed elsewhere — Save will create it again.");
      } else setError(`Your explanation wasn’t saved (${message(e)}).`);
    } finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  const back = <Link className="btn" to="/notes?tab=explanations">Back to explain-back</Link>;
  if (missing) return <div className="page empty"><p className="empty-title">This explanation doesn’t exist.</p>{back}</div>;
  if (loadError) return <div className="page"><p className="errors" role="alert">{`This explanation didn’t load (${loadError}).`}</p>{back}</div>;
  if (id === null && libraryFailed) return <div className="page"><p className="errors" role="alert">Your library couldn’t be loaded, so there’s no lesson to pick.</p>
    <button className="btn" onClick={() => {
      // A full reload resets every field, so the editor stays hidden (Loading…) until it finishes.
      if (initial.current.explanationId) loadLibrary(); else { setSaved(null); setLibraryFailed(false); setLoadKey((k) => k + 1); }
    }}>Try again</button></div>;
  if (!saved) return <p className="loading">Loading…</p>;
  const previous = target && earlier?.filter((e) => e.id !== id && e.packageId === target.packageId && e.lessonId === target.lessonId);
  const status = pending ? "Saving…" : dirty ? "Unsaved changes" : hasSaved && saved.confidence !== null
    ? `Saved. Rated ${saved.confidence} · ${CONFIDENCE_LABEL[saved.confidence]}${info?.revisit
      ? " — it’ll come back on Home until you explain it with more confidence." : "."}` : "";
  return <div className="page">
    <Link className="back-link" to="/notes?tab=explanations">Notes</Link>
    <header className="page-head"><p className="eyebrow">Explain-back</p><h1 className="page-title">{id === null ? "Explain a lesson" : info?.lessonTitle ?? `${target?.packageId}/${target?.lessonId}`}</h1></header>
    {id === null ? <><TargetSelect label="Lesson" packages={packages} value={target} onChange={setTarget} lessonsOnly disabled={pending} />
      {stalePrefill && <p className="note">That lesson isn’t in your library anymore.</p>}</>
      : <div className="actions">{info?.orphaned ? <p className="note">This lesson isn’t in your library anymore.</p>
        : <Link to={`/lesson/${target!.packageId}/${target!.lessonId}`}>Reread the lesson</Link>}
        <Link to={"/notes/explain/new" + filterSearch({ kind: "package", packageId: target!.packageId, lessonId: target!.lessonId! })}>Explain it again</Link></div>}
    <p className="note">Explain it in your own words, as if to a friend — no peeking.</p>
    {draft.offer && <p className="note">{`Restore unsaved text from ${new Date(draft.offer.at).toLocaleString()}?`}{" "}
      <button className="btn" onClick={() => { edit(draft.offer!.body); draft.dismiss(); }}>Restore</button>
      <button className="btn btn-quiet" onClick={discard}>Discard</button></p>}
    <MarkdownEditor label="Your explanation" value={body} onChange={edit} packageId={target?.packageId} onSave={() => void save()} />
    <ConfidencePicker value={confidence} onChange={setConfidence} />
    {hint && <p className="note" id={hintId}>{hint}</p>}
    <button className="btn btn-primary" disabled={!canSave} aria-describedby={hint ? hintId : undefined} onClick={() => void save()}>Save</button>
    <p className="meta" role="status">{status}</p>
    {error && <p className="errors" role="alert">{error}</p>}
    {previous && <details><summary>{`Earlier explanations (${previous.length})`}</summary>{previous.map((e) => <article key={e.id}>
      <ConfidenceChip confidence={e.confidence} /> <span className="meta">{formatDay(e.createdAt)}</span><Markdown packageId={e.packageId}>{e.body}</Markdown>
    </article>)}</details>}
  </div>;
}
