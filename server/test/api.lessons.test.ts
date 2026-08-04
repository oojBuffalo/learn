import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  db = openDb(mkdtempSync(join(tmpdir(), "study-")));
  app = createApp(db);
  await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(GOOD_FILES)) });
});

describe("lesson routes", () => {
  it("returns lesson body, referenced items, and progress", async () => {
    const res = await app.request("/api/lessons/demo/intro");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lesson.title).toBe("Intro");
    expect(body.items.mc1.type).toBe("multiple-choice");
    expect(body.progress).toBe("not-started");
  });

  it("upserts progress", async () => {
    const post = await app.request("/api/lessons/demo/intro/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(post.status).toBe(200);
    const body = await (await app.request("/api/lessons/demo/intro")).json();
    expect(body.progress).toBe("completed");
  });

  it("404s unknown lessons", async () => {
    expect((await app.request("/api/lessons/demo/ghost")).status).toBe(404);
  });
});

describe("attempts", () => {
  it("checks an exercise answer server-side and logs it", async () => {
    const res = await app.request("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "demo", itemId: "mc1", answer: { type: "multiple-choice", optionId: "a" } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correct: true, score: 1 });
    expect(db.prepare("SELECT kind, correct FROM attempts").get()).toMatchObject({ kind: "exercise", correct: 1 });
  });

  it("422s a flashcard answer", async () => {
    const res = await app.request("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "demo", itemId: "card1", answer: { type: "short-answer", text: "x" } }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("not_checkable");
  });
});
