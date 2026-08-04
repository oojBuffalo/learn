import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Db = Database.Database;

export function openDb(dataDir = process.env.STUDY_DATA_DIR ?? "data"): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "study.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}
