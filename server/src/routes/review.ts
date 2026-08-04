import { Hono } from "hono";
import { schedule } from "@study/shared";
import type { CardState, FlashcardItem, Rating } from "@study/shared";
import type { AppEnv } from "../app.js";
import type { Db } from "../db.js";

interface CardRow { packageId: string; itemId: string; direction: "front" | "back";
  front: string; back: string; examples?: string[]; isNew: boolean; dueAt: string | null }

function allCards(db: Db, packageId?: string): CardRow[] {
  const rows = db
    .prepare(
      `SELECT i.package_id, i.id, i.data, s.due_at, s.item_id AS has_state, s.direction AS state_dir
       FROM items i
       LEFT JOIN card_state s ON s.package_id = i.package_id AND s.item_id = i.id
       WHERE i.type = 'flashcard' ${packageId ? "AND i.package_id = ?" : ""}`,
    )
    .all(...(packageId ? [packageId] : [])) as any[];
  // one row per (item, state) join — regroup per item, then expand directions
  const byItem = new Map<string, { pkg: string; item: FlashcardItem; states: Map<string, string> }>();
  for (const r of rows) {
    const key = `${r.package_id}/${r.id}`;
    const entry = byItem.get(key) ?? { pkg: r.package_id, item: JSON.parse(r.data), states: new Map() };
    if (r.has_state) entry.states.set(r.state_dir, r.due_at);
    byItem.set(key, entry);
  }
  const cards: CardRow[] = [];
  for (const { pkg, item, states } of byItem.values()) {
    const dirs: ("front" | "back")[] = item.reverse ? ["front", "back"] : ["front"];
    for (const direction of dirs) {
      const dueAt = states.get(direction) ?? null;
      cards.push({
        packageId: pkg, itemId: item.id, direction,
        front: direction === "front" ? item.front : item.back,
        back: direction === "front" ? item.back : item.front,
        examples: item.examples, isNew: dueAt === null, dueAt,
      });
    }
  }
  return cards;
}

export function reviewRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/due", (c) => {
    const now = new Date().toISOString();
    const cards = allCards(c.get("db"))
      .filter((card) => card.isNew || card.dueAt! <= now)
      .sort((a, b) => Number(b.isNew) - Number(a.isNew) || (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    return c.json({ cards: cards.map(({ dueAt, ...rest }) => rest) });
  });

  r.get("/free-study", (c) => {
    const packageId = c.req.query("packageId");
    if (!packageId) return c.json({ error: { code: "bad_request", message: "packageId required" } }, 400);
    return c.json({ cards: allCards(c.get("db"), packageId).map(({ dueAt, ...rest }) => rest) });
  });

  r.post("/grade", async (c) => {
    const db = c.get("db");
    const { packageId, itemId, direction, rating } = await c.req.json();
    if (!["again", "hard", "good", "easy"].includes(rating) || !["front", "back"].includes(direction)) {
      return c.json({ error: { code: "bad_request", message: "bad rating or direction" } }, 400);
    }
    const item = db
      .prepare("SELECT 1 FROM items WHERE package_id = ? AND id = ? AND type = 'flashcard'")
      .get(packageId, itemId);
    if (!item) return c.json({ error: { code: "not_found", message: "unknown flashcard" } }, 404);

    const prevRow = db
      .prepare("SELECT interval_days, ease, reps, lapses, due_at FROM card_state WHERE package_id = ? AND item_id = ? AND direction = ?")
      .get(packageId, itemId, direction) as any;
    const prev: CardState | null = prevRow
      ? { intervalDays: prevRow.interval_days, ease: prevRow.ease, reps: prevRow.reps, lapses: prevRow.lapses, dueAt: prevRow.due_at }
      : null;
    const now = new Date();
    const state = schedule(prev, rating as Rating, now);
    db.transaction(() => {
      db.prepare(
        `INSERT INTO card_state (package_id, item_id, direction, interval_days, ease, reps, lapses, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(package_id, item_id, direction) DO UPDATE SET
           interval_days = excluded.interval_days, ease = excluded.ease,
           reps = excluded.reps, lapses = excluded.lapses, due_at = excluded.due_at`,
      ).run(packageId, itemId, direction, state.intervalDays, state.ease, state.reps, state.lapses, state.dueAt);
      db.prepare(
        "INSERT INTO review_log (package_id, item_id, direction, rating, at) VALUES (?, ?, ?, ?, ?)",
      ).run(packageId, itemId, direction, rating, now.toISOString());
    })();
    return c.json({ state });
  });

  return r;
}
