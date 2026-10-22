import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.PORT) || 4321;

export default defineConfig({
  testDir: ".",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: "npm start -w server",
    cwd: "..",
    port,
    reuseExistingServer: false,
    env: { STUDY_DATA_DIR: mkdtempSync(join(tmpdir(), "study-e2e-")), PORT: String(port) },
  },
});
