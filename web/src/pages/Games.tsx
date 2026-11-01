import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listPackages } from "../api.js";
import type { PackageSummary } from "../api.js";
import { formatClock, percent, TEMPLATE_LABEL } from "../format.js";
import Icon from "../components/Icon.js";

export function GameList({ packages }: { packages: PackageSummary[] }) {
  if (!packages.some((p) => p.games.length)) return <div className="empty"><p className="empty-title">No games yet</p></div>;
  return <div className="stack">{packages.filter((p) => p.games.length).map((p) => (
    <article className="sheet" key={p.id}>
      <div className="sheet-head"><h2>{p.title}</h2></div>
      {p.games.map((g) => {
        const meta = [TEMPLATE_LABEL[g.template],
          ...(g.timeLimitSeconds !== null ? [`${formatClock(g.timeLimitSeconds)} limit`] : []),
          ...(g.best !== null ? [`best ${percent(g.best)}%`] : [])];
        return <Link className="lesson-row" key={g.id} to={`/games/${p.id}/${g.id}`}>
          <span className={`dot${g.runs > 0 ? " dot-done" : ""}`} />
          <span className="lesson-row-text"><span className="lesson-row-title">{g.title}</span></span>
          <span className="meta">{meta.join(" · ")}</span><Icon name="right" size={16} />
        </Link>;
      })}
    </article>
  ))}</div>;
}

export default function Games() {
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
    <header className="page-head"><p className="eyebrow">Practice</p><h1 className="page-title">Games</h1></header>
    {packageId && <Link className="back-link" to="/games">All packages</Link>}
    {error ? <><div className="errors" role="alert"><strong>Your games couldn’t be loaded.</strong><p>{error}</p></div>
      <div className="actions"><button className="btn btn-primary" onClick={refresh}>Try again</button></div></>
      : packages && <GameList packages={packageId ? packages.filter((p) => p.id === packageId) : packages} />}
  </div>;
}
