import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError, deletePackage, exportUrl, importPackageZip, listPackages, type PackageSummary,
} from "../api.js";

export default function Library() {
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => listPackages().then(setPackages).catch((e) => setErrors([String(e)]));
  useEffect(() => { refresh(); }, []);

  async function onImport(file: File) {
    setErrors([]);
    try {
      await importPackageZip(file);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        setErrors(e.details.map((d) => `${d.file} ${d.path ? `(${d.path})` : ""}: ${d.message}`));
      } else setErrors([String(e)]);
    }
  }

  if (!packages) return <p>Loading…</p>;
  return (
    <>
      <h1>Library</h1>
      <p>
        <button className="primary" onClick={() => fileInput.current?.click()}>Import package (.zip)</button>
        <input ref={fileInput} type="file" accept=".zip" hidden
          onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      </p>
      {errors.length > 0 && (
        <ul className="error-list">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
      {packages.map((p) => (
        <div className="card" key={p.id}>
          <h2>{p.title} <small>v{p.version}</small></h2>
          {p.description && <p>{p.description}</p>}
          <ul>
            {p.lessons.map((l) => (
              <li key={l.id}>
                <Link to={`/lesson/${p.id}/${l.id}`}>{l.title}</Link>
                {l.status !== "not-started" && <em> — {l.status}</em>}
              </li>
            ))}
          </ul>
          <p>
            <a href={exportUrl(p.id)} download>Export</a>{" · "}
            <button onClick={() => { if (confirm(`Delete "${p.title}"? Your progress is kept.`)) deletePackage(p.id).then(refresh); }}>
              Delete
            </button>
          </p>
        </div>
      ))}
    </>
  );
}
