import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { splitLessonBody } from "@study/shared";
import Markdown, { referenceDefinitions } from "../src/components/Markdown.js";
import Media from "../src/components/Media.js";

describe("referenceDefinitions", () => {
  it("lets a segment resolve a definition written in another segment", () => {
    const body = '![pic][dot]\n\n::activity{id="mc1"}\n\nMore.\n\n[dot]: assets/dot.png "A dot"\n';
    const first = splitLessonBody(body)[0]!;
    if (first.kind !== "md") throw new Error("expected markdown first");
    const html = renderToStaticMarkup(
      <Markdown packageId="p">{referenceDefinitions(body) + first.md}</Markdown>,
    );
    expect(html).toContain('<img src="/api/packages/p/assets/dot.png" alt="pic" title="A dot"/>');
  });

  it("collects definitions nested in containers and round-trips awkward values", () => {
    const body = '> [q]: <assets/a b.png> "say \\"hi\\""\n\n- [r]: assets/c.png\n';
    const html = renderToStaticMarkup(<Markdown packageId="p">{referenceDefinitions(body) + "![x][q] ![y][r]"}</Markdown>);
    expect(html).toContain('src="/api/packages/p/assets/a%20b.png"');
    expect(html).toContain('title="say &quot;hi&quot;"');
    expect(html).toContain('src="/api/packages/p/assets/c.png"');
  });

  it("keeps the document's first definition of a label, even over a later run's own", () => {
    const body = '![a][x]\n\n[x]: assets/first.png\n\n::activity{id="mc1"}\n\n![b][x]\n\n[x]: assets/second.png\n';
    const second = splitLessonBody(body)[2]!;
    if (second.kind !== "md") throw new Error("expected markdown after the activity");
    const html = renderToStaticMarkup(<Markdown packageId="p">{referenceDefinitions(body) + second.md}</Markdown>);
    expect(html).toContain('src="/api/packages/p/assets/first.png"');
    expect(html).not.toContain("second.png");
  });

  it("adds nothing when there are no definitions", () => {
    expect(referenceDefinitions("Just [a link](https://example.com).")).toBe("");
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
