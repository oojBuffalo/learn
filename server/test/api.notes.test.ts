import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Note } from "@study/shared";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { Db } from "../src/db.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
let dir: string;
const T0 = "2026-10-01T10:00:00.000Z";
const LESSON = { packageId: "demo", lessonId: "intro" };
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const send = (method: string, path: string, body?: unknown) => app.request(path, { method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const create = async (body: string, target: unknown = null) => {
  const res = await send("POST", "/api/notes", { body, target });
  expect(res.status).toBe(201);
  return (await res.json()).note as Note;
};
const count = () => (db.prepare("SELECT COUNT(*) n FROM notes").get() as { n: number }).n;
const importGood = () => app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(GOOD_FILES)) });
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(T0);
  dir = mkdtempSync(join(tmpdir(), "study-"));
  db = openDb(dir);
  app = createApp(db);
  expect((await importGood()).status).toBe(201);
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); vi.useRealTimers(); });

it("creates standalone, package and lesson notes with titles", async () => {
  expect(await create("Area is $a^2$")).toEqual({ id: 1, body: "Area is $a^2$", target: null,
    orphaned: false, createdAt: T0, updatedAt: T0 });
  expect((await create("Package", { packageId: "demo", lessonId: null })).target)
    .toEqual({ packageId: "demo", lessonId: null, packageTitle: "Demo", lessonTitle: null });
  expect((await create("Lesson", LESSON)).target).toEqual({ ...LESSON, packageTitle: "Demo", lessonTitle: "Intro" });
});
it("refuses a missing package or lesson and writes nothing", async () => {
  for (const [target, message] of [
    [{ packageId: "nope", lessonId: null }, "unknown package"],
    [{ packageId: "nope", lessonId: "intro" }, "unknown package"],
    [{ packageId: "demo", lessonId: "nope" }, "unknown lesson"],
  ] as const) {
    const res = await send("POST", "/api/notes", { body: "Mine", target });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({ code: "not_found", message });
  }
  expect(count()).toBe(0);
});
it("rejects malformed and invalid bodies with 400 invalid_request", async () => {
  for (const body of ["{", null, { body: "  ", target: null }, { body: "x".repeat(100_001), target: null },
    { body: "a", target: null, title: "t" }, { body: "a", target: { lessonId: "intro" } }, { body: "a" }]) {
    const res = await send("POST", "/api/notes", body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual({ code: "invalid_request",
      message: body === "{" ? "request body must be valid JSON" : "request body is not a valid note" });
  }
  expect(count()).toBe(0);
});
it("lists the newest change first, and PATCH keeps createdAt", async () => {
  const a = await create("a");
  at("2026-10-01T10:01:00.000Z"); const b = await create("b");
  at("2026-10-01T10:02:00.000Z");
  const res = await send("PATCH", `/api/notes/${a.id}`, { body: "a2" });
  expect(res.status).toBe(200);
  expect((await res.json()).note).toMatchObject({ body: "a2", createdAt: T0, updatedAt: "2026-10-01T10:02:00.000Z" });
  expect(((await (await app.request("/api/notes")).json()).notes as Note[]).map((n) => n.id)).toEqual([a.id, b.id]);
  at("2026-10-01T10:02:00.000Z"); const c = await create("c");
  expect(((await (await app.request("/api/notes")).json()).notes as Note[]).map((n) => n.id)).toEqual([c.id, a.id, b.id]);
});
it("reads one note; unknown and malformed ids are 404", async () => {
  const note = await create("Mine");
  expect(await (await app.request(`/api/notes/${note.id}`)).json()).toEqual({ note });
  for (const id of ["999", "9999999999999999999999999999999999999999"]) {
    const res = await app.request(`/api/notes/${id}`); expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({ code: "not_found", message: "unknown note" });
  }
  for (const id of ["abc", "0", "01", "-1", "1.0"]) {
    const res = await app.request(`/api/notes/${id}`); expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({ code: "not_found", message: "no such route or resource" });
  }
});
it("PATCH detaches with null and refuses a missing target without changing the row", async () => {
  const n = await create("Mine", LESSON);
  const detached = await send("PATCH", `/api/notes/${n.id}`, { target: null });
  expect(detached.status).toBe(200); expect((await detached.json()).note.target).toBeNull();
  const bad = await send("PATCH", `/api/notes/${n.id}`, { body: "Not written", target: { packageId: "demo", lessonId: "nope" } });
  expect(bad.status).toBe(404); expect((await bad.json()).error.message).toBe("unknown lesson");
  expect(db.prepare("SELECT body, package_id, lesson_id FROM notes WHERE id = ?").get(n.id))
    .toEqual({ body: "Mine", package_id: null, lesson_id: null });
  for (const body of [{}, null, "{", { body: "x", extra: 1 }]) {
    const res = await send("PATCH", `/api/notes/${n.id}`, body); expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(body === "{" ? "request body must be valid JSON" : "request body is not a valid note update");
  }
  for (const body of [{ body: "x" }, { target: { packageId: "nope", lessonId: null } }]) {
    const res = await send("PATCH", "/api/notes/999", body); expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe("unknown note");
  }
});
it("a note on removed content is orphaned, still editable and deletable, and re-attaches on re-import", async () => {
  const a = await create("Lesson", LESSON); const b = await create("Package", { packageId: "demo", lessonId: null });
  const c = await create("Standalone");
  await app.request("/api/packages/demo", { method: "DELETE" });
  const notes = (await (await app.request("/api/notes")).json()).notes as Note[];
  expect(notes.map((n) => [n.id, n.orphaned])).toEqual([[c.id, false], [b.id, true], [a.id, true]]);
  const orphan = (await (await app.request(`/api/notes/${a.id}`)).json()).note as Note;
  expect(orphan).toMatchObject({ orphaned: true, target: { ...LESSON, packageTitle: null, lessonTitle: null } });
  expect((await send("PATCH", `/api/notes/${a.id}`, { body: "still mine" })).status).toBe(200);
  expect((await send("PATCH", `/api/notes/${a.id}`, { target: LESSON })).status).toBe(200);
  expect((await send("DELETE", `/api/notes/${b.id}`)).status).toBe(204);
  expect((await app.request(`/api/notes/${b.id}`)).status).toBe(404);
  await importGood();
  expect((await (await app.request(`/api/notes/${a.id}`)).json()).note)
    .toMatchObject({ body: "still mine", orphaned: false, target: { lessonTitle: "Intro" } });
});
it("DELETE removes a note once", async () => {
  const note = await create("Gone");
  expect((await send("DELETE", `/api/notes/${note.id}`)).status).toBe(204);
  expect((await app.request(`/api/notes/${note.id}`)).status).toBe(404);
  const res = await send("DELETE", `/api/notes/${note.id}`);
  expect(res.status).toBe(404); expect((await res.json()).error.message).toBe("unknown note");
});
