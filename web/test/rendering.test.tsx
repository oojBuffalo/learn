import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonMarkdown } from "../src/components/Markdown.js";
import Media from "../src/components/Media.js";
import ActivityView from "../src/components/ActivityView.js";

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
    const item = {
      id: "mc",
      type: "multiple-choice",
      prompt: "Pick",
      shuffle: false,
      options: [{ id: "a", text: "A", correct: true }, { id: "b", text: "B" }],
    } as const;
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
