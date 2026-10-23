import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.PORT) || 4321;
// Workers re-evaluate this file. They inherit the runner's env, so ??= makes every load share the runner's dir.
const dataDir = (process.env.STUDY_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), "study-e2e-")));

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
