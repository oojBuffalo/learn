import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Explanation, Note } from "@study/shared";
import { listExplanations, listNotes, listPackages } from "../api.js";
import { ConfidenceChip } from "../components/ConfidencePicker.js";
import type { TargetPackage } from "../components/TargetSelect.js";
import { formatDay } from "../format.js";
import { filterExplanations, filterNotes, filterSearch, parseListFilter } from "../listFilter.js";
import type { ListFilter } from "../listFilter.js";
import { headline, message, plural } from "../text.js";

function Filters({ packages, filter, orphaned, explanations = false, onChange }: {
  packages: TargetPackage[]; filter: ListFilter; orphaned: number; explanations?: boolean; onChange: (f: ListFilter) => void;
}) {
  const value = filter.kind === "package" ? `pkg:${filter.packageId}` : filter.kind;
  const pkg = filter.kind === "package" ? packages.find((p) => p.id === filter.packageId) : undefined;
  return <div className="actions">
    <select className="field" aria-label="Show" value={value} onChange={(e) => {
      const v = e.target.value;
      onChange(v.startsWith("pkg:") ? { kind: "package", packageId: v.slice(4) }
        : v === "standalone" ? { kind: "standalone" } : v === "orphaned" ? { kind: "orphaned" } : { kind: "all" });
    }}>
      <option value="all">{explanations ? "All explanations" : "All notes"}</option>
      {!explanations && <option value="standalone">Standalone</option>}
      {packages.map((p) => <option key={p.id} value={`pkg:${p.id}`}>{p.title}</option>)}
      {orphaned > 0 && <option value="orphaned">{`From removed content (${orphaned})`}</option>}
    </select>
    {filter.kind === "package" && <select className="field" aria-label="Lesson" value={filter.lessonId ?? ""}
      onChange={(e) => onChange({ kind: "package", packageId: filter.packageId, ...(e.target.value ? { lessonId: e.target.value } : {}) })}>
      <option value="">Whole package</option>
      {pkg?.lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
    </select>}
  </div>;
}

export function NotesListView({ notes, packages, filter, onFilterChange }: {
  notes: Note[]; packages: TargetPackage[]; filter: ListFilter; onFilterChange: (f: ListFilter) => void;
}) {
  const orphaned = notes.filter((n) => n.orphaned).length;
  const shown = filterNotes(notes, filter);
  return <>
    <Filters packages={packages} filter={filter} orphaned={orphaned} onChange={onFilterChange} />
    {filter.kind === "all" && orphaned > 0 && <p className="note">{`${plural(orphaned, "note")} ${orphaned === 1 ? "belongs" : "belong"} to content that’s no longer in your library.`}{" "}
      <Link to="/notes?orphaned=1">Show them</Link></p>}
    <div className="actions"><Link className="btn btn-primary" to={`/notes/new${filter.kind === "package" ? filterSearch(filter) : ""}`}>New note</Link></div>
    {shown.length === 0 ? <div className="empty"><p className="empty-title">{filter.kind === "all" ? "No notes yet" : "Nothing here yet."}</p>
      {filter.kind === "all" && <p className="note">Write one here or from any lesson.</p>}</div>
      : <ul className="notes-list">{shown.map((n) => {
        const target = n.target;
        const pkg = target?.packageTitle ?? target?.packageId;
        const label = n.orphaned && target ? `Removed: ${target.packageId}${target.lessonId ? `/${target.lessonId}` : ""}`
          : target === null ? "Standalone" : target.lessonId === null ? pkg : `${pkg} › ${target.lessonTitle ?? target.lessonId}`;
        return <li key={n.id}><Link className="notes-row" to={`/notes/${n.id}`}>
          <span className="lesson-row-text"><span className="lesson-row-title">{headline(n.body)}</span><span className="lesson-row-sum">{label}</span></span>
          <span className="meta">{formatDay(n.updatedAt)}</span></Link></li>;
      })}</ul>}
  </>;
}

export function ExplanationsListView({ explanations, packages, filter, revisitOnly, onFilterChange, onRevisitChange }: {
  explanations: Explanation[]; packages: TargetPackage[]; filter: ListFilter; revisitOnly: boolean;
  onFilterChange: (f: ListFilter) => void; onRevisitChange: (v: boolean) => void;
}) {
  const [revisitChecked, setRevisitChecked] = useState(revisitOnly);
  useEffect(() => { setRevisitChecked(revisitOnly); }, [revisitOnly]);
  const orphaned = explanations.filter((e) => e.orphaned).length;
  const shown = filterExplanations(explanations, filter, revisitOnly);
  return <>
    <Filters packages={packages} filter={filter} orphaned={orphaned} explanations onChange={onFilterChange} />
    <label className="note"><input type="checkbox" checked={revisitChecked} onChange={(e) => {
      setRevisitChecked(e.target.checked); onRevisitChange(e.target.checked);
    }} /> Needs revisit</label>
    {filter.kind === "all" && orphaned > 0 && <p className="note">{`${plural(orphaned, "explanation")} ${orphaned === 1 ? "belongs" : "belong"} to content that’s no longer in your library.`}{" "}
      <Link to={"/notes" + filterSearch({ kind: "orphaned" }, { tab: "explanations" })}>Show them</Link></p>}
    <div className="actions"><Link className="btn btn-primary" to="/notes/explain/new">Explain a lesson</Link></div>
    {shown.length === 0 ? <div className="empty"><p className="empty-title">{filter.kind === "all" && !revisitOnly ? "No explanations yet" : "Nothing here yet."}</p>
      {filter.kind === "all" && !revisitOnly && <p className="note">Pick a lesson and explain it from memory.</p>}</div>
      : <ul className="notes-list">{shown.map((e) => <li key={e.id}><Link className="notes-row" to={`/notes/explain/${e.id}`}>
        <span className="lesson-row-text"><span className="lesson-row-title">{e.lessonTitle ?? `${e.packageId}/${e.lessonId}`}</span>
          <ConfidenceChip confidence={e.confidence} /> {e.revisit && <span className="chip">revisit</span>}
          <span className="meta">{`explained ${formatDay(e.createdAt)}`}</span><span className="lesson-row-sum">{headline(e.body)}</span></span>
      </Link></li>)}</ul>}
  </>;
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [explanations, setExplanations] = useState<Explanation[] | null>(null);
  const [packages, setPackages] = useState<TargetPackage[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [explanationsError, setExplanationsError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const session = useRef(0);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const group = useId();
  const explainTab = params.get("tab") === "explanations";
  const filter = parseListFilter(params);
  const revisitOnly = params.get("revisit") === "1";
  useEffect(() => {
    const current = ++session.current;
    Promise.allSettled([listNotes(), listPackages(), listExplanations()]).then(([n, p, e]) => {
      if (current !== session.current) return;
      if (n.status === "fulfilled") { setNotes(n.value); setNotesError(null); } else setNotesError(message(n.reason));
      setPackages(p.status === "fulfilled" ? p.value : []);
      if (e.status === "fulfilled") { setExplanations(e.value); setExplanationsError(null); } else setExplanationsError(message(e.reason));
    });
    return () => { session.current += 1; };
  }, [loadKey]);
  const error = explainTab ? explanationsError : notesError;
  return <div className="page">
    <header className="page-head"><p className="eyebrow">In your own words</p><h1 className="page-title">Notes</h1></header>
    <div className="segmented" role="radiogroup" aria-label="Notes view">
      <label><input type="radio" name={group} checked={!explainTab} onChange={() => navigate("/notes")} />Notes</label>
      <label><input type="radio" name={group} checked={explainTab} onChange={() => navigate("/notes?tab=explanations")} />Explain-back</label>
    </div>
    {error ? <><div className="errors" role="alert"><strong>{explainTab ? "Your explanations couldn’t be loaded." : "Your notes couldn’t be loaded."}</strong><p>{error}</p></div>
      <button className="btn" onClick={() => { setNotesError(null); setExplanationsError(null); setLoadKey((k) => k + 1); }}>Try again</button></>
      : explainTab ? explanations === null ? <p className="loading">Loading…</p> : <ExplanationsListView explanations={explanations} packages={packages} filter={filter}
        revisitOnly={revisitOnly} onFilterChange={(f) => navigate({ search: filterSearch(f, { tab: "explanations", ...(revisitOnly ? { revisit: "1" } : {}) }) })}
        onRevisitChange={(value) => navigate({ search: filterSearch(filter, { tab: "explanations", ...(value ? { revisit: "1" } : {}) }) })} />
        : notes === null ? <p className="loading">Loading…</p> : <NotesListView notes={notes} packages={packages} filter={filter}
          onFilterChange={(f) => navigate({ search: filterSearch(f) })} />}
  </div>;
}
