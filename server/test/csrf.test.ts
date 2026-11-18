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
});
it("rejects a cross-origin multipart POST", async () => {
  const res = await post({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }, form());
  expect(res.status).toBe(403);
});
it("lets a same-origin multipart POST through", async () => {
  const res = await post({ origin: "http://localhost", "sec-fetch-site": "same-origin" }, form());
  expect(res.status).not.toBe(403); // the route wants a raw zip, so 422 is fine here
});
it("lets a same-origin text/plain POST through on Origin alone", async () => {
  const res = await post({ origin: "http://localhost", "content-type": "text/plain" });
  expect(res.status).not.toBe(403);
});
