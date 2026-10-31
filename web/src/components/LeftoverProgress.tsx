import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { OrphanGroup } from "@study/shared";
import { ApiError, getOrphans, purgeOrphans } from "../api.js";
import { describeCounts, message, plural, purgeTotal } from "../text.js";
import { filterSearch } from "../listFilter.js";

export function LeftoverProgressView({ groups, confirming, includeWriting, pending, error, status, onAsk, onCancel, onToggleWriting, onPurge, onRetry }: {
  groups: OrphanGroup[]; confirming: string | null; includeWriting: boolean; pending: boolean;
  error: string | null; status: string | null; onAsk: (packageId: string) => void; onCancel: () => void;
  onToggleWriting: (value: boolean) => void; onPurge: (group: OrphanGroup) => void; onRetry?: () => void;
}) {
  if (groups.length === 0 && status === null && error === null) return null;
  return <section className="sheet leftover"><div className="sheet-head"><h2>Leftover progress</h2>
    <p className="note">Progress from content that’s no longer in your library. It’s hidden everywhere else and comes back if you re-import the same lessons and cards.</p></div>
    {groups.map((group) => <div className="leftover-row" key={group.packageId}>
      <p className="leftover-name">{group.packageTitle ?? group.packageId}</p>
      <p className="meta">{group.inLibrary ? "some lessons or cards were removed by an import" : "package deleted"}</p>
      <p className="leftover-counts">{describeCounts(group.counts)}</p>
      <div className="actions">
        {group.counts.notes > 0 && <Link className="link-btn" to={`/notes${filterSearch({ kind: "orphaned", packageId: group.packageId })}`}>Read the notes</Link>}
        {group.counts.explanations > 0 && <Link className="link-btn" to={`/notes${filterSearch({ kind: "orphaned", packageId: group.packageId }, { tab: "explanations" })}`}>Read the explanations</Link>}
      </div>
      {confirming !== group.packageId ? <div><button className="btn btn-danger" disabled={pending} onClick={() => onAsk(group.packageId)}>Clear…</button></div>
        : <span className="confirm">{`Delete ${plural(purgeTotal(group.counts, includeWriting), "record")} for good? Re-importing won’t bring them back.`}
          {group.counts.notes + group.counts.explanations > 0 && <label><input type="checkbox" checked={includeWriting} disabled={pending} onChange={(event) => onToggleWriting(event.target.checked)} />
            {`Also delete ${[group.counts.notes && plural(group.counts.notes, "note"), group.counts.explanations && plural(group.counts.explanations, "explanation")].filter(Boolean).join(" and ")}`}</label>}
          <button className="btn btn-quiet" disabled={pending} onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" disabled={pending || purgeTotal(group.counts, includeWriting) === 0} onClick={() => onPurge(group)}>Delete for good</button>
        </span>}
    </div>)}
    {error && <p className="errors" role="alert">{error}</p>}
    {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    {status && <p className="meta" role="status">{status}</p>}
  </section>;
}

export default function LeftoverProgress({ refreshKey }: { refreshKey: number }) {
  const [groups, setGroups] = useState<OrphanGroup[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [includeWriting, setIncludeWriting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const session = useRef(0);
  const inFlight = useRef(false);
  async function load() {
    const current = ++session.current;
    try {
      const next = await getOrphans();
      if (session.current === current) { setGroups(next); setLoadError(null); }
    } catch (caught) {
      if (session.current === current) setLoadError(`Leftover progress couldn’t be loaded (${message(caught)}).`);
    }
  }
  useEffect(() => {
    setStatus(null); setError(null); setConfirming(null);
    void load();
    return () => { session.current++; };
  }, [refreshKey]);
  async function purge(group: OrphanGroup) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true); setError(null);
    const current = session.current;
    try {
      const purged = await purgeOrphans({ packageId: group.packageId, includeWriting, expected: group.counts });
      if (session.current !== current) return;
      setConfirming(null);
      setStatus(`Removed ${plural(Object.values(purged).reduce((sum, count) => sum + count, 0), "record")}.`);
      await load();
    } catch (caught) {
      if (session.current !== current) return;
      if (caught instanceof ApiError && caught.code === "orphans_changed") {
        setError("That changed while you were looking — check the new counts and confirm again.");
        await load();
      } else setError(message(caught));
    } finally { inFlight.current = false; setPending(false); }
  }
  return <LeftoverProgressView groups={groups} confirming={confirming} includeWriting={includeWriting} pending={pending} error={loadError ?? error} status={status}
    onAsk={(id) => { setConfirming(id); setIncludeWriting(false); setError(null); }} onCancel={() => setConfirming(null)}
    onRetry={loadError ? () => void load() : undefined} onToggleWriting={setIncludeWriting} onPurge={(group) => void purge(group)} />;
}
