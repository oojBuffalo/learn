import { Hono } from "hono";
import { activityIdsInBody, progressRequestSchema } from "@study/shared";
import type { LessonFrontmatter } from "@study/shared";
import type { AppEnv } from "../app.js";
import { apiError, parseJsonBody } from "../http.js";

export function lessonRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/:packageId/:lessonId", (c) => {
    const db = c.get("db");
    const { packageId, lessonId } = c.req.param();
    const row = db
      .prepare("SELECT id, frontmatter, body FROM lessons WHERE package_id = ? AND id = ?")
      .get(packageId, lessonId) as { id: string; frontmatter: string; body: string } | undefined;
    if (!row) return apiError(c, 404, "not_found", "unknown lesson");
    const frontmatter = JSON.parse(row.frontmatter) as LessonFrontmatter;
    const ids = [...new Set([...activityIdsInBody(row.body), ...(frontmatter.activities ?? [])])];
    const items: Record<string, unknown> = {};
    const getItem = db.prepare("SELECT data FROM items WHERE package_id = ? AND id = ?");
    for (const id of ids) {
      const item = getItem.get(packageId, id) as { data: string } | undefined;
      if (item) items[id] = JSON.parse(item.data);
    }
    const prog = db
      .prepare("SELECT status FROM lesson_progress WHERE package_id = ? AND lesson_id = ?")
      .get(packageId, lessonId) as { status: "in-progress" | "completed" } | undefined;
    return c.json({
      lesson: { id: row.id, title: frontmatter.title, frontmatter, body: row.body },
      items,
      progress: prog?.status ?? "not-started",
    });
  });

  r.post("/:packageId/:lessonId/progress", async (c) => {
    const request = await parseJsonBody(c, progressRequestSchema, "request body is not a valid progress update");
    if (!request.ok) return request.response;
    const db = c.get("db");
    const { packageId, lessonId } = c.req.param();
    const exists = db.prepare("SELECT 1 FROM lessons WHERE package_id = ? AND id = ?").get(packageId, lessonId);
    if (!exists) return apiError(c, 404, "not_found", "unknown lesson");
    const { status } = request.data;
    // Opening a lesson fires an unawaited in-progress write, which can land after the
    // completion it preceded. Completion is final, so that late write must not undo it.
    db.prepare(
      `INSERT INTO lesson_progress (package_id, lesson_id, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(package_id, lesson_id) DO UPDATE SET
         status = CASE WHEN lesson_progress.status = 'completed' THEN 'completed' ELSE excluded.status END,
         updated_at = CASE WHEN lesson_progress.status = 'completed' THEN lesson_progress.updated_at
                           ELSE excluded.updated_at END`,
    ).run(packageId, lessonId, status, new Date().toISOString());
    return c.json({ ok: true });
  });

  return r;
}
