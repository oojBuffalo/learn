import { useEffect, useState } from "react";
import type { Rating } from "@study/shared";
import { getDueCards, getFreeStudy, gradeCard, listPackages, type Card } from "../api.js";
import Markdown from "../components/Markdown.js";

export default function Study() {
  const [mode, setMode] = useState<"due" | "free">("due");
  const [packages, setPackages] = useState<{ id: string; title: string }[]>([]);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => { listPackages().then((ps) => setPackages(ps.map(({ id, title }) => ({ id, title })))); }, []);
  useEffect(() => {
    if (mode === "due") { setQueue(null); getDueCards().then(setQueue); }
    else setQueue(null);
    setRevealed(false); setReviewed(0);
  }, [mode]);

  const card = queue?.[0] ?? null;
  const advance = () => { setQueue((q) => q!.slice(1)); setRevealed(false); };

  async function grade(rating: Rating) {
    const c = card!;
    await gradeCard(c.packageId, c.itemId, c.direction, rating);
    setReviewed((n) => n + 1);
    if (rating === "again") setQueue((q) => [...q!.slice(1), c]);
    else advance();
    setRevealed(false);
  }

  return (
    <>
      <h1>Study</h1>
      <p>
        <label><input type="radio" checked={mode === "due"} onChange={() => setMode("due")} /> Due today</label>{" "}
        <label><input type="radio" checked={mode === "free"} onChange={() => setMode("free")} /> Free study</label>
        {mode === "free" && (
          <select defaultValue="" onChange={(e) => { setQueue(null); getFreeStudy(e.target.value).then(setQueue); }}>
            <option value="" disabled>pick a package…</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
      </p>
      {queue === null && mode === "due" && <p>Loading…</p>}
      {queue !== null && !card && (
        <p className="correct">{mode === "due" ? `All caught up — ${reviewed} reviewed.` : "Deck finished."}</p>
      )}
      {card && (
        <div className="card">
          {card.isNew && mode === "due" && <p><em>new card</em></p>}
          <Markdown packageId={card.packageId}>{card.front}</Markdown>
          {!revealed ? (
            <button className="primary" onClick={() => setRevealed(true)}>Reveal</button>
          ) : (
            <>
              <hr />
              <Markdown packageId={card.packageId}>{card.back}</Markdown>
              {card.examples?.map((ex, i) => <p key={i}><em>{ex}</em></p>)}
              {mode === "due" ? (
                <p>
                  <button onClick={() => grade("again")}>Again</button>{" "}
                  <button onClick={() => grade("hard")}>Hard</button>{" "}
                  <button onClick={() => grade("good")}>Good</button>{" "}
                  <button onClick={() => grade("easy")}>Easy</button>
                </p>
              ) : (
                <p><button className="primary" onClick={advance}>Next</button></p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
