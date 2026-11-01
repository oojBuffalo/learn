import AdmZip from "adm-zip";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

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
