import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Answer, AttemptRecord, QuizResult, QuizSubmission } from "@study/shared";
import { ApiError, getQuiz, isStale, listAttempts, submitQuiz } from "../api.js";
import type { QuizPayload } from "../api.js";
import Clock from "../components/Clock.js";
import History from "../components/History.js";
import PlaySummary from "../components/PlaySummary.js";
import QuizQuestion from "../components/QuizQuestion.js";
import { formatClock, percent } from "../format.js";
import { answeredCount, buildQuizSubmission, quizOrder, quizSummary } from "../quizRun.js";
import { useClock } from "../useClock.js";

const message = (e: unknown) => e instanceof Error ? e.message : String(e);

export default function Quiz() {
  const { packageId = "", quizId = "" } = useParams();
  const [data, setData] = useState<QuizPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [run, setRun] = useState<{ key: number; order: string[]; startedAt: number } | null>(null);
  const runKey = useRef(0);
  const [drafts, setDrafts] = useState<Record<string, Answer | null>>({});
  const [confirming, setConfirming] = useState(false);
  const frozen = useRef<QuizSubmission | null>(null);
  const [payload, setPayload] = useState<QuizSubmission | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getQuiz(packageId, quizId).then((next) => {
      if (!cancelled) setData(next);
    }).catch((e: unknown) => {
      if (cancelled) return;
      if (e instanceof ApiError && e.code === "not_found") setMissing(true);
      else setError(message(e));
    });
    return () => { cancelled = true; };
  }, [packageId, quizId, loadKey]);
  // One effect per history request: a refresh cancels the request before it, so an older answer never lands last.
  useEffect(() => {
    let cancelled = false;
    listAttempts({ packageId, kind: "quiz", refId: quizId, limit: 20 }).then((next) => {
      if (!cancelled) { setHistory(next); setHistoryError(false); }
    }).catch(() => { if (!cancelled) setHistoryError(true); });
    return () => { cancelled = true; };
  }, [packageId, quizId, loadKey, historyKey]);

  const leavingRun = run !== null && result === null && !stale;
  useEffect(() => {
    if (!leavingRun) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [leavingRun]);

  async function send() {
    if (inFlight.current || !frozen.current) return;
    inFlight.current = true;
    setPending(true);
    setSubmitError(null);
    setStale(false);
    try {
      const next = await submitQuiz(frozen.current);
      if (!mounted.current) return;
      setResult(next);
      setHistoryKey((key) => key + 1);
    } catch (e) {
      if (!mounted.current) return;
      if (isStale(e)) setStale(true);
      else setSubmitError(message(e));
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function freeze(elapsedMs: number) {
    if (frozen.current || !data || !run) return;
    frozen.current = buildQuizSubmission(packageId, data.quiz, drafts, elapsedMs);
    setPayload(frozen.current);
    setConfirming(false);
    void send();
  }

  const limit = data?.quiz.timeLimitSeconds ?? null;
  const elapsedMs = useClock(payload === null && run && limit !== null ? run.startedAt : null, limit,
    () => { if (limit !== null) freeze(limit * 1000); });

  function start() {
    if (!data || inFlight.current) return;
    frozen.current = null;
    setPayload(null);
    setResult(null);
    setDrafts({});
    setConfirming(false);
    setSubmitError(null);
    setStale(false);
    setRun({ key: ++runKey.current, order: quizOrder(data.quiz), startedAt: Date.now() });
  }

  if (missing) return <div className="page"><p>This quiz isn’t in your library any more.</p><Link to="/">Back to the library</Link></div>;
  if (error) return <div className="page"><div className="errors" role="alert">
    <strong>This quiz didn’t load.</strong> <p>{error}</p>
    <button className="btn" onClick={() => { setError(null); setData(null); setLoadKey((key) => key + 1); }}>Try again</button>
  </div></div>;
  if (!data) return <p className="loading">Loading…</p>;

  const total = new Set(data.quiz.items).size;
  const answered = run ? answeredCount(run.order, drafts) : 0;
  const facts = [`${total} question${total === 1 ? "" : "s"}`, limit === null ? "no time limit" : `${formatClock(limit)} limit`,
    ...(data.quiz.passThreshold === undefined ? [] : [`pass ${percent(data.quiz.passThreshold)}%`])].join(" · ");
  const historyView = historyError ? <p className="note">History couldn’t be loaded.</p>
    : history === null ? <p className="loading">Loading history…</p> : <History attempts={history} />;
  return <div className="page">
    <Link className="back-link" to="/quizzes">All quizzes</Link>
    <header className="page-head">
      <p className="eyebrow">{facts}</p>
      <h1 className="page-title">{data.quiz.title}</h1>
      {data.quiz.description && <p className="page-sub">{data.quiz.description}</p>}
    </header>
    {!run ? <><button className="btn btn-primary" onClick={start}>Start quiz</button>{historyView}</> : <>
      {result && <PlaySummary text={quizSummary(result)} />}
      {run.order.map((id, index) => {
        const item = Object.hasOwn(data.items, id) ? data.items[id] : undefined;
        return !item || item.type === "flashcard" ? null : <QuizQuestion key={`${run.key}:${id}`} packageId={packageId}
          item={item} index={index} total={total} locked={payload !== null} result={result?.results.find((r) => r.itemId === id) ?? null}
          onChange={(itemId, draft) => setDrafts((current) => ({ ...current, [itemId]: draft }))} />;
      })}
      {!result && <div className="quiz-bar actions">
        {limit !== null && payload === null && <Clock elapsedMs={elapsedMs} limitSeconds={limit} />}
        <span>{answered} of {total} answered</span>
        {payload === null && <button className="btn btn-primary" onClick={() => {
          if (frozen.current) return;
          if (answered < total) setConfirming(true);
          else freeze(Date.now() - run.startedAt);
        }}>Submit quiz</button>}
        {confirming && <span className="confirm">
          {total - answered} unanswered will score 0.
          <button className="btn" onClick={() => setConfirming(false)}>Keep answering</button>
          <button className="btn btn-primary" onClick={() => freeze(Date.now() - run.startedAt)}>Submit anyway</button>
        </span>}
        {submitError && <>
          <p className="errors" role="alert">Your answers weren’t submitted ({submitError}).</p>
          <button className="btn btn-primary" disabled={pending} onClick={() => void send()}>Submit again</button>
        </>}
        {stale && <p className="errors" role="alert">This quiz changed since you started it — reload to start again.</p>}
      </div>}
      {result && <><div className="actions"><button className="btn btn-primary" onClick={start}>Retake quiz</button>
        <Link className="btn" to="/quizzes">All quizzes</Link></div>{historyView}</>}
    </>}
  </div>;
}
