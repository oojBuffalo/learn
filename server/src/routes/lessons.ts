import { Hono } from "hono";
import { activityIdsInBody } from "@study/shared";
import type { AppEnv } from "../app.js";

export function lessonRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/:packageId/:lessonId", (c) => {
    const db = c.get("db");
    const { packageId, lessonId } = c.req.param();
    const row = db
      .prepare("SELECT id, frontmatter, body FROM lessons WHERE package_id = ? AND id = ?")
      .get(packageId, lessonId) as any;
    if (!row) return c.json({ error: { code: "not_found", message: "unknown lesson" } }, 404);
    const frontmatter = JSON.parse(row.frontmatter);
    const ids = [...new Set([...activityIdsInBody(row.body), ...(frontmatter.activities ?? [])])];
    const items: Record<string, unknown> = {};
    const getItem = db.prepare("SELECT data FROM items WHERE package_id = ? AND id = ?");
    for (const id of ids) {
      const item = getItem.get(packageId, id) as any;
      if (item) items[id] = JSON.parse(item.data);
    }
    const prog = db
      .prepare("SELECT status FROM lesson_progress WHERE package_id = ? AND lesson_id = ?")
      .get(packageId, lessonId) as any;
    return c.json({
      lesson: { id: row.id, title: frontmatter.title, frontmatter, body: row.body },
      items,
      progress: prog?.status ?? "not-started",
    });
  });

  r.post("/:packageId/:lessonId/progress", async (c) => {
    const db = c.get("db");
    const { packageId, lessonId } = c.req.param();
    const exists = db.prepare("SELECT 1 FROM lessons WHERE package_id = ? AND id = ?").get(packageId, lessonId);
    if (!exists) return c.json({ error: { code: "not_found", message: "unknown lesson" } }, 404);
    const { status } = await c.req.json();
    if (status !== "in-progress" && status !== "completed") {
      return c.json({ error: { code: "bad_request", message: "status must be in-progress|completed" } }, 400);
    }
    db.prepare(
      `INSERT INTO lesson_progress (package_id, lesson_id, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(package_id, lesson_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    ).run(packageId, lessonId, status, new Date().toISOString());
    return c.json({ ok: true });
  });

  return r;
}
