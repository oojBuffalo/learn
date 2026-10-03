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
