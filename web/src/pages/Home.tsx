import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Explanation } from "@study/shared";
import { listExplanations, listPackages } from "../api.js";
import type { PackageSummary } from "../api.js";
import { useDue } from "../App.js";
import { ConfidenceChip } from "../components/ConfidencePicker.js";
import { formatDay } from "../format.js";
import { lessonsInProgress } from "../home.js";
import { filterSearch } from "../listFilter.js";

export function HomeView({ today, due, dueLoading, packages, revisit, failed, onRetry }: {
  today: Date; due: number | null; dueLoading: boolean; packages: PackageSummary[] | null;
  revisit: Explanation[] | null; failed: boolean; onRetry: () => void;
}) {
  const reading = lessonsInProgress(packages ?? []);
  return <div className="page">
    <header className="page-head"><p className="eyebrow">{today.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1 className="page-title">Today</h1></header>
    {failed && <div className="errors" role="alert">Some of today’s plan couldn’t be loaded.
      <div className="actions"><button className="btn" onClick={onRetry}>Try again</button></div></div>}
    <div className="stack">
      <section className="sheet" aria-labelledby="home-due"><div className="sheet-head">
        <h2 id="home-due">Cards due</h2>
        {due === null ? <p className={dueLoading ? "loading" : "note"}>{dueLoading ? "Loading…" : "Couldn’t count your cards."}</p>
          : due === 0 ? <p className="note">Nothing due — cards come back as their intervals expire.</p>
            : <><p className="home-figure">{due}</p><p className="note">{due === 1 ? "card waiting" : "cards waiting"}</p>
              <Link className="btn btn-primary" to="/study">Start review</Link></>}
      </div></section>
      <section className="sheet" aria-labelledby="home-reading"><div className="sheet-head"><h2 id="home-reading">Continue reading</h2></div>
        {packages === null ? <div className="sheet-head"><p className={failed ? "note" : "loading"}>{failed ? "Couldn’t load your lessons." : "Loading…"}</p></div>
          : packages.length === 0 ? <div className="empty"><p className="empty-title">Your library is empty</p><Link className="btn" to="/library">Open the Library</Link></div>
            : reading.lessons.length === 0 ? <div className="sheet-head"><p className="note">No lessons in progress — pick one from the <Link to="/library">Library</Link>.</p></div>
              : <>{reading.lessons.map((lesson) => <Link className="lesson-row" key={`${lesson.packageId}/${lesson.lessonId}`} to={`/lesson/${lesson.packageId}/${lesson.lessonId}`}>
                <span className="dot dot-progress" /><span className="lesson-row-text"><span className="lesson-row-title">{lesson.title}</span></span><span className="meta">{lesson.packageTitle}</span>
              </Link>)}{reading.more > 0 && <div className="sheet-foot"><Link to="/library">{`+${reading.more} more in the Library`}</Link></div>}</>}
      </section>
      <section className="sheet" aria-labelledby="home-revisit"><div className="sheet-head"><h2 id="home-revisit">Revisit</h2></div>
        {revisit === null ? <div className="sheet-head"><p className={failed ? "note" : "loading"}>{failed ? "Couldn’t load your revisit prompts." : "Loading…"}</p></div>
          : revisit.length === 0 ? <div className="sheet-head"><p className="note">Explain a lesson in your own words — anything you rate 1 or 2 comes back here.</p><Link to="/notes/explain/new">Explain a lesson</Link></div>
            : <ul className="notes-list">{revisit.slice(0, 5).map((row) => <li className="notes-row" key={row.id}>
              <strong>{row.lessonTitle ?? row.lessonId}</strong><div className="actions"><ConfidenceChip confidence={row.confidence} /><span className="meta">{`explained ${formatDay(row.createdAt)}`}</span></div>
              <div className="actions"><Link className="btn btn-primary" to={`/notes/explain/new${filterSearch({ kind: "package", packageId: row.packageId, lessonId: row.lessonId })}`}>Explain again</Link>
                <Link className="link-btn" to={`/lesson/${row.packageId}/${row.lessonId}`}>Reread</Link></div>
            </li>)}</ul>}
        {revisit !== null && revisit.length > 5 && <div className="sheet-foot"><Link to="/notes?tab=explanations&revisit=1">{`+${revisit.length - 5} more`}</Link></div>}
      </section>
    </div>
  </div>;
}

export default function Home() {
  const { due, refreshDue } = useDue();
  const [dueLoading, setDueLoading] = useState(true);
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [revisit, setRevisit] = useState<Explanation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const session = useRef(0);
  function load() {
    const current = ++session.current;
    setDueLoading(true);
    refreshDue().then(() => { if (session.current === current) setDueLoading(false); });
    Promise.allSettled([listPackages(), listExplanations({ revisit: true })]).then(([library, prompts]) => {
      if (session.current !== current) return;
      setPackages(library.status === "fulfilled" ? library.value : null);
      setRevisit(prompts.status === "fulfilled" ? prompts.value : null);
      setFailed(library.status === "rejected" || prompts.status === "rejected");
    });
  }
  useEffect(() => { load(); return () => { session.current++; }; }, [refreshDue]);
  return <HomeView today={new Date()} due={due} dueLoading={dueLoading} packages={packages} revisit={revisit} failed={failed} onRetry={load} />;
}
