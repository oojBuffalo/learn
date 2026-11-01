import type { AttemptRecord } from "@study/shared";
import { formatClock, percent } from "../format.js";

export default function History({ attempts }: { attempts: AttemptRecord[] }) {
  return <><h2 className="eyebrow section-break">History</h2>
    {attempts.length === 0 ? <p className="note">No attempts yet.</p> : <ol className="history">{attempts.map((a) => (
      <li key={a.id}>
        <time dateTime={a.at}>{new Date(a.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
        <b>{percent(a.score)}%</b>
        {a.kind === "quiz" && a.passed !== null && <span className={`chip ${a.passed ? "chip-pass" : "chip-fail"}`}>{a.passed ? "Passed" : "Not passed"}</span>}
        {a.kind !== "exercise" && <span className="meta">{formatClock(a.elapsedSeconds)}{a.timedOut ? " · time’s up" : ""}</span>}
      </li>
    ))}</ol>}
  </>;
}
