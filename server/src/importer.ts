import type { LoadedPackage, PackageError } from "@study/shared";
import type { Db } from "./db.js";
import { readPackageZip } from "./zip.js";

export type ImportResult = { ok: true; packageId: string } | { ok: false; errors: PackageError[] };

export function importPackage(db: Db, zipBuf: Buffer): ImportResult {
  const { pkg, errors } = readPackageZip(zipBuf);
  if (!pkg) return { ok: false, errors };
  insertPackage(db, pkg);
  return { ok: true, packageId: pkg.manifest.id };
}

export function insertPackage(db: Db, pkg: LoadedPackage): void {
  const tx = db.transaction(() => {
    const pid = pkg.manifest.id;
    db.prepare("DELETE FROM packages WHERE id = ?").run(pid); // cascades to content tables only
    db.prepare("INSERT INTO packages (id, manifest, imported_at) VALUES (?, ?, ?)").run(
      pid, JSON.stringify(pkg.manifest), new Date().toISOString(),
    );
    const insLesson = db.prepare(
      "INSERT INTO lessons (package_id, id, ord, file, frontmatter, body) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const l of pkg.lessons) {
      insLesson.run(pid, l.frontmatter.id, l.order, l.file, JSON.stringify(l.frontmatter), l.body);
    }
    const insItem = db.prepare("INSERT INTO items (package_id, id, type, data) VALUES (?, ?, ?, ?)");
    for (const i of pkg.items) insItem.run(pid, i.id, i.type, JSON.stringify(i));
    const insQuiz = db.prepare("INSERT INTO quizzes (package_id, id, data) VALUES (?, ?, ?)");
    for (const q of pkg.quizzes) insQuiz.run(pid, q.id, JSON.stringify(q));
    const insGame = db.prepare("INSERT INTO games (package_id, id, data) VALUES (?, ?, ?)");
    for (const g of pkg.games) insGame.run(pid, g.id, JSON.stringify(g));
    const insAsset = db.prepare("INSERT INTO assets (package_id, path, data) VALUES (?, ?, ?)");
    for (const a of pkg.assets) insAsset.run(pid, a.path, Buffer.from(a.data));
  });
  tx();
}
