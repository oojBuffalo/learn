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

const grade = (direction: string, rating: string) =>
  app.request("/api/review/grade", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packageId: "demo", itemId: "card1", direction, rating }),
  });

describe("review", () => {
  it("due queue includes both directions of a reverse card, new first", async () => {
    const body = await (await app.request("/api/review/due")).json();
    expect(body.cards).toHaveLength(2); // card1 front + back (reverse: true)
    expect(body.cards.every((c: any) => c.isNew)).toBe(true);
    const back = body.cards.find((c: any) => c.direction === "back");
    expect(back).toMatchObject({ front: "hello", back: "hola" }); // pre-swapped
  });

  it("grading good pushes the card out of the due queue", async () => {
    const res = await grade("front", "good");
    expect(res.status).toBe(200);
    expect((await res.json()).state.intervalDays).toBe(1);
    const due = await (await app.request("/api/review/due")).json();
    expect(due.cards.map((c: any) => c.direction)).toEqual(["back"]);
    expect(db.prepare("SELECT COUNT(*) n FROM review_log").get()).toMatchObject({ n: 1 });
  });

  it("grading again keeps the card due now", async () => {
    await grade("front", "again");
    const due = await (await app.request("/api/review/due")).json();
    expect(due.cards.some((c: any) => c.direction === "front")).toBe(true);
  });

  it("free study returns all cards without touching state", async () => {
    const body = await (await app.request("/api/review/free-study?packageId=demo")).json();
    expect(body.cards).toHaveLength(2);
    expect(db.prepare("SELECT COUNT(*) n FROM card_state").get()).toMatchObject({ n: 0 });
  });

  it("cards carry scheduler state so the player can preview each grade", async () => {
    const fresh = await (await app.request("/api/review/due")).json();
    expect(fresh.cards.every((c: any) => c.state === null)).toBe(true);

    await grade("front", "good");

    const all = await (await app.request("/api/review/free-study?packageId=demo")).json();
    const front = all.cards.find((c: any) => c.direction === "front");
    expect(front.isNew).toBe(false);
    expect(front.state).toMatchObject({ intervalDays: 1, reps: 1, lapses: 0, ease: 2.5 });
    expect(all.cards.find((c: any) => c.direction === "back").state).toBeNull();
  });

  it("validates rating and item", async () => {
    expect((await grade("front", "meh")).status).toBe(400);
    const res = await app.request("/api/review/grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "demo", itemId: "mc1", direction: "front", rating: "good" }),
    });
    expect(res.status).toBe(404); // mc1 is not a flashcard
  });
});
