import type { LoadedPackage } from "@study/shared";
import type { Db } from "./db.js";
import { buildPackageZip } from "./zip.js";

export function loadPackageFromDb(db: Db, packageId: string): LoadedPackage | null {
  const row = db.prepare("SELECT manifest FROM packages WHERE id = ?").get(packageId) as { manifest: string } | undefined;
  if (!row) return null;
  const lessons = (db
    .prepare("SELECT id, ord, file, frontmatter, body FROM lessons WHERE package_id = ? ORDER BY ord")
    .all(packageId) as any[]).map((l) => ({
      file: l.file, order: l.ord, frontmatter: JSON.parse(l.frontmatter), body: l.body,
    }));
  const items = (db.prepare("SELECT data FROM items WHERE package_id = ? ORDER BY ord").all(packageId) as any[])
    .map((r) => JSON.parse(r.data));
  const quizzes = (db.prepare("SELECT data FROM quizzes WHERE package_id = ? ORDER BY ord").all(packageId) as any[])
    .map((r) => JSON.parse(r.data));
  const games = (db.prepare("SELECT data FROM games WHERE package_id = ? ORDER BY ord").all(packageId) as any[])
    .map((r) => JSON.parse(r.data));
  const assets = (db.prepare("SELECT path, data FROM assets WHERE package_id = ? ORDER BY ord").all(packageId) as any[])
    .map((r) => ({ path: r.path, data: new Uint8Array(r.data) }));
  return { manifest: JSON.parse(row.manifest), lessons, items, quizzes, games, assets };
}

export function exportPackage(db: Db, packageId: string): Buffer | null {
  const pkg = loadPackageFromDb(db, packageId);
  return pkg ? buildPackageZip(pkg) : null;
}
