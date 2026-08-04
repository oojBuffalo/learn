import { Hono } from "hono";
import { checkAnswer } from "@study/shared";
import type { AppEnv } from "../app.js";

export function attemptRoutes() {
  const r = new Hono<AppEnv>();

  r.post("/", async (c) => {
    const db = c.get("db");
    const { packageId, itemId, answer } = await c.req.json();
    const row = db.prepare("SELECT data FROM items WHERE package_id = ? AND id = ?").get(packageId, itemId) as any;
    if (!row) return c.json({ error: { code: "not_found", message: "unknown item" } }, 404);
    const item = JSON.parse(row.data);
    let result;
    try {
      result = checkAnswer(item, answer);
    } catch (e) {
      return c.json({ error: { code: "not_checkable", message: (e as Error).message } }, 422);
    }
    db.prepare(
      "INSERT INTO attempts (package_id, kind, item_id, answer, correct, score, at) VALUES (?, 'exercise', ?, ?, ?, ?, ?)",
    ).run(packageId, itemId, JSON.stringify(answer), result.correct ? 1 : 0, result.score, new Date().toISOString());
    return c.json(result);
  });

  return r;
}
