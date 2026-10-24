import { useEffect, useRef, useState } from "react";
import type { GameDeal, GameMove, GameMoveResult } from "@study/shared";
import { InlineMarkdown } from "./Markdown.js";

export default function MatchingBoard({ deal, disabled, check, onDone }: {
  deal: Extract<GameDeal, { template: "matching" }>;
  disabled: boolean;
  check: (move: GameMove) => Promise<GameMoveResult | null>;
  onDone: () => void;
}) {
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<string>>(() => new Set());
  const [matchedRights, setMatchedRights] = useState<Set<number>>(() => new Set());
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState<{ left: string; right: number } | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const leftButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!focusRequest || disabled) return;
    const first = deal.lefts.find((text) => !matched.has(text));
    if (first !== undefined) leftButtons.current[first]?.focus();
  }, [focusRequest, disabled, deal.lefts, matched]);

  const pick = async (pickedLeft: string, pickedRight: number) => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    const result = await check({ left: pickedLeft, right: deal.rights[pickedRight]! });
    setLeft(null);
    setRight(null);
    if (result?.correct) {
      const next = new Set(matched).add(pickedLeft);
      setMatched(next);
      setMatchedRights(new Set(matchedRights).add(pickedRight));
      if (next.size === deal.lefts.length) onDone();
    } else if (result) {
      setMistakes((value) => value + 1);
      setWrong({ left: pickedLeft, right: pickedRight });
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setWrong(null), 600);
    }
    inFlight.current = false;
    setFocusRequest((value) => value + 1);
  };

  return <>
    <div className="board">
      <div className="board-col" role="group" aria-label="Terms">
        {deal.lefts.map((text) => <button key={text}
          ref={(button) => { leftButtons.current[text] = button; }}
          className={`tile${matched.has(text) ? " is-matched" : ""}${wrong?.left === text ? " is-wrong" : ""}`}
          aria-pressed={left === text} disabled={disabled || matched.has(text)}
          onClick={() => {
            if (inFlight.current) return;
            const next = left === text ? null : text;
            setLeft(next);
            if (next !== null && right !== null) void pick(next, right);
          }}><span className="tile-text"><InlineMarkdown>{text}</InlineMarkdown></span></button>)}
      </div>
      <div className="board-col" role="group" aria-label="Matches">
        {deal.rights.map((text, index) => <button key={index}
          className={`tile${matchedRights.has(index) ? " is-matched" : ""}${wrong?.right === index ? " is-wrong" : ""}`}
          aria-pressed={right === index} disabled={disabled || matchedRights.has(index)}
          onClick={() => {
            if (inFlight.current) return;
            const next = right === index ? null : index;
            setRight(next);
            if (left !== null && next !== null) void pick(left, next);
          }}>{text}</button>)}
      </div>
    </div>
    <p className="meta" aria-live="polite">{matched.size} of {deal.lefts.length} matched · {mistakes} {mistakes === 1 ? "miss" : "misses"}</p>
  </>;
}
