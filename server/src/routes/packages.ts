import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { importPackage } from "../importer.js";
import { exportPackage } from "../exporter.js";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", mp3: "audio/mpeg",
};

export function packageRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/", (c) => {
    const db = c.get("db");
    const packages = (db.prepare("SELECT id, manifest FROM packages ORDER BY id").all() as any[]).map((p) => {
      const m = JSON.parse(p.manifest);
      const lessons = (db
        .prepare(
          `SELECT l.id, l.frontmatter, COALESCE(lp.status, 'not-started') AS status
           FROM lessons l LEFT JOIN lesson_progress lp
             ON lp.package_id = l.package_id AND lp.lesson_id = l.id
           WHERE l.package_id = ? ORDER BY l.ord`,
        )
        .all(p.id) as any[]).map((l) => {
          const fm = JSON.parse(l.frontmatter);
          return { id: l.id, title: fm.title, summary: fm.summary, status: l.status };
        });
      return {
        id: p.id, title: m.title, description: m.description, version: m.version,
        tags: m.tags, lessonCount: lessons.length, lessons,
      };
    });
    return c.json({ packages });
  });

  r.post("/import", async (c) => {
    const body = Buffer.from(await c.req.arrayBuffer());
    const res = importPackage(c.get("db"), body);
    if (!res.ok) {
      return c.json(
        { error: { code: "invalid_package", message: "package failed validation", details: res.errors } },
        422,
      );
    }
    return c.json({ packageId: res.packageId }, 201);
  });

  r.get("/:id/export", (c) => {
    const zip = exportPackage(c.get("db"), c.req.param("id"));
    if (!zip) return c.json({ error: { code: "not_found", message: "unknown package" } }, 404);
    return c.body(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${c.req.param("id")}.zip"`,
    });
  });

  r.delete("/:id", (c) => {
    c.get("db").prepare("DELETE FROM packages WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });

  r.get("/:id/assets/*", (c) => {
    const path = c.req.path.split("/assets/").slice(1).join("/assets/");
    const assetPath = `assets/${path.replace(/^assets\//, "")}`;
    const row = c.get("db")
      .prepare("SELECT data FROM assets WHERE package_id = ? AND path = ?")
      .get(c.req.param("id"), assetPath) as { data: Buffer } | undefined;
    if (!row) return c.json({ error: { code: "not_found", message: "unknown asset" } }, 404);
    const ext = assetPath.split(".").pop() ?? "";
    return c.body(row.data.buffer.slice(row.data.byteOffset, row.data.byteOffset + row.data.byteLength) as ArrayBuffer, 200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
    });
  });

  return r;
}
