import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";

describe("openDb", () => {
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
});
