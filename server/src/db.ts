import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Db = Database.Database;

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = join(HERE, "..", "..", "data");
const LEGACY_DATA_DIR = join(HERE, "..", "data");

export function resolveDefaultDataDir(
  preferred = DEFAULT_DATA_DIR,
  legacy = LEGACY_DATA_DIR,
): string {
  if (!existsSync(join(preferred, "study.db")) && existsSync(join(legacy, "study.db"))) {
    return legacy;
  }
  return preferred;
}

const ORDERED_CONTENT_TABLES = ["items", "quizzes", "games", "assets"] as const;

function ensureContentOrderColumns(db: Db): void {
  const migrate = db.transaction(() => {
    for (const table of ORDERED_CONTENT_TABLES) {
      const columns = db.pragma(`table_info(${table})`) as { name: string }[];
      if (!columns.some((column) => column.name === "ord")) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ord INTEGER NOT NULL DEFAULT 0`);
        db.exec(`
          UPDATE ${table}
          SET ord = (
            SELECT COUNT(*) - 1
            FROM ${table} AS earlier
            WHERE earlier.package_id = ${table}.package_id
              AND earlier.rowid <= ${table}.rowid
          )
        `);
      }
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_package_ord ON ${table}(package_id, ord)`);
    }
  });
  migrate();
}

export function openDb(dataDir = process.env.STUDY_DATA_DIR ?? resolveDefaultDataDir()): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "study.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(HERE, "schema.sql"), "utf8");
  db.exec(schema);
  ensureContentOrderColumns(db);
  return db;
}
