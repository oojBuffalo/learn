import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDb(mkdtempSync(join(tmpdir(), "study-")));
  app = createApp(db);
});

const importGood = () =>
  app.request("/api/packages/import", { method: "POST", body: makeZip(GOOD_FILES) });

describe("package routes", () => {
  it("imports and lists", async () => {
    expect((await importGood()).status).toBe(201);
    const res = await app.request("/api/packages");
    const body = await res.json();
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0]).toMatchObject({
      id: "demo", title: "Demo", lessonCount: 1,
      lessons: [{ id: "intro", title: "Intro", status: "not-started" }],
    });
  });

  it("rejects an invalid zip with 422 and error details", async () => {
    const res = await app.request("/api/packages/import", { method: "POST", body: Buffer.from("junk") });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_package");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("exports a zip and 404s unknown ids", async () => {
    await importGood();
    const res = await app.request("/api/packages/demo/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect((await app.request("/api/packages/nope/export")).status).toBe(404);
  });

  it("serves assets with mime type", async () => {
    await importGood();
    const res = await app.request("/api/packages/demo/assets/assets/dot.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("deletes content but keeps user state", async () => {
    await importGood();
    db.prepare(
      "INSERT INTO card_state (package_id,item_id,direction,interval_days,ease,reps,lapses,due_at) VALUES ('demo','card1','front',1,2.5,1,0,'2026-01-01T00:00:00.000Z')",
    ).run();
    expect((await app.request("/api/packages/demo", { method: "DELETE" })).status).toBe(204);
    expect(db.prepare("SELECT COUNT(*) n FROM lessons").get()).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) n FROM card_state").get()).toMatchObject({ n: 1 });
  });
});
