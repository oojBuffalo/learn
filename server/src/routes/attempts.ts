import { Hono } from "hono";
import { attemptRequestSchema, checkAnswer } from "@study/shared";
import type { AppEnv } from "../app.js";

export function attemptRoutes() {
  const r = new Hono<AppEnv>();

  r.post("/", async (c) => {
    const db = c.get("db");
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: { code: "invalid_request", message: "request body must be valid JSON" } }, 400);
    }
    const request = attemptRequestSchema.safeParse(payload);
    if (!request.success) {
      return c.json({ error: { code: "invalid_request", message: "request body is not a valid attempt" } }, 400);
    }
    const { packageId, itemId, answer } = request.data;
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
