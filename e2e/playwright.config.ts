import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: ".",
  use: { baseURL: "http://localhost:4321" },
  webServer: {
    command: "npm start -w server",
    cwd: "..",
    port: 4321,
    reuseExistingServer: false,
    env: { STUDY_DATA_DIR: mkdtempSync(join(tmpdir(), "study-e2e-")) },
  },
});
