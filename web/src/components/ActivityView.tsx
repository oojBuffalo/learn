import { Fragment, useState } from "react";
import type { Answer, CheckResult, Item } from "@study/shared";
import { stripMath } from "@study/shared";
import { submitAnswer } from "../api.js";
import Icon from "./Icon.js";
import Markdown, { InlineMarkdown } from "./Markdown.js";

type Task = Exclude<Item, { type: "flashcard" }>;

/** Kickers name the work being asked for, not the internal item type. */
const TYPE_LABEL: Record<Item["type"], string> = {
  "multiple-choice": "Choose one",
  "multi-select": "Choose all that apply",
  "fill-blank": "Fill in the blanks",
  "short-answer": "Short answer",
  ordering: "Put these in order",
  matching: "Match the pairs",
  flashcard: "Flashcard",
};

export default function ActivityView({ packageId, item }: { packageId: string; item: Item }) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = (answer: Answer) =>
    submitAnswer(packageId, item.id, answer)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  if (item.type === "flashcard") return <FlashcardReveal item={item} packageId={packageId} />;

  const hintsLeft = (item.hints?.length ?? 0) - hintsShown;

  return (
    <section className="work">
      <p className="work-kicker">{TYPE_LABEL[item.type]}</p>
      <Markdown packageId={packageId}>{item.prompt}</Markdown>
      <Media packageId={packageId} media={item.media} />

      <div className="work-body">
        <AnswerForm item={item} disabled={!!result} onSubmit={submit} />

        {item.hints?.slice(0, hintsShown).map((h, i) => (
          <p className="hint" key={i}>
            <Icon name="bulb" size={18} />
            <span>
              <InlineMarkdown>{h}</InlineMarkdown>
            </span>
          </p>
        ))}

        {!result && hintsLeft > 0 && (
          <div className="actions">
            <button className="btn btn-quiet" onClick={() => setHintsShown(hintsShown + 1)}>
              <Icon name="bulb" size={18} />
              {hintsShown === 0 ? "Show a hint" : "Another hint"}
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className="result">
          <p className={result.correct ? "verdict" : "verdict verdict-no"}>
            {result.correct ? (
              <span className="mark-text">✓ Correct</span>
            ) : (
              `✗ Not quite${result.score > 0 ? ` (score ${Math.round(result.score * 100)}%)` : ""}`
            )}
          </p>
          {!result.correct && result.feedback && (
            <p className="note">
              <InlineMarkdown>{result.feedback}</InlineMarkdown>
            </p>
          )}
          {!result.correct && (
            <p className="expected">
              Answer:{" "}
              <b>
                <ExpectedAnswer item={item} expected={result.expected} />
              </b>
            </p>
          )}
          {item.explanation && (
            <div className="explain">
              <Markdown packageId={packageId}>{item.explanation}</Markdown>
            </div>
          )}
          <div className="actions">
            <button className="btn" onClick={() => setResult(null)}>
              <Icon name="retry" size={18} />
              Try again
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="errors" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * The graded answer in the item's own words, not raw JSON.
 *
 * `rich` marks the pieces that are author-written display text and so may carry
 * Markdown and math. The others are values the learner typed or picked, which are
 * shown verbatim — running them through Markdown could mangle a literal `*` or `_`
 * that is part of a correct answer.
 */
function expectedParts(item: Task, expected: unknown): { parts: string[]; sep: string; rich: boolean } {
  switch (item.type) {
    case "multiple-choice":
      return {
        parts: [item.options.find((o) => o.id === expected)?.text ?? String(expected)],
        sep: "",
        rich: true,
      };
    case "multi-select": {
      const ids = new Set((Array.isArray(expected) ? expected : []).map(String));
      return { parts: item.options.filter((o) => ids.has(o.id)).map((o) => o.text), sep: ", ", rich: true };
    }
    case "fill-blank": {
      const given = (expected ?? {}) as Record<string, string>;
      return {
        parts: item.blanks.map((b) => given[String(b.slot)] ?? b.accept[0] ?? ""),
        sep: " · ",
        rich: false,
      };
    }
    case "short-answer":
      return { parts: [String(expected ?? item.accept[0] ?? "")], sep: "", rich: false };
    case "ordering": {
      const text = new Map(item.steps.map((s) => [s.id, s.text]));
      const ids = Array.isArray(expected) ? expected.map(String) : item.steps.map((s) => s.id);
      return { parts: ids.map((id) => text.get(id) ?? id), sep: " → ", rich: true };
    }
    case "matching":
      // Mixes a rich left with a plain right, so the whole summary row stays plain.
      return { parts: item.pairs.map((p) => `${p.left} → ${p.right}`), sep: " · ", rich: false };
  }
}

function ExpectedAnswer({ item, expected }: { item: Task; expected: unknown }) {
  const { parts, sep, rich } = expectedParts(item, expected);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && sep}
          {rich ? <InlineMarkdown>{part}</InlineMarkdown> : part}
        </Fragment>
      ))}
    </>
  );
}

