import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import type { Db } from "../src/db.js";
import { freshDb, tempDir } from "./helpers.js";

it("closes the db and removes both dirs once the test finishes", () => {
  let db: Db | undefined;
  let dbDir = "";
  let plainDir = "";
  // onTestFinished hooks run in reverse order, so this one runs after the helpers' cleanup.
  onTestFinished(() => {
    expect(db?.open).toBe(false);
    expect(existsSync(dbDir)).toBe(false);
    expect(existsSync(plainDir)).toBe(false);
  });
  db = freshDb();
  dbDir = dirname(db.name);
  plainDir = tempDir("pkg-");
  expect(db.open).toBe(true);
  expect(readdirSync(plainDir)).toEqual([]);
});

it("server tests make temp dirs only through freshDb or tempDir", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const skip = new Set(["helpers.ts", basename(fileURLToPath(import.meta.url))]);
  const direct = readdirSync(here)
    .filter((file) => file.endsWith(".ts") && !skip.has(file))
    .filter((file) => /\b(mkdtempSync|tmpdir)\(/.test(readFileSync(`${here}/${file}`, "utf8")));
  expect(direct).toEqual([]);
});
