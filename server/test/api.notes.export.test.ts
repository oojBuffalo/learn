import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Note } from "@study/shared";
import { createApp } from "../src/app.js";
import { readLesson } from "../src/frontmatter.js";
import { noteSlug } from "../src/noteArchive.js";
import { GOOD_FILES, V2_FILES, extractTgz, freshDb, makeZip } from "./helpers.js";
import type { Extracted } from "./helpers.js";

let app: ReturnType<typeof createApp>;
const T0 = "2026-10-01T10:00:00.000Z";
const T1 = "2026-10-03T08:15:30.000Z";
const LESSON = { packageId: "demo", lessonId: "intro" };
const PACKAGE_TITLE = 'Demo: "quoted" \\ back — #hash\nnew line\ttab \u2028 \u0085 \u007f \ufeff end';
const LESSON_TITLE = 'Intro: "one" - [two]\n# three';
const FILES = {
  ...GOOD_FILES,
  "manifest.json": JSON.stringify({ formatVersion: "1.0.0", id: "demo", title: PACKAGE_TITLE, version: "1" }),
  "lessons/01-intro.md": GOOD_FILES["lessons/01-intro.md"]!.toString().replace("title: Intro", `title: ${JSON.stringify(LESSON_TITLE)}`),
};
const at = (iso: string | Date) => vi.setSystemTime(new Date(iso));
const create = async (body: string, target: unknown = null) => {
  const res = await app.request("/api/notes", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ body, target }) });
  expect(res.status).toBe(201);
  return (await res.json()).note as Note;
};
const importFiles = async (files: Record<string, string | Buffer>) =>
  expect((await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(files)) })).status).toBe(201);
const download = async () => {
  const res = await app.request("/api/notes/export");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/gzip");
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
  return { res, files: extractTgz(bytes) };
};
/** Splits an exported file into its parsed front matter and the raw body bytes after it. */
const parse = (file: Extracted) => {
  expect(file.data.subarray(0, 4).toString("utf8")).toBe("---\n");
  const close = file.data.indexOf("\n---\n");
  expect(close).toBeGreaterThan(0);
  return { data: readLesson(file.data.subarray(0, close + 5).toString("utf8")).data, body: file.data.subarray(close + 5) };
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(T0);
  app = createApp(freshDb());
  await importFiles(FILES);
});
afterEach(() => { vi.useRealTimers(); });

it("downloads every note as Markdown with front matter and byte-exact bodies", async () => {
  const bodies = [
    "# Café: “quotes” & 😀\r\n\r\nUnicode — 日本語 🧠 é \u2028 end",
    "Line ✓ 😀 ".repeat(9_000),
    "plain first line\n\n## Second: heading\n\nmore",
  ];
  const standalone = await create(bodies[0]!);
  const pkg = await create(bodies[1]!, { packageId: "demo", lessonId: null });
  const lesson = await create(bodies[2]!, LESSON);
  at(T1);
  expect((await app.request(`/api/notes/${lesson.id}`, { method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: bodies[2] }) })).status).toBe(200);
  const { files } = await download();
  const names = [`notes/${standalone.id}-cafe-quotes.md`, `notes/${pkg.id}-line-line-line-line-line-line-line-line-line-line-line-line.md`,
    `notes/${lesson.id}-second-heading.md`];
  expect([...files.keys()]).toEqual(["notes", ...names]);
  expect(files.get("notes")!.dir).toBe(true);
  const base = { created: T0, updated: T0, orphaned: false };
  const expected = [
    { id: standalone.id, ...base },
    { id: pkg.id, ...base, package: { id: "demo", title: PACKAGE_TITLE } },
    { id: lesson.id, ...base, updated: T1, package: { id: "demo", title: PACKAGE_TITLE }, lesson: { id: "intro", title: LESSON_TITLE } },
  ];
  names.forEach((name, i) => {
    const file = files.get(name)!;
    const { data, body } = parse(file);
    expect(data).toEqual(expected[i]);
    expect(body.equals(Buffer.from(bodies[i]!, "utf8"))).toBe(true);
    expect(file.mtime).toBe(Date.parse(expected[i]!.updated) / 1000);
  });
  expect(Buffer.byteLength(bodies[1]!)).toBeGreaterThan(bodies[1]!.length);
  // Strict YAML parsers refuse raw control, C1 and line-separator characters, so they must be escaped, not just quoted.
  expect(files.get(names[1]!)!.data.toString("utf8").split("\n").slice(0, 8)).toEqual(["---", `id: ${pkg.id}`,
    `created: "${T0}"`, `updated: "${T0}"`, "orphaned: false", "package:", '  id: "demo"',
    String.raw`  title: "Demo: \"quoted\" \\ back — #hash\nnew line\ttab \u2028 \u0085 \u007f \ufeff end"`]);
});

it("names the download after the server's local date", async () => {
  for (const local of [new Date(2026, 9, 1, 0, 30), new Date(2026, 9, 1, 23, 30)]) {
    at(local);
    const { res } = await download();
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="notes-2026-10-01.tgz"');
  }
});

it("downloads a valid archive holding only the folder when there are no notes", async () => {
  const { files } = await download();
  expect([...files.keys()]).toEqual(["notes"]);
});

it("marks notes on removed content orphaned and keeps only the ids it no longer has titles for", async () => {
  const lesson = await create("Lesson note", LESSON);
  const pkg = await create("Package note", { packageId: "demo", lessonId: null });
  await importFiles(V2_FILES);
  const renamed = parse((await download()).files.get(`notes/${lesson.id}-lesson-note.md`)!).data;
  expect(renamed).toEqual({ id: lesson.id, created: T0, updated: T0, orphaned: true,
    package: { id: "demo", title: "Demo" }, lesson: { id: "intro" } });
  expect((await app.request("/api/packages/demo", { method: "DELETE" })).status).toBe(204);
  const { files } = await download();
  expect(parse(files.get(`notes/${lesson.id}-lesson-note.md`)!).data).toEqual({ id: lesson.id, created: T0, updated: T0,
    orphaned: true, package: { id: "demo" }, lesson: { id: "intro" } });
  expect(parse(files.get(`notes/${pkg.id}-package-note.md`)!).data).toEqual({ id: pkg.id, created: T0, updated: T0,
    orphaned: true, package: { id: "demo" } });
});

it("slugs the first heading, else the first line, as bounded lowercase ASCII", () => {
  expect(noteSlug("intro line\n# Résumé: Ünïcode — Notes!\n## later")).toBe("resume-unicode-notes");
  expect(noteSlug("\n\n  First line, not a #heading  \nsecond")).toBe("first-line-not-a-heading");
  expect(noteSlug("Intro text\n```sh\n# install\n```\n")).toBe("intro-text");
  expect(noteSlug("~~~\n# inside a fence\n~~~\n## Outside: it")).toBe("outside-it");
  expect(noteSlug("````md\n```\n# still fenced\n~~~\n````\n# After")).toBe("after");
  expect(noteSlug("Intro\n```md\n``` trailing text\n# Example\n```\n# Actual title")).toBe("actual-title");
  expect(noteSlug("``` not `a fence`\n# Real")).toBe("real");
  for (const body of ["😀 🧠\n# —", "日本語", "#\n\n"]) expect(noteSlug(body)).toBe("note");
  const long = noteSlug(`# ${"word ".repeat(40)}`);
  expect(long.length).toBeLessThanOrEqual(60);
  expect(long).toMatch(/^word(-word)*$/);
});
