import { serve } from "@hono/node-server";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { expect, it } from "vitest";
import { createApp } from "../../server/src/app.js";
import { freshDb, makeZip, tempDir, GOOD_FILES } from "../../server/test/helpers.js";

it("a POST through the Vite dev proxy is same-origin for the browser's Origin, 403 for a foreign one", async () => {
  const api = serve({ fetch: createApp(freshDb()).fetch, hostname: "127.0.0.1", port: 0 });
  const prevPort = process.env.PORT;
  let vite: ViteDevServer | undefined;
  try {
    await once(api, "listening");
    process.env.PORT = String((api.address() as AddressInfo).port); // vite.config.ts reads it for the proxy target
    vite = await createServer({
      configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      root: fileURLToPath(new URL("..", import.meta.url)),
      logLevel: "silent",
      cacheDir: tempDir(), // not the default, which a running `npm run dev` shares
    });
    // vite.listen() treats port 0 as unset (5173); bind the http server itself so the port is really free.
    vite.httpServer!.listen(0, "127.0.0.1");
    await once(vite.httpServer!, "listening");
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
    try {
      await vite?.close();
    } finally {
      await new Promise((ok) => api.close(ok));
    }
  }
});
