import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { schedule } from "@study/shared";
import type { Rating } from "@study/shared";
import { getDueCards, getFreeStudy, gradeCard, listPackages, type Card } from "../api.js";
import { useDue } from "../App.js";
import Markdown from "../components/Markdown.js";

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];
const RATING_LABEL: Record<Rating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

/** How far a grade throws the card — the whole point of grading it. */
function formatInterval(days: number): string {
  if (days < 1) return "now";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Study() {
  const [mode, setMode] = useState<"due" | "free">("due");
  const [packages, setPackages] = useState<{ id: string; title: string }[]>([]);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [freePackage, setFreePackage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { refreshDue } = useDue();

  useEffect(() => {
    listPackages()
      .then((ps) => setPackages(ps.map(({ id, title }) => ({ id, title }))))
      .catch((e) => setError(message(e)));
  }, []);

  useEffect(() => {
    setRevealed(false);
    setReviewed(0);
    setTotal(0);
    setQueue(null);
    setError(null);
    setFreePackage("");
    if (mode === "due") {
      getDueCards()
        .then((cards) => {
          setQueue(cards);
          setTotal(cards.length);
        })
        .catch((e) => {
          setQueue([]);
          setError(message(e));
        });
    }
  }, [mode]);

  function loadFreeStudy(packageId: string) {
    setFreePackage(packageId);
    setRevealed(false);
    setReviewed(0);
    setQueue(null);
    setError(null);
    getFreeStudy(packageId)
      .then((cards) => {
        setQueue(cards);
        setTotal(cards.length);
      })
      .catch((e) => {
        setQueue([]);
        setError(message(e));
      });
  }

  const card = queue?.[0] ?? null;
  const advance = () => {
    setQueue((q) => q!.slice(1));
    setRevealed(false);
  };

  async function grade(rating: Rating) {
    if (!card) return;
    const graded = card;
    try {
      const { state } = await gradeCard(graded.packageId, graded.itemId, graded.direction, rating);
      setReviewed((n) => n + 1);
      setQueue((q) =>
        rating === "again"
          ? [...q!.slice(1), { ...graded, state, isNew: false }]
          : q!.slice(1),
      );
      setRevealed(false);
      refreshDue();
    } catch (e) {
      setError(message(e));
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (!card) return;
      if (!revealed) {
        if (e.key === " " && tag !== "BUTTON") {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (mode === "due") {
        const i = ["1", "2", "3", "4"].indexOf(e.key);
        if (i >= 0) {
          e.preventDefault();
          void grade(RATINGS[i]!);
        }
      } else if (e.key === " " && tag !== "BUTTON") {
        e.preventDefault();
        advance();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const remaining = queue?.length ?? 0;
  const cleared = Math.max(0, total - remaining);

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Spaced repetition</p>
        <h1 className="page-title">Study</h1>
      </header>

      <div className="study-bar">
        <div className="segmented" role="radiogroup" aria-label="Study mode">
          <label>
            <input type="radio" name="study-mode" checked={mode === "due"} onChange={() => setMode("due")} />
            Due today
          </label>
          <label>
            <input type="radio" name="study-mode" checked={mode === "free"} onChange={() => setMode("free")} />
            Free study
          </label>
        </div>

        {mode === "free" && (
          <select
            className="field"
            aria-label="Package to drill"
            value={freePackage}
            onChange={(e) => loadFreeStudy(e.target.value)}
          >
            <option value="" disabled>
              pick a package…
            </option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        )}

        {total > 0 && (
          <div className="progress">
            <p className="meta">
              {remaining} left of {total}
            </p>
            <div
              className="meter"
              role="progressbar"
              aria-label="Session progress"
              aria-valuenow={cleared}
              aria-valuemin={0}
              aria-valuemax={total}
            >
              <i style={{ width: `${total ? (cleared / total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}

      {queue === null && (mode === "due" || freePackage) && <p className="loading">Loading…</p>}

      {mode === "free" && !freePackage && queue === null && (
        <div className="empty">
          <p className="empty-title">Drill without touching the schedule</p>
          <p className="note">Pick a package above. Nothing you do here changes when cards come back.</p>
        </div>
      )}

      {queue !== null && !card && (
        <div className="empty">
          <p className="empty-title">
            {mode === "due"
              ? reviewed > 0
                ? `All caught up — ${reviewed} reviewed.`
                : "Nothing due right now."
              : "Deck finished."}
          </p>
          <p className="note">
            {mode === "due" ? "Cards come back as their intervals expire." : "Free study leaves the schedule alone."}
          </p>
          <Link className="btn" to="/">
            Back to library
          </Link>
        </div>
      )}

      {card && (
        <>
          <div className="study-card">
            {card.isNew && mode === "due" && <p className="chip">new card</p>}

            <Markdown className="card-face" packageId={card.packageId}>
              {card.front}
            </Markdown>

            {!revealed ? (
              <div className="actions actions-center">
                <button className="btn btn-primary" onClick={() => setRevealed(true)}>
                  Reveal
                </button>
              </div>
            ) : (
              <>
                <div className="card-fold" />
                <Markdown className="answer" packageId={card.packageId}>
                  {card.back}
                </Markdown>
                {card.examples && card.examples.length > 0 && (
                  <p className="examples">{card.examples.join(" · ")}</p>
                )}
              </>
            )}
          </div>

          {revealed &&
            (mode === "due" ? (
              <>
                <div className="grades">
                  {RATINGS.map((r) => (
                    <button
                      className="grade"
                      key={r}
                      data-rating={r}
                      aria-label={RATING_LABEL[r]}
                      onClick={() => grade(r)}
                    >
                      <b>{RATING_LABEL[r]}</b>
                      <small>{formatInterval(schedule(card.state ?? null, r, new Date()).intervalDays)}</small>
                    </button>
                  ))}
                </div>
                <p className="keys meta">
                  <kbd>1</kbd>–<kbd>4</kbd> to grade · <kbd>space</kbd> to reveal
                </p>
              </>
            ) : (
              <div className="actions actions-center">
                <button className="btn btn-primary" onClick={advance}>
                  Next
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
