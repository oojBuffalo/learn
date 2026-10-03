import AdmZip from "adm-zip";
import matter from "gray-matter";
import {
  itemSchema, lessonFrontmatterSchema, manifestSchema, quizSchema, gameSchema,
  validatePackage,
} from "@study/shared";
import type { LoadedLesson, LoadedPackage, PackageError } from "@study/shared";
import { z } from "zod";
import { validateMath } from "./mathCheck.js";

function zodErrors(file: string, e: z.ZodError): PackageError[] {
  return e.issues.map((i) => ({ file, path: i.path.join("."), message: i.message }));
}

export function readPackageZip(zipBuf: Buffer): { pkg: LoadedPackage | null; errors: PackageError[] } {
  const errors: PackageError[] = [];
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuf);
  } catch {
    return { pkg: null, errors: [{ file: "(zip)", path: "", message: "not a readable zip archive" }] };
  }
  const entries = new Map(zip.getEntries().filter((e) => !e.isDirectory).map((e) => [e.entryName, e]));
  const text = (name: string) => entries.get(name)?.getData().toString("utf8");

  const manifestRaw = text("manifest.json");
  if (manifestRaw === undefined) {
    return { pkg: null, errors: [{ file: "manifest.json", path: "", message: "missing manifest.json" }] };
  }
  let manifest: LoadedPackage["manifest"] | null = null;
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(manifestRaw));
    if (parsed.success) manifest = parsed.data;
    else errors.push(...zodErrors("manifest.json", parsed.error));
  } catch {
    errors.push({ file: "manifest.json", path: "", message: "invalid JSON" });
  }

  const lessons: LoadedLesson[] = [];
  const lessonFiles = [...entries.keys()].filter((n) => /^lessons\/[^/]+\.md$/.test(n)).sort();
  if (lessonFiles.length === 0) errors.push({ file: "lessons/", path: "", message: "package has no lessons" });
  lessonFiles.forEach((file, order) => {
    try {
      const { data, content } = matter(text(file)!);
      const fm = lessonFrontmatterSchema.safeParse(data);
      if (fm.success) lessons.push({ file, order, frontmatter: fm.data, body: content });
      else errors.push(...zodErrors(file, fm.error));
    } catch (error) {
      const reason = error instanceof Error ? error.message.split("\n")[0] : "unreadable frontmatter";
      errors.push({ file, path: "frontmatter", message: `invalid YAML frontmatter: ${reason}` });
    }
  });

  const parseJsonArray = <T>(file: string, schema: z.ZodType<T>): T[] => {
    const raw = text(file);
    if (raw === undefined) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) {
        errors.push({ file, path: "", message: "must be a JSON array" });
        return [];
      }
      return arr.flatMap((entry, i) => {
        const r = schema.safeParse(entry);
        if (r.success) return [r.data];
        errors.push(...zodErrors(file, r.error).map((e) => ({ ...e, path: `[${i}].${e.path}` })));
        return [];
      });
    } catch {
      errors.push({ file, path: "", message: "invalid JSON" });
      return [];
    }
  };

  const items = parseJsonArray("items.json", itemSchema);
  const quizzes = parseJsonArray("quizzes.json", quizSchema);
  const games = parseJsonArray("games.json", gameSchema);
  const assets = [...entries.entries()]
    .filter(([n]) => n.startsWith("assets/"))
    .map(([path, e]) => ({ path, data: new Uint8Array(e.getData()) }));

  if (!manifest) return { pkg: null, errors };
  const unitLessonIds = manifest.units?.flatMap((unit) => unit.lessonIds) ?? [];
  if (unitLessonIds.length > 0) {
    const rank = new Map<string, number>();
    unitLessonIds.forEach((id, index) => {
      if (!rank.has(id)) rank.set(id, index);
    });
    lessons.sort((a, b) =>
      (rank.get(a.frontmatter.id) ?? unitLessonIds.length + a.order) -
      (rank.get(b.frontmatter.id) ?? unitLessonIds.length + b.order),
    );
    lessons.forEach((lesson, order) => { lesson.order = order; });
  }
  const pkg: LoadedPackage = { manifest, lessons, items, quizzes, games, assets };
  errors.push(...validatePackage(pkg));
  errors.push(...validateMath(pkg));
  return errors.length ? { pkg: null, errors } : { pkg, errors: [] };
}

export function buildPackageZip(pkg: LoadedPackage): Buffer {
  const zip = new AdmZip();
  const add = (p: string, s: string | Uint8Array) =>
    zip.addFile(p, Buffer.isBuffer(s) ? s : Buffer.from(s as any));
  add("manifest.json", JSON.stringify(pkg.manifest, null, 2) + "\n");
  for (const l of pkg.lessons) {
    add(l.file, matter.stringify(l.body, l.frontmatter as object));
  }
  if (pkg.items.length) add("items.json", JSON.stringify(pkg.items, null, 2) + "\n");
  if (pkg.quizzes.length) add("quizzes.json", JSON.stringify(pkg.quizzes, null, 2) + "\n");
  if (pkg.games.length) add("games.json", JSON.stringify(pkg.games, null, 2) + "\n");
  for (const a of pkg.assets) add(a.path, a.data);
  return zip.toBuffer();
}
