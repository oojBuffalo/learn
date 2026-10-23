import { defineConfig } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.PORT) || 4321;
// Only the runner finds this unset. Workers inherit the runner's value, so they never own the dir.
const ownsDataDir = process.env.STUDY_E2E_DATA_DIR === undefined;
// Workers re-evaluate this file. They inherit the runner's env, so ??= makes every load share the runner's dir.
const dataDir = (process.env.STUDY_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), "study-e2e-")));
// The webServer starts before globalTeardown is registered, so a failed start skips globalTeardown.
// The runner's exit hook then removes the dir. After a normal run it is a no-op (force: true).
if (ownsDataDir) process.on("exit", () => rmSync(dataDir, { recursive: true, force: true }));

export default defineConfig({
  testDir: ".",
  workers: 1,
  globalTeardown: "./global-teardown.ts",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: "npm start -w server",
    cwd: "..",
    port,
    reuseExistingServer: false,
    env: { STUDY_DATA_DIR: dataDir, PORT: String(port) },
  },
});
