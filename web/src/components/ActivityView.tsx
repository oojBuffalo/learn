import { useState } from "react";
import type { Answer, CheckResult, Item } from "@study/shared";
import { submitAnswer } from "../api.js";
import Markdown from "./Markdown.js";

export default function ActivityView({ packageId, item }: { packageId: string; item: Item }) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = (answer: Answer) =>
    submitAnswer(packageId, item.id, answer).then(setResult).catch((e) => setError(String(e)));

  if (item.type === "flashcard") return <FlashcardReveal item={item} packageId={packageId} />;

  return (
    <div className="card">
      <Markdown packageId={packageId}>{item.prompt}</Markdown>
      <Media packageId={packageId} media={item.media} />
      <AnswerForm item={item} disabled={!!result} onSubmit={submit} />
      {item.hints && hintsShown < item.hints.length && !result && (
        <p><button onClick={() => setHintsShown(hintsShown + 1)}>Hint</button></p>
      )}
      {item.hints?.slice(0, hintsShown).map((h, i) => <p key={i}><em>Hint: {h}</em></p>)}
      {result && (
        <div>
          <p className={result.correct ? "correct" : "incorrect"}>
            {result.correct ? "✓ Correct" : `✗ Not quite${result.score > 0 ? ` (score ${Math.round(result.score * 100)}%)` : ""}`}
          </p>
          {!result.correct && result.feedback && <p>{result.feedback}</p>}
          {!result.correct && <p>Answer: <code>{JSON.stringify(result.expected)}</code></p>}
          {item.explanation && <Markdown packageId={packageId}>{item.explanation}</Markdown>}
          <button onClick={() => setResult(null)}>Try again</button>
        </div>
      )}
      {error && <p className="incorrect">{error}</p>}
    </div>
  );
}

function FlashcardReveal({ item, packageId }: { item: Extract<Item, { type: "flashcard" }>; packageId: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="card">
      <Markdown packageId={packageId}>{item.front}</Markdown>
      <Media packageId={packageId} media={item.media} />
      {shown
        ? <Markdown packageId={packageId}>{item.back}</Markdown>
        : <button onClick={() => setShown(true)}>Reveal</button>}
    </div>
  );
}

function Media({ packageId, media }: { packageId: string; media?: { src: string; alt?: string }[] }) {
  if (!media?.length) return null;
  return (
    <>
      {media.map((m) => {
        const url = `/api/packages/${packageId}/${m.src}`;
        return /\.mp3$/i.test(m.src)
          ? <audio key={m.src} controls src={url} />
          : <img key={m.src} src={url} alt={m.alt ?? ""} style={{ maxWidth: "100%" }} />;
      })}
    </>
  );
}

function AnswerForm({ item, disabled, onSubmit }:
  { item: Exclude<Item, { type: "flashcard" }>; disabled: boolean; onSubmit: (a: Answer) => void }) {
  switch (item.type) {
    case "multiple-choice": return <Options item={item} multi={false} disabled={disabled} onSubmit={onSubmit} />;
    case "multi-select": return <Options item={item} multi={true} disabled={disabled} onSubmit={onSubmit} />;
    case "fill-blank": return <FillBlank item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "short-answer": return <ShortAnswer item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "ordering": return <Ordering item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "matching": return <Matching item={item} disabled={disabled} onSubmit={onSubmit} />;
  }
}

function useShuffled<T>(arr: T[], active: boolean): T[] {
  const [order] = useState(() =>
    active ? [...arr.keys()].sort(() => Math.random() - 0.5) : [...arr.keys()]);
  return order.map((i) => arr[i]!);
}

function Options({ item, multi, disabled, onSubmit }: {
  item: Extract<Item, { type: "multiple-choice" | "multi-select" }>;
  multi: boolean; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const options = useShuffled(item.options, item.shuffle !== false);
  const toggle = (id: string) =>
    setPicked(multi ? (picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]) : [id]);
  return (
    <div>
      {options.map((o) => (
        <label key={o.id} style={{ display: "block" }}>
          <input type={multi ? "checkbox" : "radio"} name={item.id} disabled={disabled}
            checked={picked.includes(o.id)} onChange={() => toggle(o.id)} /> {o.text}
        </label>
      ))}
      <button className="primary" disabled={disabled || picked.length === 0}
        onClick={() => onSubmit(multi
          ? { type: "multi-select", optionIds: picked }
          : { type: "multiple-choice", optionId: picked[0]! })}>
        Check
      </button>
    </div>
  );
}

function FillBlank({ item, disabled, onSubmit }: {
  item: Extract<Item, { type: "fill-blank" }>; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const parts = item.template.split(/(\{\{\d+\}\})/);
  return (
    <div>
      <p>
        {parts.map((part, i) => {
          const m = /^\{\{(\d+)\}\}$/.exec(part);
          return m ? (
            <input key={i} size={12} disabled={disabled} value={answers[m[1]!] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [m[1]!]: e.target.value })} />
          ) : <span key={i}>{part}</span>;
        })}
      </p>
      <button className="primary" disabled={disabled} onClick={() => onSubmit({ type: "fill-blank", answers })}>Check</button>
    </div>
  );
}

function ShortAnswer({ item, disabled, onSubmit }: {
  item: Extract<Item, { type: "short-answer" }>; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [text, setText] = useState("");
  return (
    <p>
      <input value={text} disabled={disabled} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text && onSubmit({ type: "short-answer", text })} />{" "}
      <button className="primary" disabled={disabled || !text} onClick={() => onSubmit({ type: "short-answer", text })}>Check</button>
    </p>
  );
}

function Ordering({ item, disabled, onSubmit }: {
  item: Extract<Item, { type: "ordering" }>; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [steps, setSteps] = useState(() => shuffleOnce(item.steps));
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSteps(next);
  };
  return (
    <div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.id}>
            {s.text}{" "}
            <button disabled={disabled} onClick={() => move(i, -1)}>↑</button>
            <button disabled={disabled} onClick={() => move(i, 1)}>↓</button>
          </li>
        ))}
      </ol>
      <button className="primary" disabled={disabled}
        onClick={() => onSubmit({ type: "ordering", orderedIds: steps.map((s) => s.id) })}>Check</button>
    </div>
  );
}
function shuffleOnce<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function Matching({ item, disabled, onSubmit }: {
  item: Extract<Item, { type: "matching" }>; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const rights = [...new Set([...item.pairs.map((p) => p.right), ...(item.distractors ?? [])])];
  return (
    <div>
      {item.pairs.map((p) => (
        <p key={p.left}>
          {p.left} →{" "}
          <select disabled={disabled} value={choices[p.left] ?? ""}
            onChange={(e) => setChoices({ ...choices, [p.left]: e.target.value })}>
            <option value="" disabled>choose…</option>
            {rights.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </p>
      ))}
      <button className="primary"
        disabled={disabled || Object.keys(choices).length < item.pairs.length}
        onClick={() => onSubmit({ type: "matching", pairs: item.pairs.map((p) => ({ left: p.left, right: choices[p.left]! })) })}>
        Check
      </button>
    </div>
  );
}
