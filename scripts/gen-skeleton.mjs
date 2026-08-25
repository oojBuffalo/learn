import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node scripts/gen-skeleton.mjs <web-app-reference/docs>");
  process.exit(2);
}
const OUT = "content/web-app-reference";

// This script is bootstrap-only, and every write below is destructive: it
// replaces each lesson body with "Stub.", truncates items.json to [], and
// rewrites the manifest. Refuse to run once the package has been written.
{
  let existing = null;
  try {
    existing = readFileSync(join(OUT, "items.json"), "utf8");
  } catch {
    // No items.json yet: bootstrapping is exactly what this script is for.
  }
  if (existing !== null && existing.trim() !== "[]") {
    throw new Error(
      `${join(OUT, "items.json")} is already written, so ${OUT} is not a skeleton any more. ` +
        "gen-skeleton is bootstrap-only: running it now would overwrite every lesson " +
        'body with "Stub." and truncate items.json back to []. It also never touches ' +
        "quizzes.json or games.json, so those would be left referencing item ids that " +
        "no longer exist. Delete the package deliberately if you really mean to " +
        "regenerate the skeleton.",
    );
  }
}

const sections = readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d\d-/.test(d.name))
  .map((d) => d.name)
  .sort();

const units = [];
const lessons = [];

for (const section of sections) {
  const dir = join(SRC, section);
  const index = readFileSync(join(dir, "index.md"), "utf8");
  const title = (index.match(/^#\s+(.+)$/m) ?? [])[1];
  if (!title) throw new Error(`${section}/index.md has no title`);

  // Reading order comes from the "Read this section" bullet list.
  const listBlock = index.split(/^## Read this section$/m)[1] ?? "";
  const ordered = [...listBlock.split(/^## /m)[0].matchAll(/\]\(([^)]+\.md)\)/g)]
    .map((m) => basename(m[1], ".md"))
    // Only real topic docs: they all carry a "## Summary" heading. A read error
    // is a broken link in the index, not a non-topic doc — let it surface,
    // because swallowing it silently produces a short unit and no diagnostic.
    .filter((slug) => readFileSync(join(dir, `${slug}.md`), "utf8").includes("\n## Summary"));
  if (ordered.length === 0) throw new Error(`${section}: no topic docs found`);

  const unitId = section.replace(/^\d\d-/, "");
  units.push({ id: unitId, title, lessonIds: ordered });

  ordered.forEach((slug, i) => {
    const src = readFileSync(join(dir, `${slug}.md`), "utf8");
    const docTitle = (src.match(/^#\s+(.+)$/m) ?? [])[1] ?? slug;
    lessons.push({
      file: `${section.slice(0, 2)}-${String(i + 1).padStart(2, "0")}-${slug}.md`,
      id: slug,
      title: docTitle,
      unitId,
    });
  });
}

mkdirSync(join(OUT, "lessons"), { recursive: true });

writeFileSync(
  join(OUT, "manifest.json"),
  JSON.stringify(
    {
      formatVersion: "1.0.0",
      id: "web-app-reference",
      title: "Web App Reference",
      version: "1.0.0",
      description:
        "A whole-system tour of web applications: follow one user action from the browser, across networks and application code, into storage and operations, and back.",
      language: "en",
      tags: ["web", "systems", "architecture"],
      objectives: [
        "Trace a browser action end to end without treating the network or the server as a black box",
        "Place validation, authorization, invariants and persistence at deliberate boundaries",
        "Read an architecture as a set of tradeoffs rather than a set of tools",
        "Connect releases and telemetry to user-visible objectives",
      ],
      units,
    },
    null,
    2,
  ) + "\n",
);

for (const l of lessons) {
  const fm = [
    "---",
    `id: ${l.id}`,
    `title: ${JSON.stringify(l.title)}`,
    `tags: [${l.unitId}]`,
    "---",
    "",
    "Stub.",
    "",
  ].join("\n");
  writeFileSync(join(OUT, "lessons", l.file), fm);
}

writeFileSync(join(OUT, "items.json"), "[]\n");

console.log(`units: ${units.length}, lessons: ${lessons.length}`);
for (const u of units) console.log(`  ${u.id}: ${u.lessonIds.length}`);
