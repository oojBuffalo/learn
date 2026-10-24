import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Item, CheckableItem } from "@study/shared";
import { LessonMarkdown } from "../src/components/Markdown.js";
import Media from "../src/components/Media.js";
import ActivityView, { AnswerForm, ItemPrompt, Verdict } from "../src/components/ActivityView.js";

const lesson = (body: string) =>
  renderToStaticMarkup(
    <LessonMarkdown packageId="p" activity={(id) => <aside data-activity={id} />}>
      {body}
    </LessonMarkdown>,
  );

describe("LessonMarkdown", () => {
  it("keeps activities between prose blocks rather than inside them", () => {
    const html = lesson('Intro.\n\n::activity{id="a"}\n\nMiddle.\n\n::activity{id="a"}\n');
    expect(html).toBe(
      '<div class="prose"><p>Intro.</p></div><aside data-activity="a"></aside>' +
        '<div class="prose"><p>Middle.</p></div><aside data-activity="a"></aside>',
    );
  });

  it("resolves a reference image across an activity", () => {
    const html = lesson('![pic][dot]\n\n::activity{id="mc1"}\n\n[dot]: assets/dot.png "A dot"\n');
    expect(html).toContain('<img src="/api/packages/p/assets/dot.png" alt="pic" title="A dot"/>');
  });

  it("keeps the first definition of a label", () => {
    const html = lesson('![a][x]\n\n[x]: assets/first.png\n\n::activity{id="mc1"}\n\n![b][x]\n\n[x]: assets/second.png\n');
    expect(html).not.toContain("second.png");
    expect(html.match(/assets\/first\.png/g)).toHaveLength(2);
  });

  it("links a footnote to a definition written after an activity", () => {
    const html = lesson('A fact[^note].\n\n::activity{id="mc1"}\n\n[^note]: Explanation of the fact.\n');
    expect(html).toContain('href="#user-content-fn-note"');
    expect(html).toContain("Explanation of the fact.");
    expect(html).not.toContain("[^note]");
  });

  it("renders an activity after a fence opened on a list-item line", () => {
    const html = lesson('- ```text\n  hello\n  ```\n\n::activity{id="mc1"}\n');
    expect(html).toContain('<aside data-activity="mc1"></aside>');
    expect(html).not.toContain("::activity");
  });
});

describe("ActivityView", () => {
  it("gives each copy of an exercise its own radio group", () => {
    const item: Item = {
      id: "mc",
      type: "multiple-choice",
      prompt: "Pick",
      shuffle: false,
      options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }],
    };
    const html = renderToStaticMarkup(
      <>
        <ActivityView packageId="p" item={item} />
        <ActivityView packageId="p" item={item} />
      </>,
    );
    const names = [...html.matchAll(/type="radio" name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toBe(names[1]);
  });
});

describe("Media", () => {
  it("encodes each path segment so the stored name reaches the server", () => {
    const html = renderToStaticMarkup(
      <Media packageId="p" media={[{ src: "assets/a#b.png" }, { src: "assets/x/a%20b.png" }]} />,
    );
    expect(html).toContain('src="/api/packages/p/assets/a%23b.png"');
    expect(html).toContain('src="/api/packages/p/assets/x/a%2520b.png"');
  });
});


const mc: CheckableItem = { id: "mc", type: "multiple-choice", prompt: "Pick", shuffle: false, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }] };
const ms: CheckableItem = { id: "ms", type: "multi-select", prompt: "Pick two", partialCredit: true, options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B", correct: true }, { id: "c", text: "C" }] };
const fb: CheckableItem = { id: "fb", type: "fill-blank", prompt: "Fill", template: "A {{1}} B", blanks: [{ slot: 1, accept: ["x"] }] };
const sa: CheckableItem = { id: "sa", type: "short-answer", prompt: "Say", accept: ["recall"], hints: ["It starts with r."] };
const ord: CheckableItem = { id: "ord", type: "ordering", prompt: "Order", steps: [{ id: "s1", text: "First" }, { id: "s2", text: "Second" }] };
const mat: CheckableItem = { id: "mat", type: "matching", prompt: "Match", pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }], distractors: ["R3"] };
const html = renderToStaticMarkup;
const CHECK = /<button[^>]*>Check<\/button>/;
const CHECK_ON = /<button(?![^>]*\sdisabled)[^>]*>Check<\/button>/;
const CHECK_OFF = /<button[^>]*\sdisabled=""[^>]*>Check<\/button>/;

it("AnswerForm renders Check only when onSubmit is given", () => {
  for (const item of [mc, ms, fb, sa, ord, mat]) {
    expect(html(<AnswerForm item={item} disabled={false} onChange={() => {}} />)).not.toMatch(CHECK);
    expect(html(<AnswerForm item={item} disabled={false} onSubmit={() => {}} />)).toMatch(CHECK);
  }
});
it("AnswerForm keeps today's Check enable rules on an empty form", () => {
  for (const item of [fb, ord]) expect(html(<AnswerForm item={item} disabled={false} onSubmit={() => {}} />)).toMatch(CHECK_ON);   // :338, :429: enabled even with every blank empty
  for (const item of [mc, ms, sa, mat]) expect(html(<AnswerForm item={item} disabled={false} onSubmit={() => {}} />)).toMatch(CHECK_OFF); // :279, :371, :481
});
it("AnswerForm caps typed answers at MAX_ANSWER_TEXT", () => {
  expect(html(<AnswerForm item={sa} disabled={false} />)).toMatch(/maxlength="200"/i);
  expect(html(<AnswerForm item={fb} disabled={false} />)).toMatch(/maxlength="200"/i);
});
it("a two-step ordering never starts solved", () => {
  const out = html(<AnswerForm item={ord} disabled={false} />);
  expect(out.indexOf("Second")).toBeLessThan(out.indexOf("First"));
});
it("ItemPrompt uses the kicker it is given, else the type label", () => {
  expect(html(<ItemPrompt packageId="p" item={mc} kicker="Question 1 of 4 · Choose one" />))
    .toContain('<p class="work-kicker">Question 1 of 4 · Choose one</p>');
  expect(html(<ItemPrompt packageId="p" item={mc} />)).toContain('<p class="work-kicker">Choose one</p>');
});
it("Verdict shows a correct answer, a scored miss and an unanswered item", () => {
  const ok = html(<Verdict packageId="p" item={mc} result={{ correct: true, score: 1, expected: "a" }} />);
  expect(ok).toContain("✓ Correct"); expect(ok).not.toContain("Try again");
  const half = html(<Verdict packageId="p" item={ms} result={{ correct: false, score: 0.5, expected: ["a", "b"] }} />);
  expect(half).toContain("✗ Not quite (score 50%)"); expect(half).toContain("Answer:");
  const blank = html(<Verdict packageId="p" item={mc} answered={false} result={{ correct: false, score: 0, expected: "a" }} />);
  expect(blank).toContain("— Not answered"); expect(blank).toContain("Answer:"); expect(blank).not.toContain("Not quite");
});
it("ActivityView keeps one Check button and its hints", () => {
  const out = html(<ActivityView packageId="p" item={sa} />);
  expect(out.match(/>Check<\/button>/g)).toHaveLength(1); expect(out).toContain("Show a hint");
});
