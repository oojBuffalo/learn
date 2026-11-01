import { Hono } from "hono";
import { gradeRequestSchema, schedule } from "@study/shared";
import type { CardState, FlashcardItem } from "@study/shared";
import type { AppEnv } from "../app.js";
import type { Db } from "../db.js";
import { apiError, parseJsonBody } from "../http.js";

interface CardRow { packageId: string; itemId: string; direction: "front" | "back";
  front: string; back: string; examples?: string[]; media?: FlashcardItem["media"];
  isNew: boolean; dueAt: string | null;
  /** Scheduler state, so the player can show what each grade would do. */
  state: CardState | null }

interface CardJoinRow {
  package_id: string;
  id: string;
  data: string;
  due_at: string | null;
  has_state: string | null;
  state_dir: "front" | "back" | null;
  interval_days: number | null;
  ease: number | null;
  reps: number | null;
  lapses: number | null;
}

interface CardStateRow {
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  due_at: string;
}

function allCards(db: Db, packageId?: string): CardRow[] {
  const rows = db
    .prepare(
      `SELECT i.package_id, i.id, i.data, s.due_at, s.item_id AS has_state, s.direction AS state_dir,
              s.interval_days, s.ease, s.reps, s.lapses
       FROM items i
       LEFT JOIN card_state s ON s.package_id = i.package_id AND s.item_id = i.id
       WHERE i.type = 'flashcard' ${packageId ? "AND i.package_id = ?" : ""}`,
    )
    .all(...(packageId ? [packageId] : [])) as CardJoinRow[];
  // one row per (item, state) join — regroup per item, then expand directions
  const byItem = new Map<string, { pkg: string; item: FlashcardItem; states: Map<string, CardState> }>();
  for (const r of rows) {
    const key = `${r.package_id}/${r.id}`;
    const entry = byItem.get(key) ?? { pkg: r.package_id, item: JSON.parse(r.data), states: new Map() };
    if (r.has_state) {
      entry.states.set(r.state_dir!, {
        intervalDays: r.interval_days!, ease: r.ease!, reps: r.reps!, lapses: r.lapses!, dueAt: r.due_at!,
      });
    }
    byItem.set(key, entry);
  }
  const cards: CardRow[] = [];
  for (const { pkg, item, states } of byItem.values()) {
    const dirs: ("front" | "back")[] = item.reverse ? ["front", "back"] : ["front"];
    for (const direction of dirs) {
      const state = states.get(direction) ?? null;
      cards.push({
        packageId: pkg, itemId: item.id, direction,
        front: direction === "front" ? item.front : item.back,
        back: direction === "front" ? item.back : item.front,
        examples: item.examples, media: item.media, isNew: state === null, dueAt: state?.dueAt ?? null, state,
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
    if (!packageId) return apiError(c, 400, "invalid_request", "packageId required");
    return c.json({ cards: allCards(c.get("db"), packageId).map(({ dueAt, ...rest }) => rest) });
  });

  r.post("/grade", async (c) => {
    const request = await parseJsonBody(c, gradeRequestSchema, "request body is not a valid grade");
    if (!request.ok) return request.response;
    const db = c.get("db");
    const { packageId, itemId, direction, rating } = request.data;
    const row = db
      .prepare("SELECT data FROM items WHERE package_id = ? AND id = ? AND type = 'flashcard'")
      .get(packageId, itemId) as { data: string } | undefined;
    if (!row) return apiError(c, 404, "not_found", "unknown flashcard");
    const item = JSON.parse(row.data) as FlashcardItem;
    if (direction === "back" && item.reverse !== true) {
      return apiError(c, 404, "not_found", "this flashcard has no back→front card");
    }

    const prevRow = db
      .prepare("SELECT interval_days, ease, reps, lapses, due_at FROM card_state WHERE package_id = ? AND item_id = ? AND direction = ?")
      .get(packageId, itemId, direction) as CardStateRow | undefined;
    const prev: CardState | null = prevRow
      ? { intervalDays: prevRow.interval_days, ease: prevRow.ease, reps: prevRow.reps, lapses: prevRow.lapses, dueAt: prevRow.due_at }
      : null;
    const now = new Date();
    const state = schedule(prev, rating, now);
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
