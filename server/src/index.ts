import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  gameSchema, itemSchema, lessonFrontmatterSchema, manifestSchema, quizSchema, validatePackage,
} from "@study/shared";
import type { LoadedPackage } from "@study/shared";
import matter from "gray-matter";
import { createApp } from "./app.js";
import { openDb, type Db } from "./db.js";
import { insertPackage } from "./importer.js";
import { validateMath } from "./mathCheck.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = join(HERE, "..", "sample");

/** `PORT` lets a second checkout run alongside the default one. */
export const STUDY_PORT = Number(process.env.PORT) || 4321;

export function studyServerOptions(fetch: Parameters<typeof serve>[0]["fetch"]) {
  return { fetch, hostname: "127.0.0.1", port: STUDY_PORT } as const;
}

export function loadSamplePackage(): LoadedPackage {
  const read = (p: string) => readFileSync(join(SAMPLE_DIR, p), "utf8");
  const maybeJson = <T>(p: string, parse: (v: unknown) => T): T[] =>
    existsSync(join(SAMPLE_DIR, p)) ? (JSON.parse(read(p)) as unknown[]).map(parse) : [];
  const lessons = readdirSync(join(SAMPLE_DIR, "lessons")).sort().map((f, order) => {
    const { data, content } = matter(read(join("lessons", f)));
    return { file: `lessons/${f}`, order, frontmatter: lessonFrontmatterSchema.parse(data), body: content };
  });
  const pkg: LoadedPackage = {
    manifest: manifestSchema.parse(JSON.parse(read("manifest.json"))),
    lessons,
    items: maybeJson("items.json", (v) => itemSchema.parse(v)),
    quizzes: maybeJson("quizzes.json", (v) => quizSchema.parse(v)),
    games: maybeJson("games.json", (v) => gameSchema.parse(v)),
    assets: [],
  };
  const errs = [...validatePackage(pkg), ...validateMath(pkg)];
  if (errs.length) throw new Error(`sample package invalid: ${JSON.stringify(errs)}`);
  return pkg;
}

export function seedSampleIfEmpty(db: Db): void {
  const count = (db.prepare("SELECT COUNT(*) n FROM packages").get() as { n: number }).n;
  if (count === 0) insertPackage(db, loadSamplePackage());
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const db = openDb();
  seedSampleIfEmpty(db);
  const app = createApp(db);
  app.use("/*", serveStatic({ root: "../web/dist" })); // after /api routes; harmless if dist absent
  // Client routes (/study, /lesson/…) must survive a reload: hand them the SPA shell.
  const indexHtml = join(HERE, "..", "..", "web", "dist", "index.html");
  app.get("*", (c) =>
    c.req.path.startsWith("/api/") || !existsSync(indexHtml)
      ? c.notFound()
      : c.html(readFileSync(indexHtml, "utf8")),
  );
  serve(studyServerOptions(app.fetch), () =>
    console.log("study app on http://localhost:4321"),
  );
}
