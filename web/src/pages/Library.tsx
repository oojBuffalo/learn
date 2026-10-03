import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError, deletePackage, exportUrl, importPackageZip, listPackages, type PackageSummary,
} from "../api.js";
import { useDue } from "../App.js";
import Icon from "../components/Icon.js";

const STATUS_LABEL: Record<string, string> = {
  "in-progress": "in progress",
  completed: "done",
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function summarise(packages: PackageSummary[]): string {
  if (packages.length === 0) return "Nothing imported yet";
  const lessons = packages.reduce((n, p) => n + p.lessonCount, 0);
  return `${plural(packages.length, "package")} · ${plural(lessons, "lesson")}`;
}

export default function Library() {
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { refreshDue } = useDue();

  const refresh = () =>
    listPackages()
      .then(setPackages)
      .catch((e) => setErrors([message(e)]));

  useEffect(() => {
    refresh();
  }, []);

  async function onImport(file: File) {
    setErrors([]);
    setImporting(true);
    try {
      await importPackageZip(file);
      await refresh();
      refreshDue();
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        setErrors(e.details.map((d) => `${d.file}${d.path ? ` (${d.path})` : ""}: ${d.message}`));
      } else setErrors([message(e)]);
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: string) {
    setConfirming(null);
    try {
      await deletePackage(id);
      await refresh();
      refreshDue();
    } catch (e) {
      setErrors([message(e)]);
    }
  }

  if (!packages) return <p className="loading">Loading…</p>;

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{summarise(packages)}</p>
        <h1 className="page-title">Library</h1>
      </header>

      <div className="stack">
        <div
          className={`dropzone${packages.length > 0 ? " dropzone-compact" : ""}${dragging ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) onImport(file);
          }}
        >
          <Icon name="upload" size={packages.length > 0 ? 20 : 28} />
          <p className="note">
            {packages.length > 0
              ? "Drop a .zip here to add another package."
              : "Drop a package .zip here to add it to your library."}
          </p>
          <button className="btn btn-primary" disabled={importing} onClick={() => fileInput.current?.click()}>
            {importing ? "Importing…" : "Choose a file"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
          />
        </div>

        {errors.length > 0 && (
          <div className="errors" role="alert">
            <strong>That package wasn’t imported.</strong>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {packages.map((p) => (
          <article className="sheet" key={p.id}>
            <div className="sheet-head">
              <div className="sheet-title">
                <h2>{p.title}</h2>
                <span className="chip chip-plain">v{p.version}</span>
              </div>
              {p.description && <p className="note">{p.description}</p>}
              {p.tags && p.tags.length > 0 && (
                <div className="actions">
                  {p.tags.map((t) => (
                    <span className="chip" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {p.lessons.map((l) => (
              <Link className="lesson-row" key={l.id} to={`/lesson/${p.id}/${l.id}`}>
                <span
                  className={`dot${l.status === "completed" ? " dot-done" : l.status === "in-progress" ? " dot-progress" : ""}`}
                />
                <span className="lesson-row-text">
                  <span className="lesson-row-title">{l.title}</span>
                  {l.summary && <span className="lesson-row-sum">{l.summary}</span>}
                </span>
                {STATUS_LABEL[l.status] && <span className="meta">{STATUS_LABEL[l.status]}</span>}
                <Icon name="right" size={16} />
              </Link>
            ))}

            <div className="sheet-foot">
              <a className="link-btn" href={exportUrl(p.id)} download>
                <Icon name="download" size={18} />
                Export
              </a>
              {confirming === p.id ? (
                <span className="confirm">
                  Delete it? Your progress is kept.
                  <button className="btn btn-quiet" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                  <button className="btn btn-danger" onClick={() => remove(p.id)}>
                    Delete
                  </button>
                </span>
              ) : (
                <button className="btn btn-danger push" onClick={() => setConfirming(p.id)}>
                  <Icon name="trash" size={18} />
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
