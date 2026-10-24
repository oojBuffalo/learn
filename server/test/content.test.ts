import { afterEach, beforeEach, expect, it } from "vitest";
import { getItem, getPackageItems, getQuiz, getGame, listQuizzes, listGames } from "../src/content.js";
import type { Db } from "../src/db.js";
import { importPackage } from "../src/importer.js";
import { freshDb, makeZip, PLAY_FILES } from "./helpers.js";

let db: Db;
beforeEach(() => {
  db = freshDb();
  expect(importPackage(db, makeZip(PLAY_FILES))).toEqual({ ok: true, packageId: "demo" });
});
afterEach(() => db?.close());
const ids = (items: { id: string }[]) => items.map((item) => item.id);

it("reads an item or null for unknown content", () => {
  expect(getItem(db, "demo", "ms1")).toMatchObject({ type: "multi-select", partialCredit: true });
  expect(getItem(db, "demo", "missing")).toBeNull();
  expect(getItem(db, "missing", "mc1")).toBeNull();
});

it("reads items in content order with optional type filtering", () => {
  expect(ids(getPackageItems(db, "demo"))).toEqual(["mc1", "card1", "ms1", "fb1", "sa1", "ord1", "mat1", "mat2"]);
  expect(ids(getPackageItems(db, "demo", ["matching", "ordering"]))).toEqual(["ord1", "mat1", "mat2"]);
  expect(getPackageItems(db, "demo", [])).toEqual([]);
  db.transaction(() => {
    db.prepare("UPDATE items SET ord = ord + 100 WHERE package_id = 'demo'").run();
    db.prepare("UPDATE items SET ord = CASE id WHEN 'mat2' THEN 0 ELSE ord - 99 END WHERE package_id = 'demo'").run();
  })();
  expect(ids(getPackageItems(db, "demo"))[0]).toBe("mat2");
});

it("reads quiz items in quiz order and omits missing stored items", () => {
  const found = getQuiz(db, "demo", "quiz-all")!;
  expect(found.quiz.passThreshold).toBe(0.5);
  expect([...found.items.keys()]).toEqual(["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"]);
  db.prepare("DELETE FROM items WHERE id = 'mc1'").run();
  expect(getQuiz(db, "demo", "quiz-all")!.items.has("mc1")).toBe(false);
  expect(getQuiz(db, "demo", "missing")).toBeNull();
});

it("resolves compatible game items and authored settings", () => {
  expect(ids(getGame(db, "demo", "g-match")!.pool)).toEqual(["mat1", "mat2"]);
  expect(ids(getGame(db, "demo", "g-speed")!.pool)).toEqual(["mc1", "ms1"]);
  expect(getGame(db, "demo", "g-small")!.game.settings).toEqual({ roundSize: 2 });
  expect(getGame(db, "demo", "missing")).toBeNull();
});

it("keeps game source order while dropping duplicate and incompatible ids", () => {
  const games = [...JSON.parse(PLAY_FILES["games.json"] as string), {
    id: "g-mixed", template: "timed-round", title: "Mixed",
    source: { itemIds: ["ms1", "card1", "ms1", "mc1"] },
  }];
  expect(importPackage(db, makeZip({ ...PLAY_FILES, "games.json": JSON.stringify(games) })).ok).toBe(true);
  expect(ids(getGame(db, "demo", "g-mixed")!.pool)).toEqual(["ms1", "mc1"]);
});

it("lists quizzes and games in authored order", () => {
  expect(ids(listQuizzes(db, "demo"))).toEqual(["quiz-all", "quiz-plain"]);
  expect(ids(listGames(db, "demo"))).toEqual(["g-match", "g-small", "g-speed", "g-order"]);
  expect(listQuizzes(db, "missing")).toEqual([]);
  expect(listGames(db, "missing")).toEqual([]);
});
