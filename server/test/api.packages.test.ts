import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { GOOD_FILES, PLAY_FILES, V2_FILES, makeZip } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDb(mkdtempSync(join(tmpdir(), "study-")));
  app = createApp(db);
});

const importGood = () =>
  app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(GOOD_FILES)) });

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
    const res = await app.request("/api/packages/demo/assets/dot.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves a nested asset by its full path, without aliasing a shorter one", async () => {
    const files = {
      ...GOOD_FILES,
      "lessons/01-intro.md": GOOD_FILES["lessons/01-intro.md"]!.toString() + "\n![nested](assets/assets/dot.png)\n",
      "assets/assets/dot.png": Buffer.from("nested"),
    };
    await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(files)) });
    const nested = await app.request("/api/packages/demo/assets/assets/dot.png");
    expect(nested.status).toBe(200);
    expect(Buffer.from(await nested.arrayBuffer()).toString()).toBe("nested");
    const top = await app.request("/api/packages/demo/assets/dot.png");
    expect(Buffer.from(await top.arrayBuffer())).toEqual(GOOD_FILES["assets/dot.png"]);
  });

  it("picks the MIME type whatever the extension's case", async () => {
    const files = {
      ...GOOD_FILES,
      "items.json": JSON.stringify([
        ...JSON.parse(GOOD_FILES["items.json"] as string),
        { id: "m1", type: "short-answer", prompt: "?", accept: ["y"], media: [{ src: "assets/diagram.SVG" }] },
      ]),
      "assets/diagram.SVG": Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    };
    await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(files)) });
    const res = await app.request("/api/packages/demo/assets/diagram.SVG");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("serves assets whose names hold URL-reserved characters at their encoded URL", async () => {
    const files = {
      ...GOOD_FILES,
      "items.json": JSON.stringify([
        ...JSON.parse(GOOD_FILES["items.json"] as string),
        { id: "m1", type: "short-answer", prompt: "?", accept: ["y"],
          media: [{ src: "assets/a#b.png" }, { src: "assets/a%20b.png" }] },
      ]),
      "assets/a#b.png": Buffer.from("hash"),
      "assets/a%20b.png": Buffer.from("percent"),
    };
    await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(files)) });
    const hash = await app.request("/api/packages/demo/assets/a%23b.png");
    expect(await hash.text()).toBe("hash");
    const percent = await app.request("/api/packages/demo/assets/a%2520b.png");
    expect(await percent.text()).toBe("percent");
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

describe("package summaries", () => {
  const firstPackage = async () => (await (await app.request("/api/packages")).json()).packages[0];
  const importPlay = () => app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(PLAY_FILES)) });

  it("lists quizzes and games in package order with their settings", async () => {
    await importPlay();
    const pkg = await firstPackage();
    expect(pkg.quizzes).toEqual([
      { id: "quiz-all", title: "All types", description: "Every checkable type", itemCount: 6,
        timeLimitSeconds: 60, passThreshold: 0.5, runs: 0, best: null },
      { id: "quiz-plain", title: "Plain", itemCount: 1, timeLimitSeconds: null, passThreshold: null, runs: 0, best: null },
    ]);
    expect(pkg.games).toEqual([
      { id: "g-match", title: "Match", template: "matching", timeLimitSeconds: null, runs: 0, best: null },
      { id: "g-small", title: "Small", template: "matching", timeLimitSeconds: null, runs: 0, best: null },
      { id: "g-speed", title: "Speed", template: "timed-round", timeLimitSeconds: 60, runs: 0, best: null },
      { id: "g-order", title: "Order", template: "order-it", timeLimitSeconds: null, runs: 0, best: null },
    ]);
  });
  it("counts runs and keeps the best score per quiz and game", async () => {
    await importPlay();
    const run = db.prepare("INSERT INTO attempts (package_id, kind, ref_id, item_id, answer, correct, score, at) " +
      "VALUES (?, ?, ?, NULL, '{}', NULL, ?, '2026-10-22T00:00:00.000Z')");
    run.run("demo", "quiz", "quiz-all", 0.5);
    run.run("demo", "quiz", "quiz-all", 1);
    run.run("demo", "game", "g-small", 0.75);
    run.run("demo", "quiz", "quiz-gone", 1);   // orphan: never listed
    run.run("other", "quiz", "quiz-plain", 1); // another package
    const pkg = await firstPackage();
    expect(pkg.quizzes.map((q: any) => [q.id, q.runs, q.best])).toEqual([["quiz-all", 2, 1], ["quiz-plain", 0, null]]);
    expect(pkg.games.map((g: any) => [g.id, g.runs, g.best]))
      .toEqual([["g-match", 0, null], ["g-small", 1, 0.75], ["g-speed", 0, null], ["g-order", 0, null]]);
  });
  it("gives a package without quizzes or games empty arrays", async () => {
    await importGood();
    expect(await firstPackage()).toMatchObject({ quizzes: [], games: [] });
  });
});


it("started lessons carry updatedAt; not-started lessons don't", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    await importGood();
    const lesson = async () => (await (await app.request("/api/packages")).json()).packages[0].lessons[0];
    const progress = (status: string) => app.request("/api/lessons/demo/intro/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    expect("updatedAt" in (await lesson())).toBe(false);
    vi.setSystemTime(new Date("2026-10-01T09:00:00.000Z")); await progress("in-progress");
    expect(await lesson()).toMatchObject({ id: "intro", status: "in-progress", updatedAt: "2026-10-01T09:00:00.000Z" });
    vi.setSystemTime(new Date("2026-10-01T10:00:00.000Z")); await progress("in-progress");
    expect((await lesson()).updatedAt).toBe("2026-10-01T10:00:00.000Z");
    vi.setSystemTime(new Date("2026-10-01T11:00:00.000Z")); await progress("completed");
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z")); await progress("in-progress");
    expect(await lesson()).toMatchObject({ status: "completed", updatedAt: "2026-10-01T11:00:00.000Z" });
  } finally { vi.useRealTimers(); }
});
it("progress on a lesson a re-import dropped never appears", async () => {
  await importGood();
  await app.request("/api/lessons/demo/intro/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "in-progress" }) });
  expect((await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(V2_FILES)) })).status).toBe(201);
  const lessons = (await (await app.request("/api/packages")).json()).packages[0].lessons;
  expect(lessons).toHaveLength(1); expect(lessons[0]).toMatchObject({ id: "intro2", status: "not-started" });
  expect("updatedAt" in lessons[0]).toBe(false);
  expect(db.prepare("SELECT COUNT(*) n FROM lesson_progress").get()).toEqual({ n: 1 });
});
