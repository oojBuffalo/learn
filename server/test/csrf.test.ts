import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { freshDb, makeZip, GOOD_FILES } from "./helpers.js";

const app = () => createApp(freshDb());
const post = (headers: Record<string, string>, body: BodyInit = "x") =>
  app().request("/api/packages/import", { method: "POST", headers, body });
const form = () => { const f = new FormData(); f.set("file", new Blob([new Uint8Array(makeZip(GOOD_FILES))]), "p.zip"); return f; };

it("rejects a cross-origin text/plain POST", async () => {
  const res = await post({ origin: "https://evil.example", "content-type": "text/plain" });
  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: { code: "forbidden", message: expect.any(String) } });
});
it("rejects a cross-origin multipart POST", async () => {
  const res = await post({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }, form());
  expect(res.status).toBe(403);
});
const zip = () => new Uint8Array(makeZip(GOOD_FILES));
it("imports a same-origin text/plain POST on Origin alone", async () => {
  const res = await post({ origin: "http://localhost", "content-type": "text/plain" }, zip());
  expect(res.status).toBe(201);
});
it("imports a same-origin POST on Sec-Fetch-Site alone", async () => {
  const res = await post({ "sec-fetch-site": "same-origin", "content-type": "text/plain" }, zip());
  expect(res.status).toBe(201);
});
it("the Vite dev proxy keeps the browser's Host so the Origin check matches", () => {
  const config = readFileSync(new URL("../../web/vite.config.ts", import.meta.url), "utf8");
  expect(config).toMatch(/changeOrigin:\s*false/);
});
