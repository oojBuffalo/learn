import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { CheckableItem, GameResult } from "@study/shared";
import { GameResultSummary } from "../src/pages/Game.js";
import ItemRun from "../src/components/ItemRun.js";
import MatchingBoard from "../src/components/MatchingBoard.js";

const mcHinted: CheckableItem = { id: "mc", type: "multiple-choice", prompt: "Pick", shuffle: false, hints: ["Think about timing."], options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] };
const ms: CheckableItem = { id: "ms", type: "multi-select", prompt: "Pick two", partialCredit: true, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B", correct: true }, { id: "c", text: "C" }] };
const html = renderToStaticMarkup;
const CHECK = /<button[^>]*>Check<\/button>/;

it("GameResultSummary floors the score and reads matched, misses, time and expiry", () => {
  const r = (o: Partial<GameResult>): GameResult => ({ template: "matching", score: 0.75, correctCount: 3, total: 3,
    mistakes: 1, completed: true, timedOut: false, elapsedSeconds: 42, ...o });
  expect(html(<GameResultSummary result={r({})} />)).toContain("75% · 3 of 3 matched · 1 miss · 0:42");
  expect(html(<GameResultSummary result={r({ score: 0.6, mistakes: 2 })} />)).toContain("60% · 3 of 3 matched · 2 misses · 0:42");
  expect(html(<GameResultSummary result={r({ template: "timed-round", score: 0, correctCount: 0, total: 2, mistakes: 0,
    completed: false, timedOut: true, elapsedSeconds: 60 })} />)).toContain("0% · 0 of 2 correct · 1:00 · Time’s up");
  expect(html(<GameResultSummary result={r({ template: "order-it", score: 0.7467, correctCount: 0, total: 1 })} />))
    .toContain("74% · 0 of 1 correct · 0:42");
});
it("ItemRun shows one numbered question with Check and no hints", () => {
  const out = html(<ItemRun packageId="p" items={[mcHinted, ms]} deal={{ template: "timed-round", itemIds: ["mc", "ms"] }}
    disabled={false} check={async () => null} onDone={() => {}} />);
  expect(out).toContain("Question 1 of 2 · Choose one"); expect(out.match(/class="work"/g)).toHaveLength(1);
  expect(out).toMatch(CHECK); expect(out).not.toContain("Show a hint");
});

it("MatchingBoard: math lefts, plain rights, a repeated right is two tiles", () => {
  const deal = { template: "matching" as const, lefts: ["$x^2$", "Plain"], rights: ["*square*", "other", "*square*"] };
  const out = html(<MatchingBoard deal={deal} disabled={false} check={async () => null} onDone={() => {}} />);
  expect(out).toMatch(/<span class="tile-text"><span class="katex">/);
  expect(out.match(/aria-pressed="false"/g)).toHaveLength(5);
  expect(out.match(/>\*square\*<\/button>/g)).toHaveLength(2); expect(out).not.toContain("<em>");
  expect(out).toContain('<p class="meta" aria-live="polite">0 of 2 matched · 0 misses</p>');
});
