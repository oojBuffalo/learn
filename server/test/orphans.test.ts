import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { Item } from "@study/shared";
import { createApp } from "../src/app.js";
import type { Db } from "../src/db.js";
import { importPackage } from "../src/importer.js";
import { CONTENT_TABLES, ORPHAN_TABLE, LIVE, countOrphans, orphanReport, purgeOrphans } from "../src/orphans.js";
import { freshDb, makeZip, GOOD_FILES, PLAY_FILES, V2_FILES, seedUserState, NO_ORPHANS, ORPHANS_AFTER_V2, ORPHANS_AFTER_DELETE } from "./helpers.js";

const NO_REVERSE = { ...GOOD_FILES, "items.json": JSON.stringify((JSON.parse(GOOD_FILES["items.json"] as string) as Item[]).map((item) => item.type === "flashcard" ? { ...item, reverse: false } : item)) };
const OTHER_FILES = { ...GOOD_FILES, "manifest.json": JSON.stringify({ formatVersion: "1.0.0", id: "other", title: "Other", version: "1" }) };
const PLAY_DROPPED = { ...PLAY_FILES,
  "quizzes.json": JSON.stringify((JSON.parse(PLAY_FILES["quizzes.json"] as string) as { id: string }[]).filter((quiz) => quiz.id !== "quiz-all")),
  "games.json": JSON.stringify((JSON.parse(PLAY_FILES["games.json"] as string) as { id: string }[]).filter((game) => game.id !== "g-match")),
};
let db: Db;
beforeEach(() => { db = freshDb(); });
afterEach(() => db.close());
const load = (files = GOOD_FILES) => expect(importPackage(db, makeZip(files))).toMatchObject({ ok: true });
const seed = () => { load(); seedUserState(db); };
const total = () => Object.values(ORPHAN_TABLE).reduce((sum, table) => sum + (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n, 0);
const card = (packageId: string, itemId: string, direction = "front") =>
  db.prepare("INSERT INTO card_state VALUES (?, ?, ?, 1, 2.5, 1, 0, '2026-10-01')").run(packageId, itemId, direction);

it("classifies every table as content or user state", () => {
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
  expect(names).toEqual([...CONTENT_TABLES, ...Object.values(ORPHAN_TABLE)].sort());
});
it("counts nothing while every row is live", () => {
  seed(); expect(countOrphans(db, "demo")).toEqual(NO_ORPHANS); expect(orphanReport(db)).toEqual([]);
});
it("a re-import that drops card1 and renames intro orphans exactly their rows", () => {
  seed(); load(V2_FILES);
  expect(countOrphans(db, "demo")).toEqual(ORPHANS_AFTER_V2);
  expect(orphanReport(db)).toEqual([{ packageId: "demo", packageTitle: "Demo", inLibrary: true, counts: ORPHANS_AFTER_V2 }]);
});
it("reverse:false orphans only the back direction", () => {
  seed(); load(NO_REVERSE);
  expect(countOrphans(db, "demo")).toEqual({ ...NO_ORPHANS, cardState: 1, reviewLog: 1 });
});
it("a legacy review with an invalid direction is orphaned even on a reverse card", () => {
  seed();
  db.prepare("INSERT INTO review_log (package_id, item_id, direction, rating, at) VALUES ('demo', 'card1', 'sideways', 'good', 't')").run();
  expect(countOrphans(db, "demo")).toEqual({ ...NO_ORPHANS, reviewLog: 1 });
});
it("a quiz or game run is orphaned only when its ref_id is gone", () => {
  load(PLAY_FILES);
  const insert = db.prepare("INSERT INTO attempts (package_id, kind, ref_id, item_id, at) VALUES ('demo', ?, ?, ?, 't')");
  for (const [kind, refId, itemId] of [["quiz", "quiz-all", null], ["quiz", "quiz-plain", null], ["game", "g-match", null], ["game", "g-speed", null], ["exercise", null, "mc1"], ["exercise", null, "retired"]]) insert.run(kind, refId, itemId);
  expect(countOrphans(db, "demo").attempts).toBe(1);
  load(PLAY_DROPPED); expect(countOrphans(db, "demo").attempts).toBe(3);
  load(PLAY_FILES); expect(countOrphans(db, "demo").attempts).toBe(1);
});
it("a deleted package orphans everything but standalone notes", () => {
  seed(); db.prepare("DELETE FROM packages WHERE id = 'demo'").run();
  expect(countOrphans(db, "demo")).toEqual(ORPHANS_AFTER_DELETE);
  expect(orphanReport(db)).toEqual([{ packageId: "demo", packageTitle: null, inLibrary: false, counts: ORPHANS_AFTER_DELETE }]);
});
it("LIVE.cardState keeps exactly the states free study shows", async () => {
  load(); for (const [id, direction] of [["card1", "front"], ["card1", "back"], ["mc1", "front"], ["gone", "front"]]) card("demo", id!, direction!);
  load(NO_REVERSE);
  const rows = db.prepare(`SELECT item_id, direction FROM card_state c WHERE ${LIVE.cardState("c")}`).all();
  expect(rows).toEqual([{ item_id: "card1", direction: "front" }]);
  const { cards } = await (await createApp(db).request("/api/review/free-study?packageId=demo")).json();
  expect(cards.filter((c: { state: unknown }) => c.state !== null).map((c: { itemId: string; direction: string }) => [c.itemId, c.direction])).toEqual([["card1", "front"]]);
  expect(countOrphans(db, "demo").cardState).toBe(3);
});
it("a stale count deletes nothing and returns the current counts", () => {
  seed(); load(V2_FILES);
  expect(purgeOrphans(db, { packageId: "demo", includeWriting: false, expected: { ...ORPHANS_AFTER_V2, cardState: 1 } })).toEqual({ ok: false, current: ORPHANS_AFTER_V2 });
  expect(total()).toBe(10);
  expect(purgeOrphans(db, { packageId: "demo", includeWriting: false, expected: { ...ORPHANS_AFTER_V2, notes: 0 } })).toMatchObject({ ok: true });
});
it("purges writing only when asked; live rows and other packages survive", () => {
  seed(); load(OTHER_FILES); card("other", "gone"); load(V2_FILES); card("demo", "card2");
  expect(orphanReport(db).map((group) => group.packageId)).toEqual(["demo", "other"]);
  expect(purgeOrphans(db, { packageId: "demo", includeWriting: false, expected: ORPHANS_AFTER_V2 })).toEqual({ ok: true, purged: { cardState: 2, reviewLog: 2, attempts: 0, lessonProgress: 1, notes: 0, explanations: 0 } });
  const writing = { ...NO_ORPHANS, notes: 1, explanations: 1 };
  expect(countOrphans(db, "demo")).toEqual(writing);
  expect(purgeOrphans(db, { packageId: "demo", includeWriting: true, expected: writing })).toEqual({ ok: true, purged: writing });
  expect(db.prepare("SELECT package_id, item_id, direction FROM card_state ORDER BY package_id").all()).toEqual([
    { package_id: "demo", item_id: "card2", direction: "front" }, { package_id: "other", item_id: "gone", direction: "front" },
  ]);
  expect(db.prepare("SELECT body FROM notes ORDER BY body").all()).toEqual([{ body: "package note" }, { body: "standalone" }]);
  expect(db.prepare("SELECT COUNT(*) n FROM attempts").get()).toEqual({ n: 1 });
  expect(orphanReport(db)).toEqual([{ packageId: "other", packageTitle: "Other", inLibrary: true, counts: { ...NO_ORPHANS, cardState: 1 } }]);
});

it("rolls back earlier deletes if a later purge statement fails", () => {
  seed(); load(V2_FILES);
  db.exec("CREATE TRIGGER reject_purge BEFORE DELETE ON review_log BEGIN SELECT RAISE(ABORT, 'cannot delete review'); END");
  expect(() => purgeOrphans(db, { packageId: "demo", includeWriting: true, expected: ORPHANS_AFTER_V2 })).toThrow("cannot delete review");
  expect(total()).toBe(10); expect(countOrphans(db, "demo")).toEqual(ORPHANS_AFTER_V2);
});

it("the attempts history filters through LIVE.attempts", () => {
  const src = readFileSync(new URL("../src/attemptLog.ts", import.meta.url), "utf8");
  expect(src).toMatch(/LIVE\.attempts\(/); expect(src).not.toContain("VISIBLE_ATTEMPT");
});
