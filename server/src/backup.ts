import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, type Db } from "./db.js";

export async function backupDb(db: Db, destination: string): Promise<void> {
  const target = resolve(destination);
  if (target === resolve(db.name)) throw new Error("backup destination must differ from the live database");
  mkdirSync(dirname(target), { recursive: true });
  await db.backup(target);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const requestedDestination = process.argv[2];
  if (!requestedDestination) {
    console.error("usage: npm run backup -w server -- <destination.db>");
    process.exitCode = 1;
  } else {
    const destination = resolve(process.env.INIT_CWD ?? process.cwd(), requestedDestination);
    const db = openDb();
    try {
      await backupDb(db, destination);
      console.log(`backup written to ${destination}`);
    } finally {
      db.close();
    }
  }
}
