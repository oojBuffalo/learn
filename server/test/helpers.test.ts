import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Db } from "../src/db.js";
import { freshDb, tempDir } from "./helpers.js";

describe("temp dir cleanup", () => {
  let db: Db;
  let dbDir = "";
  let plainDir = "";

  it("hands out a usable db and an empty dir", () => {
    db = freshDb();
    dbDir = dirname(db.name);
    plainDir = tempDir("pkg-");
    expect(db.open).toBe(true);
    expect(readdirSync(plainDir)).toEqual([]);
  });

  it("closes the db and removes both dirs once that test finishes", () => {
    expect(db.open).toBe(false);
    expect(existsSync(dbDir)).toBe(false);
    expect(existsSync(plainDir)).toBe(false);
  });
});

it("server tests make temp dirs only through freshDb or tempDir", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const skip = new Set(["helpers.ts", basename(fileURLToPath(import.meta.url))]);
  const direct = readdirSync(here)
    .filter((file) => file.endsWith(".ts") && !skip.has(file))
    .filter((file) => /\b(mkdtempSync|tmpdir)\(/.test(readFileSync(`${here}/${file}`, "utf8")));
  expect(direct).toEqual([]);
});
