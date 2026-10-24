import { rmSync } from "node:fs";

/**
 * Removes the temp data directory that `playwright.config.ts` created for this run.
 *
 * This may run while the webServer still has the SQLite file open. That is safe:
 * unlinking an open file is safe on POSIX (darwin is the target).
 */
export default function globalTeardown(): void {
  const dir = process.env.STUDY_E2E_DATA_DIR;
  if (dir) rmSync(dir, { recursive: true, force: true });
}
