import { describe, expect, it } from "vitest";
import type { LoadedPackage } from "@study/shared";
import { validateImages } from "../src/imageCheck.js";

function pkg(body: string, assets: string[]): LoadedPackage {
  return {
    manifest: { formatVersion: "1.0.0", id: "p", title: "P", version: "1" },
    lessons: [{ file: "lessons/01-a.md", order: 0, frontmatter: { id: "l1", title: "L1" }, body }],
    items: [],
    quizzes: [],
    games: [],
    assets: assets.map((path) => ({ path, data: new Uint8Array() })),
  };
}

describe("validateImages", () => {
  it("checks the destination, not the title", () => {
    expect(validateImages(pkg('![pic](assets/dot.png "A dot")\n', ["assets/dot.png"]))).toEqual([]);
    expect(validateImages(pkg("![pic](<assets/dot.png> 'A dot')\n", ["assets/dot.png"]))).toEqual([]);
  });

  it("keeps balanced parentheses in a destination", () => {
    expect(validateImages(pkg("![Plot](assets/plot(1).png)\n", ["assets/plot(1).png"]))).toEqual([]);
  });

  it("ignores image syntax shown inside code", () => {
    expect(validateImages(pkg("```md\n![x](assets/example.png)\n```\n\n`![y](assets/inline.png)`\n", []))).toEqual([]);
  });

  it("resolves reference-style images", () => {
    const body = "![pic][dot]\n\n[dot]: assets/missing.png\n";
    expect(validateImages(pkg(body, []))).toEqual([
      { file: "lessons/01-a.md", path: "body", message: 'image references missing asset "assets/missing.png"' },
    ]);
  });

  it("checks the stored path the asset route will decode the URL to", () => {
    expect(validateImages(pkg("![pic](assets/a%20b.png)\n", ["assets/a b.png"]))).toEqual([]);
    expect(validateImages(pkg("![pic](assets/a%23b.png)\n", ["assets/a#b.png"]))).toEqual([]);
    expect(validateImages(pkg("![pic](assets/dot.png?v=2#top)\n", ["assets/dot.png"]))).toEqual([]);
    // A file literally named `a%20b.png` is requested as `a b.png`, which is absent.
    expect(validateImages(pkg("![pic](assets/a%20b.png)\n", ["assets/a%20b.png"]))).toHaveLength(1);
  });

  it("uses the first definition of a label, as the renderer does", () => {
    const body = "![pic][x]\n\n[x]: assets/missing.png\n[x]: assets/present.png\n";
    expect(validateImages(pkg(body, ["assets/present.png"]))).toHaveLength(1);
    const reversed = "![pic][x]\n\n[x]: assets/present.png\n[x]: assets/missing.png\n";
    expect(validateImages(pkg(reversed, ["assets/present.png"]))).toEqual([]);
  });

  it("reports a missing asset and leaves other URLs alone", () => {
    const errs = validateImages(pkg('![gone](assets/gone.png "t")\n\n![web](https://example.com/x.png)\n', []));
    expect(errs).toEqual([
      { file: "lessons/01-a.md", path: "body", message: 'image references missing asset "assets/gone.png"' },
    ]);
  });
});
