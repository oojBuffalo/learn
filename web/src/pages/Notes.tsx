import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import type { Explanation, Note } from "@study/shared";
import { listExplanations, listNotes, listPackages } from "../api.js";
import { ConfidenceChip } from "../components/ConfidencePicker.js";
import DismissRevisit from "../components/DismissRevisit.js";
import type { TargetPackage } from "../components/TargetSelect.js";
import { formatDay } from "../format.js";
import { filterExplanations, filterNotes, filterSearch, noteLabel, NOTES_PAGE, parseListFilter, searchNotes } from "../listFilter.js";
import type { ListFilter } from "../listFilter.js";
import { headline, message, plural } from "../text.js";

function Filters({ packages, filter, orphaned, explanations = false, onChange, children }: {
  packages: TargetPackage[]; filter: ListFilter; orphaned: number; explanations?: boolean; onChange: (f: ListFilter) => void; children?: ReactNode;
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
    {children}
  </div>;
}

export function NotesListView({ notes, packages, filter, query, onFilterChange, onQueryChange }: {
  notes: Note[]; packages: TargetPackage[]; filter: ListFilter; query: string;
  onFilterChange: (f: ListFilter, query: string) => void; onQueryChange: (query: string) => void;
}) {
  // The box owns its text: the URL is written in a transition and can lag typing. Any navigation
  // other than the box's own replace (Back, a link, a filter) brings its search back in.
  const [text, setText] = useState(query);
  const location = useLocation(); const navigation = useNavigationType();
  const [seen, setSeen] = useState(location.key);
  if (seen !== location.key) { setSeen(location.key); if (navigation !== "REPLACE") setText(query); }
  const orphaned = notes.filter((n) => n.orphaned).length;
  const shown = searchNotes(filterNotes(notes, filter), text);
  // A new search or filter starts again from the first page.
  const pageKey = filterSearch(filter, { q: text });
  const [page, setPage] = useState({ key: pageKey, size: NOTES_PAGE });
  if (page.key !== pageKey) setPage({ key: pageKey, size: NOTES_PAGE });
  const size = page.key === pageKey ? page.size : NOTES_PAGE;
  const visible = shown.slice(0, size);
  const list = useRef<HTMLUListElement>(null);
  const showMore = (button: HTMLButtonElement) => {
    const focused = document.activeElement === button;
    flushSync(() => setPage({ key: pageKey, size: size + NOTES_PAGE }));
    // The last Show more removes the button, so focus goes to the first note it revealed rather than the page.
    if (focused && !button.isConnected) list.current?.children[size]?.querySelector("a")?.focus();
  };
  const words = text.trim();
  return <>
    <Filters packages={packages} filter={filter} orphaned={orphaned} onChange={(f) => onFilterChange(f, text)}>
      <input type="search" className="field field-grow" aria-label="Search notes" placeholder="Search notes"
        value={text} onChange={(e) => { setText(e.target.value); onQueryChange(e.target.value); }} /></Filters>
    {filter.kind === "all" && orphaned > 0 && <p className="note">{`${plural(orphaned, "note")} ${orphaned === 1 ? "belongs" : "belong"} to content that’s no longer in your library.`}{" "}
      <Link to={"/notes" + filterSearch({ kind: "orphaned" }, text ? { q: text } : {})}>Show them</Link></p>}
    <div className="actions"><Link className="btn btn-primary" to={`/notes/new${filter.kind === "package" ? filterSearch(filter) : ""}`}>New note</Link></div>
    <div role="status">{shown.length === 0 ? <div className="empty"><p className="empty-title">{words ? `No notes match “${words}”.` : filter.kind === "all" ? "No notes yet" : "Nothing here yet."}</p>
      {!words && filter.kind === "all" && <p className="note">Write one here or from any lesson.</p>}</div>
      : <p className="meta">{visible.length < shown.length ? `Showing ${visible.length} of ${shown.length} notes` : plural(shown.length, "note")}</p>}</div>
    {visible.length > 0 && <ul className="notes-list" ref={list}>{visible.map((n) => <li key={n.id}><Link className="notes-row" to={`/notes/${n.id}`}>
      <span className="lesson-row-text"><span className="lesson-row-title">{headline(n.body)}</span><span className="lesson-row-sum">{noteLabel(n)}</span></span>
      <span className="meta">{formatDay(n.updatedAt)}</span></Link></li>)}</ul>}
    {visible.length < shown.length && <div className="actions actions-center">
      <button type="button" className="btn" onClick={(e) => showMore(e.currentTarget)}>Show more</button></div>}
  </>;
}

export function ExplanationsListView({ explanations, packages, filter, revisitOnly, onFilterChange, onRevisitChange, onDismissed }: {
  explanations: Explanation[]; packages: TargetPackage[]; filter: ListFilter; revisitOnly: boolean;
  onFilterChange: (f: ListFilter) => void; onRevisitChange: (v: boolean) => void; onDismissed: (e: Explanation) => void;
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
      </Link>{e.revisit && <div className="actions notes-row-actions"><DismissRevisit explanation={e} onDismissed={onDismissed} /></div>}</li>)}</ul>}
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
  const query = params.get("q") ?? "";
  // Prompts dismissed while the current load runs: its answer may predate the dismissal, so they stay dismissed.
  const dismissedDuringLoad = useRef<number[]>([]);
  useEffect(() => {
    const current = ++session.current;
    dismissedDuringLoad.current = [];
    Promise.allSettled([listNotes(), listPackages(), listExplanations()]).then(([n, p, e]) => {
      if (current !== session.current) return;
      if (n.status === "fulfilled") { setNotes(n.value); setNotesError(null); } else setNotesError(message(n.reason));
      setPackages(p.status === "fulfilled" ? p.value : []);
      if (e.status === "fulfilled") {
        setExplanations(e.value.map((x) => dismissedDuringLoad.current.includes(x.id) ? { ...x, revisit: false } : x)); setExplanationsError(null);
      } else setExplanationsError(message(e.reason));
    });
    return () => { session.current += 1; };
  }, [loadKey]);
  function dismissed(row: Explanation) {
    dismissedDuringLoad.current.push(row.id);
    setExplanations((list) => list && list.map((e) => e.id === row.id ? row : e));
  }
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
        onRevisitChange={(value) => navigate({ search: filterSearch(filter, { tab: "explanations", ...(value ? { revisit: "1" } : {}) }) })}
        onDismissed={dismissed} />
        : notes === null ? <p className="loading">Loading…</p> : <NotesListView notes={notes} packages={packages} filter={filter} query={query}
          onFilterChange={(f, q) => navigate({ search: filterSearch(f, q ? { q } : {}) })}
          onQueryChange={(q) => navigate({ search: filterSearch(filter, q ? { q } : {}) }, { replace: true })} />}
  </div>;
}
