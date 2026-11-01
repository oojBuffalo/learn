import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Explanation } from "@study/shared";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { Db } from "../src/db.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
let dir: string;
const T0 = "2026-10-01T10:00:00.000Z";
const TWO_LESSONS = { ...GOOD_FILES, "lessons/02-more.md": "---\nid: more\ntitle: More\n---\n\nMore.\n" };
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const send = (method: string, path: string, body?: unknown) => app.request(path, { method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const explain = async (lessonId: string, confidence: number) => {
  const res = await send("POST", "/api/explanations", { packageId: "demo", lessonId, body: "In my words", confidence });
  expect(res.status).toBe(201); return (await res.json()).explanation.id as number;
};
const list = async () => (await (await app.request("/api/explanations")).json()).explanations as Explanation[];
const prompts = async () => {
  const res = await app.request("/api/explanations?revisit=1"); expect(res.status).toBe(200);
  return ((await res.json()).explanations as Explanation[]).map((e) => e.id);
};
const patch = (id: number, body: unknown) => send("PATCH", `/api/explanations/${id}`, body);
const count = () => (db.prepare("SELECT COUNT(*) n FROM explanations").get() as { n: number }).n;
const importGood = () => app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(TWO_LESSONS)) });
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); at(T0);
  dir = mkdtempSync(join(tmpdir(), "study-")); db = openDb(dir); app = createApp(db);
  expect((await importGood()).status).toBe(201);
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); vi.useRealTimers(); });

it("creates an explanation with titles and flags", async () => {
  const id = await explain("intro", 2);
  expect(await (await app.request(`/api/explanations/${id}`)).json()).toEqual({ explanation: {
    id: 1, packageId: "demo", lessonId: "intro", packageTitle: "Demo", lessonTitle: "Intro", body: "In my words",
    confidence: 2, revisit: true, orphaned: false, createdAt: T0, updatedAt: T0,
  } });
});
it("refuses a lesson that isn't in the library and writes nothing", async () => {
  for (const [packageId, lessonId] of [["demo", "nope"], ["nope", "intro"]]) {
    const res = await send("POST", "/api/explanations", { packageId, lessonId, body: "Mine", confidence: 2 });
    expect(res.status).toBe(404); expect((await res.json()).error).toEqual({ code: "not_found", message: "unknown lesson" });
  }
  expect(count()).toBe(0);
});
it("rejects invalid bodies", async () => {
  const ok = { packageId: "demo", lessonId: "intro", body: "Mine", confidence: 2 };
  for (const body of ["{", null, { ...ok, confidence: 6 }, { ...ok, confidence: 2.5 }, { ...ok, confidence: "3" },
    { packageId: "demo", lessonId: "intro", body: "Mine" }, { ...ok, body: " " }, { ...ok, extra: 1 },
    { ...ok, body: "x".repeat(100_001) }]) {
    const res = await send("POST", "/api/explanations", body); expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual({ code: "invalid_request",
      message: body === "{" ? "request body must be valid JSON" : "request body is not a valid explanation" });
  }
  expect(count()).toBe(0);
});
it("lists newest first with revisit and orphaned flags", async () => {
  const a = await explain("intro", 2); const b = await explain("more", 4);
  expect((await list()).map((e) => [e.id, e.revisit, e.orphaned])).toEqual([[b, false, false], [a, true, false]]);
});
it("a 2 prompts and a 3 does not", async () => {
  const a = await explain("intro", 2); await explain("more", 3); expect(await prompts()).toEqual([a]);
});
it("a newer explanation rated 3 or more clears the prompt", async () => {
  await explain("intro", 2); at("2026-09-01T10:00:00.000Z"); await explain("intro", 4);
  expect(await prompts()).toEqual([]);
});
it("raising the latest rating to 3 clears it", async () => {
  const a = await explain("intro", 1); expect((await patch(a, { confidence: 3 })).status).toBe(200);
  expect(await prompts()).toEqual([]);
});
it("a newer low explanation moves the prompt to it", async () => {
  const a = await explain("intro", 2); const b = await explain("intro", 1);
  expect(await prompts()).toEqual([b]); expect((await list()).find((e) => e.id === a)?.revisit).toBe(false);
});
it("re-rating an older row or editing only the body changes nothing", async () => {
  const a = await explain("intro", 1); const b = await explain("intro", 2);
  expect((await patch(a, { confidence: 5 })).status).toBe(200);
  expect((await patch(b, { body: "Reworded" })).status).toBe(200);
  expect(await prompts()).toEqual([b]);
  const x = await explain("more", 2); await explain("more", 4);
  expect((await patch(x, { confidence: 1 })).status).toBe(200); expect(await prompts()).toEqual([b]);
});
it("orders prompts by confidence, then id", async () => {
  const a = await explain("intro", 2); const b = await explain("more", 1); expect(await prompts()).toEqual([b, a]);
  await patch(b, { confidence: 2 }); expect(await prompts()).toEqual([a, b]);
});
it("a removed lesson hides its prompt but keeps the row; re-import restores it", async () => {
  const a = await explain("intro", 2); await app.request("/api/packages/demo", { method: "DELETE" });
  expect(await prompts()).toEqual([]);
  const res = await app.request(`/api/explanations/${a}`); expect(res.status).toBe(200);
  expect((await res.json()).explanation).toMatchObject({ orphaned: true, revisit: false, packageTitle: null, lessonTitle: null });
  expect((await patch(a, { body: "Kept" })).status).toBe(200);
  await importGood(); expect(await prompts()).toEqual([a]);
});
it("PATCH keeps id and createdAt, bumps updatedAt, and refuses anything else", async () => {
  const a = await explain("intro", 2); at("2026-10-01T10:05:00.000Z");
  const res = await patch(a, { confidence: 3 }); expect(res.status).toBe(200);
  expect((await res.json()).explanation).toMatchObject({ id: a, confidence: 3, createdAt: T0, updatedAt: "2026-10-01T10:05:00.000Z" });
  for (const body of [{}, { lessonId: "more", confidence: 3 }, null, { body: " " }]) {
    const bad = await patch(a, body); expect(bad.status).toBe(400);
    expect((await bad.json()).error).toEqual({ code: "invalid_request", message: "request body is not a valid explanation update" });
  }
  const absent = await patch(999, { confidence: 3 }); expect(absent.status).toBe(404);
  expect((await absent.json()).error.message).toBe("unknown explanation");
});
it("reads by id, rejects other revisit values, and has no DELETE", async () => {
  for (const id of ["999", "9999999999999999999999999999999999999999"]) {
    const res = await app.request(`/api/explanations/${id}`); expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe("unknown explanation");
  }
  for (const id of ["abc", "0", "01", "-1", "1.0"]) {
    const res = await app.request(`/api/explanations/${id}`); expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({ code: "not_found", message: "no such route or resource" });
  }
  for (const query of ["?revisit=true", "?revisit=0", "?other=1", "?revisit=1&other=1", "?revisit=1&revisit=true"]) {
    const res = await app.request(`/api/explanations${query}`); expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual({ code: "invalid_request", message: "revisit must be 1" });
  }
  const a = await explain("intro", 2); const res = await send("DELETE", `/api/explanations/${a}`);
  expect(res.status).toBe(404); expect((await res.json()).error.code).toBe("not_found"); expect(count()).toBe(1);
});
