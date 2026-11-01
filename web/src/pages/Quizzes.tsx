import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isPassing } from "@study/shared";
import { listPackages } from "../api.js";
import type { PackageSummary } from "../api.js";
import { formatClock, percent } from "../format.js";
import Icon from "../components/Icon.js";

export function QuizList({ packages }: { packages: PackageSummary[] }) {
  if (!packages.some((p) => p.quizzes.length)) return <div className="empty"><p className="empty-title">No quizzes yet</p></div>;
  return <div className="stack">{packages.filter((p) => p.quizzes.length).map((p) => (
    <article className="sheet" key={p.id}>
      <div className="sheet-head"><h2>{p.title}</h2></div>
      {p.quizzes.map((q) => {
        const done = q.runs > 0 && (q.passThreshold === null || isPassing(q.best ?? 0, q.passThreshold));
        const meta = [`${q.itemCount} question${q.itemCount === 1 ? "" : "s"}`,
          ...(q.timeLimitSeconds !== null ? [`${formatClock(q.timeLimitSeconds)} limit`] : []),
          ...(q.passThreshold !== null ? [`pass ${percent(q.passThreshold)}%`] : []),
          ...(q.best !== null ? [`best ${percent(q.best)}%`] : [])];
        return <Link className="lesson-row" key={q.id} to={`/quizzes/${p.id}/${q.id}`}>
          <span className={`dot${done ? " dot-done" : q.runs > 0 ? " dot-progress" : ""}`} />
          <span className="lesson-row-text"><span className="lesson-row-title">{q.title}</span>
            {q.description && <span className="lesson-row-sum">{q.description}</span>}</span>
          <span className="meta">{meta.join(" · ")}</span><Icon name="right" size={16} />
        </Link>;
      })}
    </article>
  ))}</div>;
}

export default function Quizzes() {
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const packageId = params.get("package");
  function refresh() {
    setError(null);
    listPackages().then(setPackages).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }
  useEffect(() => { refresh(); }, []);
  if (!packages && !error) return <p className="loading">Loading…</p>;
  return <div className="page">
    <header className="page-head"><p className="eyebrow">Practice</p><h1 className="page-title">Quizzes</h1></header>
    {packageId && <Link className="back-link" to="/quizzes">All packages</Link>}
    {error ? <><div className="errors" role="alert"><strong>Your quizzes couldn’t be loaded.</strong><p>{error}</p></div>
      <div className="actions"><button className="btn btn-primary" onClick={refresh}>Try again</button></div></>
      : packages && <QuizList packages={packageId ? packages.filter((p) => p.id === packageId) : packages} />}
  </div>;
}
