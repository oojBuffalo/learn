import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const playwrightCli = createRequire(import.meta.url).resolve("@playwright/test/cli");

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * Holds a TCP port on localhost so the e2e webServer cannot start.
 *
 * Returns:
 *   The held port number. The listener is closed after the test.
 */
async function occupyPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => server.close());
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("no port");
  return address.port;
}

describe("e2e temp data dir", () => {
  it("leaves no study-e2e-* directory behind when the web server fails to start", async () => {
    const port = await occupyPort();
    // os.tmpdir() honours TMPDIR, so the child gets a private parent and the count ignores other runs.
    const parent = mkdtempSync(join(tmpdir(), "e2e-tmp-parent-"));
    cleanups.push(() => rmSync(parent, { recursive: true, force: true }));

    // Plugin setup (the webServer) runs before globalTeardown is registered, so a failed start skips it.
    const { STUDY_E2E_DATA_DIR: _inherited, ...env } = process.env;
    const run = spawnSync(process.execPath, [playwrightCli, "test", "-c", "e2e"], {
      cwd: root,
      env: { ...env, TMPDIR: parent, PORT: String(port) },
      encoding: "utf8",
    });

    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/already used/);
    expect(readdirSync(parent).filter((name) => name.startsWith("study-e2e-"))).toEqual([]);
  }, 60_000);
});
