import { freshDb } from "./helpers.js";
import { getGame, getItem, listGames, listQuizzes } from "../src/content.js";
import { loadSamplePackage } from "../src/index.js";
import { roundSizeFor } from "@study/shared";
import type { MsItem } from "@study/shared";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { seedSampleIfEmpty } from "../src/index.js";

describe("seedSampleIfEmpty", () => {
  it("imports the bundled sample exactly once", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "study-")));
    seedSampleIfEmpty(db);
    expect(db.prepare("SELECT id FROM packages").get()).toMatchObject({ id: "learning-how-to-learn" });
    const before = db.prepare("SELECT COUNT(*) n FROM items").get();
    seedSampleIfEmpty(db); // idempotent — DB not empty now
    expect(db.prepare("SELECT COUNT(*) n FROM items").get()).toEqual(before);
  });
});

const SAMPLE = "learning-how-to-learn";
it("still validates the bundled sample", () => {
  expect(() => loadSamplePackage()).not.toThrow();
});
it("ships one quiz, three games and three flashcards", () => {
  const db = freshDb();
  seedSampleIfEmpty(db);
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  expect(ids(listQuizzes(db, SAMPLE))).toEqual(["quiz-basics"]);
  expect(listGames(db, SAMPLE).map((g) => [g.id, g.template]))
    .toEqual([["game-match", "matching"], ["game-speed", "timed-round"], ["game-order", "order-it"]]);
  expect(ids(getGame(db, SAMPLE, "game-speed")!.pool)).toEqual(["mc-forgetting", "ms-techniques"]);
  expect(ids(getGame(db, SAMPLE, "game-order")!.pool)).toEqual(["ord-study-loop"]);
  expect(ids(getGame(db, SAMPLE, "game-match")!.pool)).toEqual(["match-terms"]);
  const dealt = ["game-speed", "game-match"].map((id) => { const g = getGame(db, SAMPLE, id)!; return roundSizeFor(g.game, g.pool); });
  expect(dealt).toEqual([2, 3]);                                  // every question, every pair
  const ms = getItem(db, SAMPLE, "ms-techniques") as MsItem;
  expect(ms).toMatchObject({ type: "multi-select", partialCredit: true, tags: ["memory"] });
  expect(ms.options.filter((o) => o.correct).map((o) => o.id)).toEqual(["a", "c"]);
  expect(db.prepare("SELECT COUNT(*) n FROM items WHERE type = 'flashcard'").get()).toEqual({ n: 3 });
});
