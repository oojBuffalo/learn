import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BODY_MAX, isLowConfidence } from "@study/shared";
import type { Confidence, Explanation, ExplanationPatch, NoteTarget } from "@study/shared";
import { ApiError, createExplanation, getExplanation, listExplanations, listPackages, updateExplanation } from "../api.js";
import ConfidencePicker, { ConfidenceChip, CONFIDENCE_LABEL } from "../components/ConfidencePicker.js";
import Markdown from "../components/Markdown.js";
import MarkdownEditor from "../components/MarkdownEditor.js";
import TargetSelect, { decodeTarget, encodeTarget } from "../components/TargetSelect.js";
import type { TargetPackage } from "../components/TargetSelect.js";
import { browserDraftStore, clearDraft, draftKey, readDraft, useDraft, writeDraft } from "../drafts.js";
import { formatDay } from "../format.js";
import { filterSearch } from "../listFilter.js";
import { message } from "../text.js";

type Fields = { body: string; confidence: Confidence | null; target: NoteTarget | null };

export default function ExplanationEditor({ editorKey }: { editorKey: string }) {
  const { explanationId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const hintId = useId();
  const initial = useRef({ explanationId, prefill: params.get("packageId")
    ? decodeTarget(`${params.get("packageId")}/${params.get("lessonId") ?? ""}`) : null });
  const invalidId = initial.current.explanationId !== undefined && !/^[1-9][0-9]*$/.test(initial.current.explanationId);
  const [id, setId] = useState<number | null>(() => initial.current.explanationId && !invalidId ? Number(initial.current.explanationId) : null);
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
  const draft = useDraft(draftKey("explanation", id ?? "new"), saved?.body ?? null);
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
        latestBody.current = explanation?.body ?? ""; setBody(latestBody.current);
        setTarget(selected); setConfidence(explanation?.confidence ?? null); setInfo(explanation);
        setSaved({ body: latestBody.current, confidence: explanation?.confidence ?? null, target: selected });
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
    latestBody.current = value; setBody(value);
    if (value !== saved?.body || confidence !== saved?.confidence) draft.write(value); else draft.clear();
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
      const store = browserDraftStore();
      if (creating) clearDraft(store, draftKey("explanation", "new"));
      const key = draftKey("explanation", explanation.id);
      if (latestBody.current === sent.body) clearDraft(store, key); else writeDraft(store, key, latestBody.current, new Date());
      if (!mounted.current) return;
      setId(explanation.id); setSaved(sent); setInfo(explanation); setHasSaved(true);
      if (creating) navigate(`/notes/explain/${explanation.id}`, { replace: true, state: { editorKey } });
    } catch (e) {
      const gone = !creating && e instanceof ApiError && e.code === "not_found";
      if (!mounted.current) {
        if (gone) {
          // The editor and its row are both gone: Explain a lesson offers the text, unless another new explanation's text is there.
          const store = browserDraftStore(); const fresh = readDraft(store, draftKey("explanation", "new"));
          if (fresh === null || fresh.body === latestBody.current) {
            writeDraft(store, draftKey("explanation", "new"), latestBody.current, new Date()); clearDraft(store, draftKey("explanation", id));
          }
        }
        return;
      }
      if (gone) {
        setId(null); setSaved({ body: "", confidence: null, target }); setHasSaved(false);
        writeDraft(browserDraftStore(), draftKey("explanation", "new"), latestBody.current, new Date());
        setError("This explanation was removed elsewhere — Save will create it again.");
      } else setError(`Your explanation wasn’t saved (${message(e)}).`);
    } finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }

  const back = <Link className="btn" to="/notes?tab=explanations">Back to explain-back</Link>;
  if (missing) return <div className="page empty"><p className="empty-title">This explanation doesn’t exist.</p>{back}</div>;
  if (loadError) return <div className="page"><p className="errors" role="alert">{`This explanation didn’t load (${loadError}).`}</p>{back}</div>;
  if (id === null && libraryFailed) return <div className="page"><p className="errors" role="alert">Your library couldn’t be loaded, so there’s no lesson to pick.</p>
    <button className="btn" onClick={() => { setLibraryFailed(false); setLoadKey((k) => k + 1); }}>Try again</button></div>;
  if (!saved) return <p className="loading">Loading…</p>;
  const previous = target && earlier?.filter((e) => e.id !== id && e.packageId === target.packageId && e.lessonId === target.lessonId);
  const status = pending ? "Saving…" : dirty ? "Unsaved changes" : hasSaved && saved.confidence !== null
    ? `Saved. Rated ${saved.confidence} · ${CONFIDENCE_LABEL[saved.confidence]}${isLowConfidence(saved.confidence)
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
      <button className="btn btn-quiet" onClick={draft.clear}>Discard</button></p>}
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
