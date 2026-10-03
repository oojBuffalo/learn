import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { importPackage } from "../src/importer.js";
import { exportPackage, loadPackageFromDb } from "../src/exporter.js";
import { readPackageZip } from "../src/zip.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

// Local extension of GOOD_FILES (not a mutation — other suites assert against GOOD_FILES
// as-is) that adds a quiz and a game so the round-trip proves quizzes/games survive too.
// mc1 is multiple-choice: quizzable, and compatible with the "timed-round" game template.
// card1 is a flashcard — not quizzable/gameable, so it's deliberately not referenced here.
const FILES = {
  ...GOOD_FILES,
  "quizzes.json": JSON.stringify([{ id: "quiz1", title: "Quiz 1", items: ["mc1"] }]),
  "games.json": JSON.stringify([
    { id: "game1", template: "timed-round", title: "Game 1", source: { itemIds: ["mc1"] } },
  ]),
};

describe("export round-trip", () => {
  it("import → export → parse yields identical content", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "study-")));
    const original = readPackageZip(makeZip(FILES)).pkg!;
    // Guard against the round-trip going vacuous: if these fixtures ever lose their
    // quiz/game content, the toEqual checks below would trivially pass on [] === [].
    expect(original.quizzes.length).toBeGreaterThan(0);
    expect(original.games.length).toBeGreaterThan(0);
    importPackage(db, makeZip(FILES));

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

  it("loads structured content by its persisted package order", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "study-")));
    importPackage(db, makeZip(FILES));

    const reorder = db.transaction(() => {
      db.prepare("UPDATE items SET ord = ord + 100 WHERE package_id = 'demo'").run();
      db.prepare("UPDATE items SET ord = CASE id WHEN 'card1' THEN 0 ELSE 1 END WHERE package_id = 'demo'").run();
    });
    reorder();

    expect(loadPackageFromDb(db, "demo")!.items.map((item) => item.id)).toEqual(["card1", "mc1"]);
  });
});