function FlashcardReveal({ item, packageId }: { item: Extract<Item, { type: "flashcard" }>; packageId: string }) {
  const [shown, setShown] = useState(false);
  return (
    <section className="work">
      <p className="work-kicker">{TYPE_LABEL.flashcard}</p>
      <Markdown packageId={packageId}>{item.front}</Markdown>
      <Media packageId={packageId} media={item.media} />
      <div className="work-body">
        {shown ? (
          <Markdown packageId={packageId} className="answer">
            {item.back}
          </Markdown>
        ) : (
          <div className="actions">
            <button className="btn" onClick={() => setShown(true)}>
              Reveal
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Media({ packageId, media }: { packageId: string; media?: { src: string; alt?: string }[] }) {
  if (!media?.length) return null;
  return (
    <div className="work-body">
      {media.map((m) => {
        const url = `/api/packages/${packageId}/${m.src}`;
        return /\.mp3$/i.test(m.src) ? (
          <audio key={m.src} controls src={url} />
        ) : (
          <img key={m.src} src={url} alt={m.alt ?? ""} className="work-media" />
        );
      })}
    </div>
  );
}

function AnswerForm({
  item,
  disabled,
  onSubmit,
}: {
  item: Task;
  disabled: boolean;
  onSubmit: (a: Answer) => void;
}) {
  switch (item.type) {
    case "multiple-choice":
      return <Options item={item} multi={false} disabled={disabled} onSubmit={onSubmit} />;
    case "multi-select":
      return <Options item={item} multi={true} disabled={disabled} onSubmit={onSubmit} />;
    case "fill-blank":
      return <FillBlank item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "short-answer":
      return <ShortAnswer item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "ordering":
      return <Ordering item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "matching":
      return <Matching item={item} disabled={disabled} onSubmit={onSubmit} />;
  }
}

function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function Options({
  item,
  multi,
  disabled,
  onSubmit,
}: {
  item: Extract<Item, { type: "multiple-choice" | "multi-select" }>;
  multi: boolean;
  disabled: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [options] = useState(() => (item.shuffle !== false ? shuffled(item.options) : item.options));
  const toggle = (id: string) =>
    setPicked(multi ? (picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]) : [id]);

  return (
    <>
      <div className="opts">
        {options.map((o) => (
          <label className="opt" key={o.id}>
            <input
              type={multi ? "checkbox" : "radio"}
              name={item.id}
              disabled={disabled}
              checked={picked.includes(o.id)}
              onChange={() => toggle(o.id)}
            />
            <span>
              <InlineMarkdown>{o.text}</InlineMarkdown>
            </span>
          </label>
        ))}
      </div>
      {!disabled && (
        <div className="actions">
          <button
            className="btn btn-primary"
            disabled={picked.length === 0}
            onClick={() =>
              onSubmit(
                multi
                  ? { type: "multi-select", optionIds: picked }
                  : { type: "multiple-choice", optionId: picked[0]! },
              )
            }
          >
            Check
          </button>
        </div>
      )}
    </>
  );
}

function FillBlank({
  item,
  disabled,
  onSubmit,
}: {
  item: Extract<Item, { type: "fill-blank" }>;
  disabled: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const parts = item.template.split(/(\{\{\d+\}\})/);

  return (
    <>
      <p className="blank-line">
        {parts.map((part, i) => {
          const m = /^\{\{(\d+)\}\}$/.exec(part);
          return m ? (
            <input
              className="blank"
              key={i}
              aria-label={`Blank ${m[1]}`}
              disabled={disabled}
              value={answers[m[1]!] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [m[1]!]: e.target.value })}
            />
          ) : (
            <span key={i}>
              <InlineMarkdown>{part}</InlineMarkdown>
            </span>
          );
        })}
      </p>
      {!disabled && (
        <div className="actions">
          <button className="btn btn-primary" onClick={() => onSubmit({ type: "fill-blank", answers })}>
            Check
          </button>
        </div>
      )}
    </>
  );
}

function ShortAnswer({
  item,
  disabled,
  onSubmit,
}: {
  item: Extract<Item, { type: "short-answer" }>;
  disabled: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="actions">
      <input
        className="field field-grow"
        aria-label="Your answer"
        placeholder="Type your answer"
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text && onSubmit({ type: "short-answer", text })}
      />
      {!disabled && (
        <button
          className="btn btn-primary"
          disabled={!text}
          onClick={() => onSubmit({ type: "short-answer", text })}
        >
          Check
        </button>
      )}
    </div>
  );
}

function Ordering({
  item,
  disabled,
  onSubmit,
}: {
  item: Extract<Item, { type: "ordering" }>;
  disabled: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const [steps, setSteps] = useState(() => shuffled(item.steps));
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSteps(next);
  };

  return (
    <>
      <div className="opts">
        {steps.map((s, i) => (
          <div className="order-row" key={s.id}>
            <span className="order-num">{i + 1}</span>
            <span className="order-text">
              <InlineMarkdown>{s.text}</InlineMarkdown>
            </span>
            <button
              className="btn btn-quiet btn-icon"
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
            >
              <Icon name="up" size={18} label={`Move “${stripMath(s.text)}” up`} />
            </button>
            <button
              className="btn btn-quiet btn-icon"
              disabled={disabled || i === steps.length - 1}
              onClick={() => move(i, 1)}
            >
              <Icon name="down" size={18} label={`Move “${stripMath(s.text)}” down`} />
            </button>
          </div>
        ))}
      </div>
      {!disabled && (
        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={() => onSubmit({ type: "ordering", orderedIds: steps.map((s) => s.id) })}
          >
            Check
          </button>
        </div>
      )}
    </>
  );
}

function Matching({
  item,
  disabled,
  onSubmit,
}: {
  item: Extract<Item, { type: "matching" }>;
  disabled: boolean;
  onSubmit: (a: Answer) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [rights] = useState(() => shuffled([...new Set([...item.pairs.map((p) => p.right), ...(item.distractors ?? [])])]));

  return (
    <>
      <div className="opts">
        {item.pairs.map((p) => (
          <label className="match-row" key={p.left}>
            <span className="match-left">
              <InlineMarkdown>{p.left}</InlineMarkdown>
            </span>
            <select
              className="field field-grow"
              disabled={disabled}
              value={choices[p.left] ?? ""}
              onChange={(e) => setChoices({ ...choices, [p.left]: e.target.value })}
            >
              <option value="" disabled>
                choose…
              </option>
              {rights.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {!disabled && (
        <div className="actions">
          <button
            className="btn btn-primary"
            disabled={Object.keys(choices).length < item.pairs.length}
            onClick={() =>
              onSubmit({
                type: "matching",
                pairs: item.pairs.map((p) => ({ left: p.left, right: choices[p.left]! })),
              })
            }
          >
            Check
          </button>
        </div>
      )}
    </>
  );
}
