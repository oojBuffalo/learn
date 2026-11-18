import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { createApp } from "../../server/src/app.js";
import { freshDb, makeZip, GOOD_FILES } from "../../server/test/helpers.js";

const listening = (s: ReturnType<typeof serve>) =>
  new Promise<number>((ok) => s.on("listening", () => ok((s.address() as AddressInfo).port)));

it("a POST through the Vite dev proxy is same-origin for the browser's Origin, 403 for a foreign one", async () => {
  const api = serve({ fetch: createApp(freshDb()).fetch, hostname: "127.0.0.1", port: 0 });
  const apiPort = await listening(api);
  const prevPort = process.env.PORT;
  process.env.PORT = String(apiPort); // vite.config.ts reads it for the proxy target
  const vite = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    root: fileURLToPath(new URL("..", import.meta.url)),
    logLevel: "silent",
    server: { port: 0, host: "127.0.0.1" },
  });
  try {
    await vite.listen();
    const base = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`;
    const post = (origin: string) =>
      fetch(`${base}/api/packages/import`, {
        method: "POST",
        headers: { origin, "content-type": "text/plain" },
        body: new Uint8Array(makeZip(GOOD_FILES)),
      });
    expect((await post(base)).status).toBe(201);
    const bad = await post("https://evil.example");
    expect(bad.status).toBe(403);
    expect((await bad.json()).error.code).toBe("forbidden");
  } finally {
    process.env.PORT = prevPort;
    if (prevPort === undefined) delete process.env.PORT;
    await vite.close();
    await new Promise((ok) => api.close(ok));
  }
});
