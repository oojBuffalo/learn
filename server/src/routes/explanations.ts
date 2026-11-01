import { Hono } from "hono";
import { z } from "zod";
import { explanationCreateSchema, explanationPatchSchema, LOW_CONFIDENCE_MAX } from "@study/shared";
import type { Confidence, Explanation } from "@study/shared";
import type { AppEnv } from "../app.js";
import type { Db } from "../db.js";
import { apiError, parseJsonBody, parseQuery } from "../http.js";
import { LIVE } from "../orphans.js";

interface ExplanationRow {
  id: number;
  package_id: string;
  lesson_id: string;
  body: string;
  confidence: Confidence;
  created_at: string;
  updated_at: string;
  package_title: string | null;
  lesson_title: string | null;
  orphaned: 0 | 1;
  revisit: 0 | 1;
}

/**
 * Builds the shared predicate for a live lesson's latest low-confidence explanation.
 * Args:
 *   e: A trusted internal SQL table name or alias.
 * Returns:
 *   SQL matching only the latest explanation id for a live lesson, when rated 1 or 2.
 * Raises:
 *   None.
 */
export function revisitSql(e: string): string {
  return `${LIVE.explanations(e)} AND ${e}.confidence <= ${LOW_CONFIDENCE_MAX} AND ${e}.id =
    (SELECT MAX(x.id) FROM explanations x WHERE x.package_id = ${e}.package_id AND x.lesson_id = ${e}.lesson_id)`;
}

const SELECT_EXPLANATION = `SELECT e.id, e.package_id, e.lesson_id, e.body, e.confidence, e.created_at, e.updated_at,
  json_extract(p.manifest, '$.title') AS package_title, json_extract(l.frontmatter, '$.title') AS lesson_title,
  NOT (${LIVE.explanations("e")}) AS orphaned, (${revisitSql("e")}) AS revisit
  FROM explanations e LEFT JOIN packages p ON p.id = e.package_id
  LEFT JOIN lessons l ON l.package_id = e.package_id AND l.id = e.lesson_id`;
const ID_PATH = "/:id{[1-9][0-9]*}";
const listQuerySchema = z.object({ revisit: z.literal("1").optional() }).strict();

function toExplanation(row: ExplanationRow): Explanation {
  return {
    id: row.id, packageId: row.package_id, lessonId: row.lesson_id, packageTitle: row.package_title,
    lessonTitle: row.lesson_title, body: row.body, confidence: row.confidence,
    createdAt: row.created_at, updatedAt: row.updated_at, orphaned: row.orphaned === 1, revisit: row.revisit === 1,
  };
}

function readExplanation(db: Db, id: string): ExplanationRow | undefined {
  return db.prepare(`${SELECT_EXPLANATION} WHERE e.id = ?`).get(id) as ExplanationRow | undefined;
}

/**
 * Creates explanation routes and server-computed revisit prompts without a delete endpoint.
 * Args:
 *   None; the app supplies the database in each request context.
 * Returns:
 *   Strict create/update, list and read routes with orphan and revisit flags.
 * Raises:
 *   Error: A database operation fails.
 */
export function explanationRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get("/", (c) => {
    const query = parseQuery(c, listQuerySchema, "revisit must be 1");
    if (!query.ok) return query.response;
    if ((c.req.queries("revisit")?.length ?? 0) > 1) return apiError(c, 400, "invalid_request", "revisit must be 1");
    const suffix = query.data.revisit === "1"
      ? ` WHERE ${revisitSql("e")} ORDER BY e.confidence ASC, e.id ASC` : " ORDER BY e.id DESC";
    const rows = c.get("db").prepare(SELECT_EXPLANATION + suffix).all() as ExplanationRow[];
    return c.json({ explanations: rows.map(toExplanation) });
  });
  r.get(ID_PATH, (c) => {
    const row = readExplanation(c.get("db"), c.req.param("id"));
    return row ? c.json({ explanation: toExplanation(row) }) : apiError(c, 404, "not_found", "unknown explanation");
  });
  r.post("/", async (c) => {
    const request = await parseJsonBody(c, explanationCreateSchema, "request body is not a valid explanation");
    if (!request.ok) return request.response;
    const db = c.get("db");
    const { packageId, lessonId, body, confidence } = request.data;
    if (!db.prepare("SELECT 1 FROM lessons WHERE package_id = ? AND id = ?").get(packageId, lessonId)) {
      return apiError(c, 404, "not_found", "unknown lesson");
    }
    const now = new Date().toISOString();
    const inserted = db.prepare("INSERT INTO explanations (package_id, lesson_id, body, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(packageId, lessonId, body, confidence, now, now);
    return c.json({ explanation: toExplanation(readExplanation(db, String(inserted.lastInsertRowid))!) }, 201);
  });
  r.patch(ID_PATH, async (c) => {
    const request = await parseJsonBody(c, explanationPatchSchema, "request body is not a valid explanation update");
    if (!request.ok) return request.response;
    const db = c.get("db");
    const id = c.req.param("id");
    const previous = readExplanation(db, id);
    if (!previous) return apiError(c, 404, "not_found", "unknown explanation");
    db.prepare("UPDATE explanations SET body = ?, confidence = ?, updated_at = ? WHERE id = ?")
      .run(request.data.body ?? previous.body, request.data.confidence ?? previous.confidence, new Date().toISOString(), id);
    return c.json({ explanation: toExplanation(readExplanation(db, id)!) });
  });
  return r;
}
