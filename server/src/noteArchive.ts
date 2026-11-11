import { gzipSync } from "node:zlib";
import type { Note } from "@study/shared";
import { buildTar } from "./tar.js";

/** Longest slug in a file name; with the folder, id and extension the path stays under tar's 100 bytes. */
const SLUG_MAX = 60;
const FOLDER = "notes/";
/** Characters a YAML double-quoted scalar can hold as themselves; everything else is escaped. */
const UNSAFE = /[\\"]|[^\x20-\x7E\xA0-\u2027\u202A-\uD7FF\uE000-\uFEFE\uFF00-\uFFFD\u{10000}-\u{10FFFF}]/gu;
const ESCAPES: Record<string, string> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };

/**
 * Quotes a string as a YAML double-quoted scalar.
 * Args:
 *   value: Any string, including colons, quotes, newlines and control characters.
 * Returns:
 *   A single-line scalar that YAML parsers read back as exactly `value`.
 * Raises:
 *   None.
 */
function yamlString(value: string): string {
  return `"${value.replace(UNSAFE, (ch) => ESCAPES[ch] ?? `\\u${ch.codePointAt(0)!.toString(16).padStart(4, "0")}`)}"`;
}

/**
 * Derives a file-name slug from a note's first heading outside code fences, else its first non-blank line.
 * Args:
 *   body: The note's Markdown.
 * Returns:
 *   Lowercase ASCII letters, digits and single hyphens, at most 60 characters; "note" when nothing is left.
 * Raises:
 *   None.
 */
export function noteSlug(body: string): string {
  const lines = body.split(/\r?\n/);
  let fence: string | null = null; // the open code fence's marker; only a same-character, at-least-as-long one closes it
  const heading = lines.find((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (fence === null || (marker[0] === fence[0] && marker.length >= fence.length))) {
      fence = fence === null ? marker : null;
      return false;
    }
    return fence === null && /^ {0,3}#{1,6}[ \t]+\S/.test(line);
  });
  const source = heading ?? lines.find((line) => line.trim() !== "") ?? "";
  const slug = source.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "").slice(0, SLUG_MAX).replace(/-+$/, "");
  return slug || "note";
}

/**
 * Writes one note as Markdown: YAML front matter, then the body exactly as stored.
 * Args:
 *   note: A saved note, possibly orphaned.
 * Returns:
 *   The file's text. `package` and `lesson` appear only for attached notes, each title only while its content is in the library.
 * Raises:
 *   None.
 */
export function noteMarkdown(note: Note): string {
  const lines = ["---", `id: ${note.id}`, `created: ${yamlString(note.createdAt)}`, `updated: ${yamlString(note.updatedAt)}`,
    `orphaned: ${note.orphaned}`];
  const target = note.target;
  if (target) {
    lines.push("package:", `  id: ${yamlString(target.packageId)}`);
    if (target.packageTitle !== null) lines.push(`  title: ${yamlString(target.packageTitle)}`);
    if (target.lessonId !== null) {
      lines.push("lesson:", `  id: ${yamlString(target.lessonId)}`);
      if (target.lessonTitle !== null) lines.push(`  title: ${yamlString(target.lessonTitle)}`);
    }
  }
  return `${lines.join("\n")}\n---\n${note.body}`;
}

/**
 * Packs notes into a gzip-compressed tarball with one `notes/<id>-<slug>.md` file each.
 * Args:
 *   notes: The notes to include, in archive order.
 *   now: The export time, used as the folder's mtime; each file's mtime is its note's last update.
 * Returns:
 *   The .tgz bytes; with no notes, an archive holding only the empty folder.
 * Raises:
 *   RangeError: A note's update time is before 1970 or unparseable.
 */
export function buildNoteArchive(notes: Note[], now: Date): Buffer {
  return gzipSync(buildTar([
    { type: "directory", name: FOLDER, mtime: now },
    ...notes.map((note) => ({ type: "file" as const, name: `${FOLDER}${note.id}-${noteSlug(note.body)}.md`,
      mtime: new Date(note.updatedAt), data: Buffer.from(noteMarkdown(note), "utf8") })),
  ]));
}

/**
 * Names a notes download after the server's local calendar date.
 * Args:
 *   now: The export time.
 * Returns:
 *   `notes-YYYY-MM-DD.tgz`.
 * Raises:
 *   None.
 */
export function noteArchiveName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `notes-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.tgz`;
}
