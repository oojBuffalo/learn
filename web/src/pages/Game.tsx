import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { dealGame, MAX_ELAPSED_SECONDS, roundSizeFor } from "@study/shared";
import type { AttemptRecord, GameDeal, GameMove, GameMoveResult, GamePlay, GameResult, GameSubmission } from "@study/shared";
import { checkMove, getGame, isStale, listAttempts, submitGame } from "../api.js";
import type { GamePayload } from "../api.js";
import Clock from "../components/Clock.js";
import History from "../components/History.js";
import ItemRun from "../components/ItemRun.js";
import MatchingBoard from "../components/MatchingBoard.js";
import PlaySummary from "../components/PlaySummary.js";
import { formatClock, percent, TEMPLATE_LABEL } from "../format.js";
import { useClock } from "../useClock.js";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const RULE = {
  matching: "Pick a term, then its match. A wrong pair counts as a miss.",
  "timed-round": "Answer as many as you can before the clock runs out.",
  "order-it": "Put each sequence in the right order.",
};

export function GameResultSummary({ result }: { result: GameResult }) {
  const parts = [`${percent(result.score)}%`, `${result.correctCount} of ${result.total} ${result.template === "matching" ? "matched" : "correct"}`];
  if (result.template === "matching") parts.push(`${result.mistakes} ${result.mistakes === 1 ? "miss" : "misses"}`);
  parts.push(formatClock(result.elapsedSeconds));
  if (result.timedOut) parts.push("Time’s up");
  return <PlaySummary text={parts.join(" · ")} />;
}

