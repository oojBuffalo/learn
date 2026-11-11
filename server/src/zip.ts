import AdmZip from "adm-zip";
import {
  itemSchema, lessonFrontmatterSchema, manifestSchema, quizSchema, gameSchema,
  validatePackage,
} from "@study/shared";
import type { LoadedLesson, LoadedPackage, PackageError } from "@study/shared";
import { z } from "zod";
import { validateImages } from "./imageCheck.js";
import { validateMath } from "./mathCheck.js";
import { readLesson, writeLesson } from "./frontmatter.js";

function zodErrors(file: string, e: z.ZodError): PackageError[] {
  return e.issues.map((i) => ({ file, path: i.path.join("."), message: i.message }));
}

export function readPackageZip(zipBuf: Buffer): { pkg: LoadedPackage | null; errors: PackageError[] } {
  const errors: PackageError[] = [];
  let entries: Map<string, AdmZip.IZipEntry>;
  try {
    // adm-zip reads the central directory lazily, on the first getEntries().
    const zip = new AdmZip(zipBuf);
    entries = new Map(zip.getEntries().filter((e) => !e.isDirectory).map((e) => [e.entryName, e]));
  } catch {
    return { pkg: null, errors: [{ file: "(zip)", path: "", message: "not a readable zip archive" }] };
  }
  // getData() inflates the entry and checks its CRC, so a corrupt entry throws here.
  // undefined: no such entry. null: unreadable, and already reported.
  const read = (name: string): Buffer | null | undefined => {
    const entry = entries.get(name);
    if (!entry) return undefined;
    try {
      return entry.getData();
    } catch {
      errors.push({ file: name, path: "", message: "unreadable entry" });
      return null;
    }
  };
  const text = (name: string) => {
    const bytes = read(name);
    return bytes ? bytes.toString("utf8") : bytes;
  };

  const manifestRaw = text("manifest.json");
  if (manifestRaw === undefined) {
    return { pkg: null, errors: [{ file: "manifest.json", path: "", message: "missing manifest.json" }] };
  }
  let manifest: LoadedPackage["manifest"] | null = null;
  if (manifestRaw !== null) {
    try {
      const parsed = manifestSchema.safeParse(JSON.parse(manifestRaw));
      if (parsed.success) manifest = parsed.data;
      else errors.push(...zodErrors("manifest.json", parsed.error));
    } catch {
      errors.push({ file: "manifest.json", path: "", message: "invalid JSON" });
    }
  }

  const lessons: LoadedLesson[] = [];
  const lessonFiles = [...entries.keys()].filter((n) => /^lessons\/[^/]+\.md$/.test(n)).sort();
  if (lessonFiles.length === 0) errors.push({ file: "lessons/", path: "", message: "package has no lessons" });
  lessonFiles.forEach((file, order) => {
    const raw = text(file);
    if (raw == null) return;
    try {
      const { data, content } = readLesson(raw);
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
    if (raw == null) return [];
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
  const assets = [...entries.keys()]
    .filter((n) => n.startsWith("assets/"))
    .flatMap((path) => {
      const bytes = read(path);
      return bytes ? [{ path, data: new Uint8Array(bytes) }] : [];
    });

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
  errors.push(...validateImages(pkg));
  return errors.length ? { pkg: null, errors } : { pkg, errors: [] };
}

export function buildPackageZip(pkg: LoadedPackage): Buffer {
  const zip = new AdmZip();
  const add = (p: string, s: string | Uint8Array) =>
    zip.addFile(p, Buffer.isBuffer(s) ? s : Buffer.from(s as any));
  add("manifest.json", JSON.stringify(pkg.manifest, null, 2) + "\n");
  for (const l of pkg.lessons) {
    add(l.file, writeLesson(l.frontmatter as object, l.body));
  }
  if (pkg.items.length) add("items.json", JSON.stringify(pkg.items, null, 2) + "\n");
  if (pkg.quizzes.length) add("quizzes.json", JSON.stringify(pkg.quizzes, null, 2) + "\n");
  if (pkg.games.length) add("games.json", JSON.stringify(pkg.games, null, 2) + "\n");
  for (const a of pkg.assets) add(a.path, a.data);
  return zip.toBuffer();
}
