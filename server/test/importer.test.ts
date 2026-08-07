import { describe, expect, it } from "vitest";
import { importPackage } from "../src/importer.js";
import { freshDb, GOOD_FILES, makeZip } from "./helpers.js";

describe("importPackage", () => {
  it("imports a valid zip and stores all content", () => {
    const db = freshDb();
    const res = importPackage(db, makeZip(GOOD_FILES));
    expect(res).toEqual({ ok: true, packageId: "demo" });
    expect(db.prepare("SELECT COUNT(*) n FROM items WHERE package_id='demo'").get()).toMatchObject({ n: 2 });
    expect(db.prepare("SELECT COUNT(*) n FROM assets WHERE package_id='demo'").get()).toMatchObject({ n: 1 });
    expect(db.prepare("SELECT ord FROM lessons WHERE package_id='demo' AND id='intro'").get()).toMatchObject({ ord: 0 });
  });

  it("rejects a zip with a dangling activity ref, atomically", () => {
    const db = freshDb();
    const bad = { ...GOOD_FILES, "items.json": JSON.stringify([]) };
    const res = importPackage(db, makeZip(bad));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.message.includes("mc1"))).toBe(true);
    expect(db.prepare("SELECT COUNT(*) n FROM packages").get()).toMatchObject({ n: 0 });
  });

  it("reports Zod errors with file and path", () => {
    const db = freshDb();
    const bad = { ...GOOD_FILES, "manifest.json": JSON.stringify({ formatVersion: "1.0.0", id: "demo" }) };
    const res = importPackage(db, makeZip(bad));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatchObject({ file: "manifest.json" });
  });

  it("reports malformed lesson frontmatter instead of throwing", () => {
    const db = freshDb();
    const bad = {
      ...GOOD_FILES,
      "lessons/01-intro.md": "---\nid: [different-unterminated\n---\nLesson body\n",
    };

    expect(importPackage(db, makeZip(bad))).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          file: "lessons/01-intro.md",
          path: "frontmatter",
          message: expect.stringContaining("invalid YAML"),
        }),
      ],
    });
    expect(db.prepare("SELECT COUNT(*) n FROM packages").get()).toMatchObject({ n: 0 });
  });

  it("reports independent semantic errors alongside parse errors", () => {
    const db = freshDb();
    const bad = {
      ...GOOD_FILES,
      "lessons/01-intro.md": "---\nid: [unterminated\n---\nLesson body\n",
      "quizzes.json": JSON.stringify([
        { id: "quiz-1", title: "First", items: ["mc1"] },
        { id: "quiz-1", title: "Second", items: ["mc1"] },
      ]),
    };

    const result = importPackage(db, makeZip(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("invalid YAML") }),
        expect.objectContaining({ message: 'duplicate quiz id "quiz-1"' }),
      ]));
    }
  });

  it("rejects duplicate quiz ids before writing to SQLite", () => {
    const db = freshDb();
    const bad = {
      ...GOOD_FILES,
      "quizzes.json": JSON.stringify([
        { id: "quiz-1", title: "First", items: ["mc1"] },
        { id: "quiz-1", title: "Second", items: ["mc1"] },
      ]),
    };

    const result = importPackage(db, makeZip(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({
        file: "quizzes.json",
        path: "quiz-1",
        message: 'duplicate quiz id "quiz-1"',
      }));
    }
    expect(db.prepare("SELECT COUNT(*) n FROM packages").get()).toMatchObject({ n: 0 });
  });

  it("rejects duplicate game ids before writing to SQLite", () => {
    const db = freshDb();
    const game = {
      id: "game-1",
      template: "timed-round",
      title: "Round",
      source: { itemIds: ["mc1"] },
    };
    const bad = { ...GOOD_FILES, "games.json": JSON.stringify([game, game]) };

    const result = importPackage(db, makeZip(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.objectContaining({
        file: "games.json",
        path: "game-1",
        message: 'duplicate game id "game-1"',
      }));
    }
    expect(db.prepare("SELECT COUNT(*) n FROM packages").get()).toMatchObject({ n: 0 });
  });

  it("persists lesson order from manifest units when present", () => {
    const db = freshDb();
    const files = {
      ...GOOD_FILES,
      "manifest.json": JSON.stringify({
        formatVersion: "1.0.0",
        id: "demo",
        title: "Demo",
        version: "1",
        units: [{ id: "unit-1", title: "Unit", lessonIds: ["second", "intro"] }],
      }),
      "lessons/02-second.md": "---\nid: second\ntitle: Second\n---\nSecond lesson\n",
    };

    expect(importPackage(db, makeZip(files)).ok).toBe(true);
    expect(db.prepare(
      "SELECT id FROM lessons WHERE package_id = 'demo' ORDER BY ord",
    ).all()).toEqual([{ id: "second" }, { id: "intro" }]);
  });

  it("re-import replaces content but preserves user state", () => {
    const db = freshDb();
    importPackage(db, makeZip(GOOD_FILES));
    db.prepare(
      "INSERT INTO card_state (package_id,item_id,direction,interval_days,ease,reps,lapses,due_at) VALUES ('demo','card1','front',1,2.5,1,0,'2026-08-04T00:00:00.000Z')",
    ).run();
    const v2 = {
      ...GOOD_FILES,
      "manifest.json": JSON.stringify({ formatVersion: "1.0.0", id: "demo", title: "Demo v2", version: "2" }),
    };
    const res = importPackage(db, makeZip(v2));
    expect(res.ok).toBe(true);
    expect(JSON.parse((db.prepare("SELECT manifest FROM packages WHERE id='demo'").get() as any).manifest).title).toBe("Demo v2");
    expect(db.prepare("SELECT COUNT(*) n FROM card_state").get()).toMatchObject({ n: 1 });
  });
});