export default function Game() {
  const { packageId = "", gameId = "" } = useParams();
  const [data, setData] = useState<GamePayload | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [phase, setPhase] = useState<"intro" | "playing" | "done">("intro");
  const [round, setRound] = useState(0);
  const [deal, setDeal] = useState<GameDeal | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const play = useRef<GamePlay | null>(null);
  const checking = useRef(false);
  const submitting = useRef(false);
  const ended = useRef(false);
  const frozen = useRef<GameSubmission | null>(null);
  const run = useRef(0);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    getGame(packageId, gameId).then((payload) => { if (active) setData(payload); })
      .catch((error: unknown) => { if (active) setLoadError(error); });
    return () => { active = false; run.current += 1; };
  }, [packageId, gameId, loadKey]);
  useEffect(() => {
    let active = true;
    setHistoryError(false);
    listAttempts({ packageId, kind: "game", refId: gameId, limit: 20 })
      .then((rows) => { if (active) setHistory(rows); })
      .catch(() => { if (active) setHistoryError(true); });
    return () => { active = false; };
  }, [packageId, gameId, historyKey]);

  const send = async () => {
    if (submitting.current || !frozen.current) return;
    submitting.current = true;
    setSaving(true);
    setSaveError(null);
    setStale(false);
    const startedIn = run.current;
    try {
      const saved = await submitGame(frozen.current);
      if (run.current !== startedIn) return;
      setResult(saved);
      setPhase("done");
      setHistoryKey((value) => value + 1);
    } catch (error) {
      if (run.current !== startedIn) return;
      if (isStale(error)) setStale(true);
      else setSaveError(message(error));
    } finally {
      if (run.current === startedIn) {
        submitting.current = false;
        setSaving(false);
      }
    }
  };
  const finish = () => {
    if (ended.current || stale || !play.current || startedAt === null || !data) return;
    ended.current = true;
    setOver(true);
    const elapsed = Math.max(0, Math.min(MAX_ELAPSED_SECONDS, Math.floor((Date.now() - startedAt) / 1000)));
    frozen.current = {
      kind: "game", packageId, gameId, play: play.current,
      elapsedSeconds: data.settings.timeLimitSeconds === null ? elapsed : Math.min(elapsed, data.settings.timeLimitSeconds),
    };
    void send();
  };
  const elapsedMs = useClock(phase === "playing" && !over && !stale ? startedAt : null,
    data?.settings.timeLimitSeconds ?? null, finish);

  const start = () => {
    if (!data) return;
    const next = dealGame(data.game, data.items);
    play.current = next.template === "matching"
      ? { template: next.template, lefts: next.lefts, picks: [] }
      : { template: next.template, itemIds: next.itemIds, answers: [] };
    run.current += 1;
    checking.current = false;
    submitting.current = false;
    ended.current = false;
    frozen.current = null;
    setPending(false);
    setSaving(false);
    setOver(false);
    setCheckError(null);
    setSaveError(null);
    setStale(false);
    setResult(null);
    setDeal(next);
    setStartedAt(Date.now());
    setRound((value) => value + 1);
    setPhase("playing");
  };
  const check = async (move: GameMove): Promise<GameMoveResult | null> => {
    if (ended.current || checking.current || stale || !play.current) return null;
    const startedIn = run.current;
    checking.current = true;
    setPending(true);
    setCheckError(null);
    try {
      const verdict = await checkMove(packageId, gameId, move);
      if (ended.current || run.current !== startedIn) return null;
      if (play.current.template === "matching" && "left" in move) play.current.picks.push(move);
      else if (play.current.template !== "matching" && "itemId" in move) play.current.answers.push(move);
      return verdict;
    } catch (error) {
      if (ended.current || run.current !== startedIn) return null;
      if (isStale(error)) setStale(true);
      else setCheckError(message(error));
      return null;
    } finally {
      if (run.current === startedIn) {
        checking.current = false;
        setPending(false);
      }
    }
  };

  if (loadError) return <div className="page"><p role="alert">{isStale(loadError)
    ? "This game isn’t in your library any more." : `This game didn’t load. ${message(loadError)}`}</p>
    {isStale(loadError) ? <Link to="/">Back to the library</Link>
      : <button className="btn" onClick={() => setLoadKey((value) => value + 1)}>Try again</button>}</div>;
  if (!data) return <p className="loading">Loading…</p>;
  const historyView = historyError ? <p role="alert">History couldn’t be loaded.</p>
    : history ? <History attempts={history} /> : <p className="loading">Loading history…</p>;
  const n = roundSizeFor(data.game, data.items);
  const unit = data.game.template === "matching" ? "pair" : data.game.template === "order-it" ? "sequence" : "question";
  return <div className="page">
    <Link className="back-link" to="/games">All games</Link>
    {phase === "intro" && <>
      <p className="eyebrow">{TEMPLATE_LABEL[data.game.template]}</p>
      <h1 className="page-title">{data.game.title}</h1>
      <p>{RULE[data.game.template]}</p>
      <p className="meta">{n} {unit}{n === 1 ? "" : "s"} · {data.settings.timeLimitSeconds === null ? "no time limit" : `${formatClock(data.settings.timeLimitSeconds)} limit`}</p>
      <div className="actions"><button className="btn btn-primary" onClick={start}>Play</button></div>
      {historyView}
    </>}
    {phase === "playing" && deal && <>
      <div className="game-bar"><span>{TEMPLATE_LABEL[data.game.template]}</span>
        {!over && !stale && <Clock elapsedMs={elapsedMs} limitSeconds={data.settings.timeLimitSeconds} />}
      </div>
      {deal.template === "matching"
        ? <MatchingBoard key={round} deal={deal} disabled={over || pending || stale} check={check} onDone={finish} />
        : <ItemRun key={round} packageId={packageId} items={data.items} deal={deal} disabled={over || pending || stale} check={check} onDone={finish} />}
      {checkError && <p className="errors" role="alert">That move wasn’t checked ({checkError}). Try again.</p>}
      {saveError && <div className="errors" role="alert">Your score wasn’t saved ({saveError}).
        <div className="actions"><button className="btn" disabled={saving} onClick={() => void send()}>Try again</button></div>
      </div>}
      {saving && <p className="meta">Saving…</p>}
      {stale && <p className="errors" role="alert">This game changed since you started — reload to play again.</p>}
    </>}
    {phase === "done" && result && <>
      <GameResultSummary result={result} />
      <div className="actions"><button className="btn btn-primary" onClick={start}>Play again</button>
        <Link className="btn" to="/games">All games</Link></div>
      {historyView}
    </>}
  </div>;
}
