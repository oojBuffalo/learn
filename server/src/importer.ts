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
    const insItem = db.prepare("INSERT INTO items (package_id, id, ord, type, data) VALUES (?, ?, ?, ?, ?)");
    for (const [order, item] of pkg.items.entries()) {
      insItem.run(pid, item.id, order, item.type, JSON.stringify(item));
    }
    const insQuiz = db.prepare("INSERT INTO quizzes (package_id, id, ord, data) VALUES (?, ?, ?, ?)");
    for (const [order, quiz] of pkg.quizzes.entries()) {
      insQuiz.run(pid, quiz.id, order, JSON.stringify(quiz));
    }
    const insGame = db.prepare("INSERT INTO games (package_id, id, ord, data) VALUES (?, ?, ?, ?)");
    for (const [order, game] of pkg.games.entries()) {
      insGame.run(pid, game.id, order, JSON.stringify(game));
    }
    const insAsset = db.prepare("INSERT INTO assets (package_id, path, ord, data) VALUES (?, ?, ?, ?)");
    for (const [order, asset] of pkg.assets.entries()) {
      insAsset.run(pid, asset.path, order, Buffer.from(asset.data));
    }
  });
  tx();
}
