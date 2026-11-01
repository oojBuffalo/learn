import { afterEach, beforeEach, expect, it } from "vitest";
import type { PurgeOrphansRequest } from "@study/shared";
import { createApp } from "../src/app.js";
import type { Db } from "../src/db.js";
import { importPackage } from "../src/importer.js";
import { ORPHAN_TABLE } from "../src/orphans.js";
import { freshDb, makeZip, GOOD_FILES, V2_FILES, seedUserState, NO_ORPHANS, ORPHANS_AFTER_V2, ORPHANS_AFTER_DELETE } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = freshDb(); app = createApp(db);
  expect(importPackage(db, makeZip(GOOD_FILES))).toMatchObject({ ok: true }); seedUserState(db);
});
afterEach(() => db.close());
const groups = async () => (await (await app.request("/api/maintenance/orphans")).json()).packages;
const purge = (body: unknown) => app.request("/api/maintenance/orphans/purge", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const total = () => Object.values(ORPHAN_TABLE).reduce((sum, table) => sum + (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n, 0);

it("reports nothing while everything is live", async () => {
  const response = await app.request("/api/maintenance/orphans"); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ packages: [] });
});
it("a deleted package is one group outside the library", async () => {
  await app.request("/api/packages/demo", { method: "DELETE" });
  expect(await groups()).toEqual([{ packageId: "demo", packageTitle: null, inLibrary: false, counts: ORPHANS_AFTER_DELETE }]);
});
it("a re-import that drops content keeps the title", async () => {
  expect(importPackage(db, makeZip(V2_FILES))).toMatchObject({ ok: true });
  expect(await groups()).toEqual([{ packageId: "demo", packageTitle: "Demo", inLibrary: true, counts: ORPHANS_AFTER_V2 }]);
});
it("purges progress, and writing only when asked", async () => {
  importPackage(db, makeZip(V2_FILES));
  const response = await purge({ packageId: "demo", includeWriting: false, expected: ORPHANS_AFTER_V2 });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ purged: { cardState: 2, reviewLog: 2, attempts: 0, lessonProgress: 1, notes: 0, explanations: 0 } });
  const writing = { ...NO_ORPHANS, notes: 1, explanations: 1 };
  expect((await groups())[0].counts).toEqual(writing);
  const all = await purge({ packageId: "demo", includeWriting: true, expected: writing });
  expect(all.status).toBe(200); expect(await all.json()).toEqual({ purged: writing });
  expect(await groups()).toEqual([]);
  expect(db.prepare("SELECT COUNT(*) n FROM notes").get()).toEqual({ n: 2 });
});
it("a change between preview and purge is a 409 that deletes nothing", async () => {
  importPackage(db, makeZip(V2_FILES));
  db.prepare("INSERT INTO card_state VALUES ('demo', 'gone', 'front', 1, 2.5, 1, 0, 't')").run();
  const before = total();
  const response = await purge({ packageId: "demo", includeWriting: true, expected: ORPHANS_AFTER_V2 });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: { code: "orphans_changed", message: "leftover progress changed since it was counted; review it and confirm again" } });
  expect(total()).toBe(before);
});
it("an unknown package with zero counts is a no-op", async () => {
  const response = await purge({ packageId: "nope", includeWriting: true, expected: NO_ORPHANS });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ purged: NO_ORPHANS });
});
it("rejects bad purge bodies", async () => {
  const valid: PurgeOrphansRequest = { packageId: "demo", includeWriting: false, expected: NO_ORPHANS };
  const before = total();
  const malformed = await purge("{"); expect(malformed.status).toBe(400);
  expect(await malformed.json()).toEqual({ error: { code: "invalid_request", message: "request body must be valid JSON" } });
  for (const body of [null, { ...valid, extra: 1 }, { ...valid, expected: { ...NO_ORPHANS, cardState: -1 } }, { packageId: "demo", includeWriting: false }]) {
    const response = await purge(body); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "invalid_request", message: "request body is not a valid purge request" } });
  }
  expect(total()).toBe(before);
});
