import { Hono } from "hono";
import { noteCreateSchema, notePatchSchema } from "@study/shared";
import type { Note, NoteTarget } from "@study/shared";
import type { AppEnv } from "../app.js";
import type { Db } from "../db.js";
import { apiError, parseJsonBody } from "../http.js";
import { LIVE } from "../orphans.js";

interface NoteRow {
  id: number;
  package_id: string | null;
  lesson_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  package_title: string | null;
  lesson_title: string | null;
  orphaned: 0 | 1;
}

const SELECT_NOTE = `SELECT n.id, n.package_id, n.lesson_id, n.body, n.created_at, n.updated_at,
  json_extract(p.manifest, '$.title') AS package_title, json_extract(l.frontmatter, '$.title') AS lesson_title,
  NOT (${LIVE.notes("n")}) AS orphaned
  FROM notes n LEFT JOIN packages p ON p.id = n.package_id
  LEFT JOIN lessons l ON l.package_id = n.package_id AND l.id = n.lesson_id`;
const ID_PATH = "/:id{[1-9][0-9]*}";

function toNote(row: NoteRow): Note {
  return {
    id: row.id, body: row.body, orphaned: row.orphaned === 1, createdAt: row.created_at, updatedAt: row.updated_at,
    target: row.package_id === null ? null : { packageId: row.package_id, lessonId: row.lesson_id,
      packageTitle: row.package_title, lessonTitle: row.lesson_title },
  };
}

function readNote(db: Db, id: string): NoteRow | undefined {
  return db.prepare(`${SELECT_NOTE} WHERE n.id = ?`).get(id) as NoteRow | undefined;
}

function targetError(db: Db, target: NoteTarget | null): string | null {
  if (target === null) return null;
  if (!db.prepare("SELECT 1 FROM packages WHERE id = ?").get(target.packageId)) return "unknown package";
  if (target.lessonId !== null && !db.prepare("SELECT 1 FROM lessons WHERE package_id = ? AND id = ?")
    .get(target.packageId, target.lessonId)) return "unknown lesson";
  return null;
}

/**
 * Creates note routes that retain writing independently of its content target.
 * Args:
 *   None; the app supplies the database in each request context.
 * Returns:
 *   Strict create/update, list, read and delete routes with orphan flags.
 * Raises:
 *   Error: A database operation fails.
 */
export function noteRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get("/", (c) => {
    const rows = c.get("db").prepare(`${SELECT_NOTE} ORDER BY n.updated_at DESC, n.id DESC`).all() as NoteRow[];
    return c.json({ notes: rows.map(toNote) });
  });
  r.get(ID_PATH, (c) => {
    const note = readNote(c.get("db"), c.req.param("id"));
    return note ? c.json({ note: toNote(note) }) : apiError(c, 404, "not_found", "unknown note");
  });
  r.post("/", async (c) => {
    const request = await parseJsonBody(c, noteCreateSchema, "request body is not a valid note");
    if (!request.ok) return request.response;
    const db = c.get("db");
    const { body, target } = request.data;
    const error = targetError(db, target);
    if (error) return apiError(c, 404, "not_found", error);
    const now = new Date().toISOString();
    const inserted = db.prepare("INSERT INTO notes (package_id, lesson_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(target?.packageId ?? null, target?.lessonId ?? null, body, now, now);
    return c.json({ note: toNote(readNote(db, String(inserted.lastInsertRowid))!) }, 201);
  });
  r.patch(ID_PATH, async (c) => {
    const request = await parseJsonBody(c, notePatchSchema, "request body is not a valid note update");
    if (!request.ok) return request.response;
    const db = c.get("db");
    const id = c.req.param("id");
    const previous = readNote(db, id);
    if (!previous) return apiError(c, 404, "not_found", "unknown note");
    const { body, target } = request.data;
    if (target !== undefined && target !== null &&
      (target.packageId !== previous.package_id || target.lessonId !== previous.lesson_id)) {
      const error = targetError(db, target);
      if (error) return apiError(c, 404, "not_found", error);
    }
    db.prepare("UPDATE notes SET body = ?, package_id = ?, lesson_id = ?, updated_at = ? WHERE id = ?")
      .run(body ?? previous.body, target === undefined ? previous.package_id : target?.packageId ?? null,
        target === undefined ? previous.lesson_id : target?.lessonId ?? null, new Date().toISOString(), id);
    return c.json({ note: toNote(readNote(db, id)!) });
  });
  r.delete(ID_PATH, (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    if (!readNote(db, id)) return apiError(c, 404, "not_found", "unknown note");
    db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    return c.body(null, 204);
  });
  return r;
}
