import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { backupDb } from "../src/backup.js";
import { DEFAULT_DATA_DIR, openDb, resolveDefaultDataDir } from "../src/db.js";

describe("openDb", () => {
  it("uses the repository data directory regardless of npm workspace cwd", () => {
    expect(DEFAULT_DATA_DIR).toBe(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data"));
  });

  it("keeps using a legacy workspace database when no repository database exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "study-"));
    const preferred = join(dir, "preferred");
    const legacy = join(dir, "legacy");
    mkdirSync(legacy);
    writeFileSync(join(legacy, "study.db"), "legacy");

    expect(resolveDefaultDataDir(preferred, legacy)).toBe(legacy);
    mkdirSync(preferred);
    writeFileSync(join(preferred, "study.db"), "preferred");
    expect(resolveDefaultDataDir(preferred, legacy)).toBe(preferred);
  });

  it("creates the schema idempotently with WAL on", () => {
    const dir = mkdtempSync(join(tmpdir(), "study-"));
    const db = openDb(dir);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    for (const t of ["packages", "lessons", "items", "quizzes", "games", "assets",
                     "card_state", "review_log", "attempts", "lesson_progress"]) {
      expect(tables).toContain(t);
    }
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.close();
    openDb(dir).close(); // second open on same dir must not throw
  });

  it("creates a complete backup while the WAL database remains open", async () => {
    const dir = mkdtempSync(join(tmpdir(), "study-"));
    const db = openDb(join(dir, "live"));
    db.prepare("INSERT INTO packages (id, manifest, imported_at) VALUES (?, ?, ?)")
      .run("demo", JSON.stringify({ id: "demo" }), "2026-08-06T00:00:00.000Z");

    const destination = join(dir, "backups", "study.db");
    await backupDb(db, destination);

    const backup = new Database(destination, { readonly: true });
    expect(backup.prepare("SELECT id FROM packages").all()).toEqual([{ id: "demo" }]);
    backup.close();
    db.close();
  });

  it("migrates legacy content rows to explicit package order", () => {
    const dir = mkdtempSync(join(tmpdir(), "study-"));
    const legacy = new Database(join(dir, "study.db"));
    legacy.exec(`
      CREATE TABLE packages (id TEXT PRIMARY KEY, manifest TEXT NOT NULL, imported_at TEXT NOT NULL);
      CREATE TABLE items (
        package_id TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (package_id, id)
      );
      INSERT INTO packages VALUES ('demo', '{}', '2026-08-06T00:00:00.000Z');
      INSERT INTO items VALUES ('demo', 'first', 'flashcard', '{}');
      INSERT INTO items VALUES ('demo', 'second', 'flashcard', '{}');
    `);
    legacy.close();

    const migrated = openDb(dir);
    expect(migrated.prepare("SELECT id, ord FROM items ORDER BY ord").all()).toEqual([
      { id: "first", ord: 0 },
      { id: "second", ord: 1 },
    ]);
    migrated.close();
  });
});
