import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { importPackage } from "../src/importer.js";
import { exportPackage } from "../src/exporter.js";
import { readPackageZip } from "../src/zip.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

describe("export round-trip", () => {
  it("import → export → parse yields identical content", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "study-")));
    const original = readPackageZip(makeZip(GOOD_FILES)).pkg!;
    importPackage(db, makeZip(GOOD_FILES));

    const out = exportPackage(db, "demo")!;
    const reread = readPackageZip(out);
    expect(reread.errors).toEqual([]);
    const rt = reread.pkg!;
    expect(rt.manifest).toEqual(original.manifest);
    expect(rt.lessons.map(({ frontmatter, body, file }) => ({ frontmatter, body: body.trim(), file })))
      .toEqual(original.lessons.map(({ frontmatter, body, file }) => ({ frontmatter, body: body.trim(), file })));
    expect(rt.items).toEqual(original.items);
    expect(rt.quizzes).toEqual(original.quizzes);
    expect(rt.games).toEqual(original.games);
    expect(rt.assets).toEqual(original.assets);
  });

  it("returns null for an unknown package", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "study-")));
    expect(exportPackage(db, "nope")).toBeNull();
  });
});
