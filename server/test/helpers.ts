import AdmZip from "adm-zip";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import type { Db } from "../src/db.js";
import type { Item, OrphanCounts } from "@study/shared";

export const freshDb = () => openDb(mkdtempSync(join(tmpdir(), "study-")));

export function makeZip(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [path, content] of Object.entries(files)) {
    zip.addFile(path, Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"));
  }
  return zip.toBuffer();
}

export const GOOD_FILES: Record<string, string | Buffer> = {
  "manifest.json": JSON.stringify({
    formatVersion: "1.0.0", id: "demo", title: "Demo", version: "1",
  }),
  "lessons/01-intro.md": [
    "---", "id: intro", "title: Intro", "---", "",
    "Hello!", "", '::activity{id="mc1"}', "",
    "![pic](assets/dot.png)", "",
  ].join("\n"),
  "items.json": JSON.stringify([
    { id: "mc1", type: "multiple-choice", prompt: "Pick", options: [
      { id: "a", text: "A", correct: true }, { id: "b", text: "B" } ] },
    { id: "card1", type: "flashcard", front: "hola", back: "hello", reverse: true },
  ]),
  "assets/dot.png": Buffer.from("89504e470d0a1a0a", "hex"), // fake but binary
};

export const V2_FILES: Record<string, string | Buffer> = {
  ...GOOD_FILES,
  "lessons/01-intro.md": GOOD_FILES["lessons/01-intro.md"]!.toString().replace("id: intro", "id: intro2"),
  "items.json": JSON.stringify([
    (JSON.parse(GOOD_FILES["items.json"] as string) as Item[])[0],
    { id: "card2", type: "flashcard", front: "adios", back: "goodbye" },
  ]),
};

export const NO_ORPHANS: OrphanCounts = { cardState: 0, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 };
export const ORPHANS_AFTER_V2: OrphanCounts = { cardState: 2, reviewLog: 2, attempts: 0, lessonProgress: 1, notes: 1, explanations: 1 };
export const ORPHANS_AFTER_DELETE: OrphanCounts = { cardState: 2, reviewLog: 2, attempts: 1, lessonProgress: 1, notes: 2, explanations: 1 };

/**
 * Inserts retained user-state fixtures without changing content.
 * Args:
 *   db: A freshly imported demo package database with Stage 3 tables.
 * Returns:
 *   Nothing.
 * Raises:
 *   Error: A fixture insert violates a constraint or the database is unavailable.
 */
export function seedUserState(db: Db): void {
  const at = "2026-10-01T00:00:00.000Z";
  for (const direction of ["front", "back"]) {
    db.prepare("INSERT INTO card_state VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("demo", "card1", direction, 1, 2.5, 1, 0, at);
    db.prepare("INSERT INTO review_log (package_id, item_id, direction, rating, at) VALUES (?, ?, ?, ?, ?)").run("demo", "card1", direction, "good", at);
  }
  db.prepare("INSERT INTO attempts (package_id, kind, item_id, correct, score, at) VALUES ('demo', 'exercise', 'mc1', 1, 1, ?)").run(at);
  db.prepare("INSERT INTO lesson_progress VALUES ('demo', 'intro', 'in-progress', ?)").run(at);
  for (const [packageId, lessonId, body] of [[null, null, "standalone"], ["demo", null, "package note"], ["demo", "intro", "lesson note"]]) {
    db.prepare("INSERT INTO notes (package_id, lesson_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(packageId, lessonId, body, at, at);
  }
  db.prepare("INSERT INTO explanations (package_id, lesson_id, body, confidence, created_at, updated_at) VALUES ('demo', 'intro', 'my words', 2, ?, ?)").run(at, at);
}

export const PLAY_FILES: Record<string, string | Buffer> = {
  ...GOOD_FILES,
  "items.json": JSON.stringify([
    ...JSON.parse(GOOD_FILES["items.json"] as string), // mc1 (a correct, b), card1 (reverse)
    { id: "ms1", type: "multi-select", prompt: "Pick two", partialCredit: true, tags: ["m"], options: [
      { id: "a", text: "A", correct: true }, { id: "b", text: "B", correct: true },
      { id: "c", text: "C" }, { id: "d", text: "D" }] },
    { id: "fb1", type: "fill-blank", prompt: "Fill", template: "{{1}} and {{2}}",
      blanks: [{ slot: 1, accept: ["salt"] }, { slot: 2, accept: ["pepper"] }] },
    { id: "sa1", type: "short-answer", prompt: "Say yes", accept: ["yes"] },
    { id: "ord1", type: "ordering", prompt: "Order", steps: [
      { id: "s1", text: "One" }, { id: "s2", text: "Two" }, { id: "s3", text: "Three" }] },
    { id: "mat1", type: "matching", prompt: "Match", tags: ["m"], distractors: ["quack"], pairs: [
      { left: "cat", right: "meow" }, { left: "dog", right: "woof" }, { left: "cow", right: "moo" }] },
    { id: "mat2", type: "matching", prompt: "Match more", tags: ["m"], pairs: [
      { left: "sheep", right: "baa" }, { left: "owl", right: "hoot" }] },
  ]),
  "quizzes.json": JSON.stringify([
    { id: "quiz-all", title: "All types", description: "Every checkable type",
      items: ["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"], passThreshold: 0.5, timeLimitSeconds: 60 },
    { id: "quiz-plain", title: "Plain", items: ["mc1"] },
  ]),
  "games.json": JSON.stringify([
    { id: "g-match", template: "matching", title: "Match", source: { tags: ["m"] } },
    { id: "g-small", template: "matching", title: "Small", source: { itemIds: ["mat1"] }, settings: { roundSize: 2 } },
    { id: "g-speed", template: "timed-round", title: "Speed", source: { itemIds: ["mc1", "ms1"] } },
    { id: "g-order", template: "order-it", title: "Order", source: { itemIds: ["ord1"] } },
  ]),
};
