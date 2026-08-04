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
