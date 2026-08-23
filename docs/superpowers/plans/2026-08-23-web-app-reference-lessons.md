# Web App Reference Lessons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Web App Reference Markdown library into a single importable study-app package — 57 lessons across 12 units, rewritten as teaching material, with 608 items, 12 quizzes and 24+ games.

**Architecture:** The package is authored in folder form under `content/web-app-reference/` so it stays diffable. A folder validator reuses the server's real import path (`readPackageZip`) by zipping the folder in memory, so offline validation is byte-identical to what `POST /api/packages/import` would accept. Content is then written unit by unit, validating after each.

**Tech Stack:** TypeScript, Zod schemas from `@study/shared`, `adm-zip`, `gray-matter`, `tsx`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-web-app-reference-lessons-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

**Source library:** `/Users/ooj/Documents/web-app-reference/docs` — read-only. Never modify it. Pass its path as an argument; do not hardcode it in committed source.

**Package identity:** `formatVersion` `1.0.0`, manifest `id` `web-app-reference`, `version` `1.0.0`, `language` `en`.

**Naming:**
- Lesson file: `lessons/NN-MM-<slug>.md` — `NN` unit number, `MM` position within unit, `<slug>` the source filename stem. Example: `01-01-internet-and-the-web.md`.
- Lesson `id`: the source filename stem, unchanged (`internet-and-the-web`).
- Item `id`: `<lesson-id>-<kind><n>` where kind is one of `mc`, `ms`, `fb`, `sa`, `ord`, `mat`, `card`. Example: `internet-and-the-web-mc1`. Glossary flashcards belong to no lesson and use `glossary-<term-slug>` instead.
- Unit `id`: section directory name minus its number prefix (`web-foundations`); `00-start-here` becomes `start-here`.
- All ids must match `/^[a-z0-9][a-z0-9_-]*$/i` and be at most 64 characters.

**Per-lesson content:** 5 inline activities referenced by `::activity{id="…"}` in body order, plus 5 flashcards that are *not* referenced in the body (they feed the scheduler). Target 700–900 words.

**Lesson template** — headings are lesson-specific wording, not these literal labels:

```
---
id, title, summary, objectives, estimatedMinutes, difficulty, tags, prerequisites
---

## <concrete opening>    a recognisable situation the concept explains, never a definition
## <the core model>      the one idea the lesson turns on, made concrete
::activity{1}
## <how it works>        mechanisms in dependency order
::activity{2}
::activity{3}
## <worked example>      one trace followed all the way through
::activity{4}
## <choosing>            tradeoffs framed as decisions with consequences
## <when it breaks>      failure modes as diagnosable symptoms
::activity{5}
## Sources
```

**Per-unit type constraint:** each unit must contain at least one `matching` item and at least two `multiple-choice` or `multi-select` items, or its games have no compatible source and validation fails.

**Fidelity contract:**
1. Every technical claim traces to its source doc. The rewrite reorganises and expands explanation; it never adds assertions the library does not make.
2. Footnoted citations survive into `## Sources` as a Markdown link list, preserving title, URL and accessed date.
3. Worked examples are new prose, not new facts, and stay technology-neutral.

**Renderer constraints:**
- `::activity{id="x"}` alone on its own line at column 0, blank line either side.
- No raw HTML, no HTML comments.
- Only `##` and `###`. No `#` — the title lives in frontmatter.
- Table cells must be a few words; they never wrap.
- Flashcard `front` is one short line; `back` is a single paragraph with no lists.
- Per-option `feedback` only surfaces for `multiple-choice`; anything a reader must see goes in `explanation`.
- No footnotes and no mermaid — both render as literal text.
- Every schema is strict: one unknown key is a hard failure.

**The Unit Procedure** — tasks 5 through 15 each apply this to one unit:
1. Read every source doc for the unit in the order its `index.md` lists.
2. Write one lesson per doc against the lesson template, honouring the fidelity contract.
3. Write 5 inline activities and 5 flashcards per lesson into `items.json`, tagged with the unit id.
4. Confirm the unit satisfies the per-unit type constraint.
5. Add one quiz to `quizzes.json`: id `quiz-<unit-id>`, `passThreshold` 0.75, listing that unit's inline activities only — flashcards are not quizzable.
6. Add two games to `games.json`: `game-<unit-id>-match` (`matching`, sourced by unit tag) and `game-<unit-id>-speed` (`timed-round`, `timeLimitSeconds` 60, sourced by unit tag). Where the unit has three or more `ordering` items, add a third: `game-<unit-id>-order` (`order-it`, sourced by unit tag).
7. Run `npm run validate:content -- content/web-app-reference` and fix every reported error.
8. Commit.

**Validation command, used after every content task:**

```bash
npm run validate:content -- content/web-app-reference
```

---

### Task 1: Folder validator and CLI

Validates a package folder through the server's real import path, so authoring feedback matches the import endpoint exactly.

**Files:**
- Create: `server/src/packageFolder.ts`
- Create: `server/src/validateContent.ts`
- Create: `server/test/packageFolder.test.ts`
- Modify: `package.json` (root, add `validate:content` script)

**Interfaces:**
- Consumes: `readPackageZip(zipBuf: Buffer): { pkg: LoadedPackage | null; errors: PackageError[] }` from `server/src/zip.ts`.
- Produces: `readPackageFolder(dir: string): { pkg: LoadedPackage | null; errors: PackageError[] }` — used by every later task via the CLI.

- [ ] **Step 1: Write the failing test**

Create `server/test/packageFolder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPackageFolder } from "../src/packageFolder.js";

describe("readPackageFolder", () => {
  it("accepts the authored matching-and-recommendation package", () => {
    const { pkg, errors } = readPackageFolder("content/matching-and-recommendation");
    expect(errors).toEqual([]);
    expect(pkg?.lessons.length).toBeGreaterThan(0);
    expect(pkg?.items.length).toBeGreaterThan(0);
  });

  it("reports a missing manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "pkg-"));
    mkdirSync(join(dir, "lessons"));
    writeFileSync(join(dir, "lessons", "01-a.md"), "---\nid: a\ntitle: A\n---\n\nBody\n");
    const { pkg, errors } = readPackageFolder(dir);
    rmSync(dir, { recursive: true, force: true });
    expect(pkg).toBeNull();
    expect(errors).toContainEqual({
      file: "manifest.json",
      path: "",
      message: "missing manifest.json",
    });
  });

  it("reports an unreadable folder", () => {
    const { pkg, errors } = readPackageFolder("content/does-not-exist");
    expect(pkg).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/test/packageFolder.test.ts`
Expected: FAIL — cannot resolve `../src/packageFolder.js`.

- [ ] **Step 3: Write the implementation**

Create `server/src/packageFolder.ts`:

```ts
import AdmZip from "adm-zip";
import type { LoadedPackage, PackageError } from "@study/shared";
import { readPackageZip } from "./zip.js";

/**
 * Validate a package folder using the exact code path the import endpoint uses.
 * The folder is zipped in memory so authoring feedback cannot drift from import.
 */
export function readPackageFolder(dir: string): {
  pkg: LoadedPackage | null;
  errors: PackageError[];
} {
  const zip = new AdmZip();
  try {
    zip.addLocalFolder(dir);
  } catch {
    return {
      pkg: null,
      errors: [{ file: dir, path: "", message: "not a readable package folder" }],
    };
  }
  return readPackageZip(zip.toBuffer());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/test/packageFolder.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the CLI**

Create `server/src/validateContent.ts`:

```ts
import { readPackageFolder } from "./packageFolder.js";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: npm run validate:content -- <package-dir>...");
  process.exit(2);
}

let failed = false;
for (const dir of dirs) {
  const { pkg, errors } = readPackageFolder(dir);
  if (errors.length > 0) {
    failed = true;
    console.error(`FAIL ${dir} — ${errors.length} error(s)`);
    for (const e of errors) {
      console.error(`  ${e.file} · ${e.path || "-"} · ${e.message}`);
    }
  } else {
    const p = pkg!;
    console.log(
      `OK   ${dir} — ${p.lessons.length} lessons, ${p.items.length} items, ` +
        `${p.quizzes.length} quizzes, ${p.games.length} games`,
    );
  }
}
process.exit(failed ? 1 : 0);
```

Add to the root `package.json` `scripts` block:

```json
"validate:content": "tsx server/src/validateContent.ts"
```

- [ ] **Step 6: Run the CLI against the existing package**

Run: `npm run validate:content -- content/matching-and-recommendation`
Expected: `OK   content/matching-and-recommendation — 1 lessons, 22 items, 1 quizzes, 0 games`

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add server/src/packageFolder.ts server/src/validateContent.ts server/test/packageFolder.test.ts package.json
git commit -m "feat: validate content package folders through the import path"
```

---

### Task 2: Package skeleton

Locks every id and the reading order before any prose is written, and proves the unit/game constraints are satisfiable.

**Files:**
- Create: `scripts/gen-skeleton.mjs`
- Create: `content/web-app-reference/manifest.json` (generated)
- Create: `content/web-app-reference/lessons/*.md` (57 generated stubs)
- Create: `content/web-app-reference/items.json` (generated, `[]`)

**Interfaces:**
- Consumes: nothing from earlier tasks except the `validate:content` script.
- Produces: the 57 lesson ids and the 12-unit manifest that every later task writes into.

- [ ] **Step 1: Write the generator**

Create `scripts/gen-skeleton.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node scripts/gen-skeleton.mjs <web-app-reference/docs>");
  process.exit(2);
}
const OUT = "content/web-app-reference";

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
    // Only real topic docs: they all carry a "## Summary" heading.
    .filter((slug) => {
      try {
        return readFileSync(join(dir, `${slug}.md`), "utf8").includes("\n## Summary");
      } catch {
        return false;
      }
    });
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
```

- [ ] **Step 2: Run the generator**

Run: `node scripts/gen-skeleton.mjs /Users/ooj/Documents/web-app-reference/docs`
Expected: `units: 12, lessons: 57`, and a per-unit breakdown of 1, 4, 4, 6, 5, 6, 5, 5, 5, 6, 5, 5.

- [ ] **Step 3: Verify the counts**

Run: `ls content/web-app-reference/lessons | wc -l`
Expected: `57`

If the total is not 57, stop and reconcile against the spec's inventory table before continuing.

- [ ] **Step 4: Validate the skeleton**

Run: `npm run validate:content -- content/web-app-reference`
Expected: `OK   content/web-app-reference — 57 lessons, 0 items, 0 quizzes, 0 games`

- [ ] **Step 5: Check the unit-00 game constraint is satisfiable**

Unit `start-here` holds one lesson (`anatomy-of-a-web-app`) and therefore only five inline activities to cover both game templates.

Run: `node -e "const m=require('./content/web-app-reference/manifest.json');const u=m.units.find(x=>x.id==='start-here');console.log(u.id,u.lessonIds.length)"`
Expected: `start-here 1`

Task 5 must therefore allocate that lesson's five inline activities as at least one `matching` and at least two `multiple-choice`. If a later task cannot honour that, the fallback is to source unit `start-here`'s games by `itemIds` drawn from another unit rather than by tag.

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-skeleton.mjs content/web-app-reference
git commit -m "feat: generate Web App Reference package skeleton"
```

---

### Task 3: Pilot lesson — internet-and-the-web

The voice-calibration task. One lesson, complete, reviewed hard before 56 more are written in its image.

**Files:**
- Modify: `content/web-app-reference/lessons/01-01-internet-and-the-web.md`
- Modify: `content/web-app-reference/items.json`

**Interfaces:**
- Consumes: the lesson id `internet-and-the-web` and unit tag `web-foundations` from Task 2.
- Produces: the reference voice, activity placement and item-id scheme every later lesson follows.

- [ ] **Step 1: Read the source doc**

Run: `cat /Users/ooj/Documents/web-app-reference/docs/01-web-foundations/internet-and-the-web.md`

Note its claims: the internet/web layering distinction, the reasoning stack, HTTP's statelessness (cited to RFC 9110), the TLS-termination and intermediary tradeoffs, and the "it works by IP" diagnostic.

- [ ] **Step 2: Write the lesson**

Replace the stub. The opening must be a situation, not a definition — the source's own "It works by IP" diagnostic is the strongest hook available. Illustrative opening:

```markdown
---
id: internet-and-the-web
title: Internet and the Web
summary: Why a reachable server can still fail to serve a page, and what the layers underneath actually promise.
objectives:
  - Separate the internet as connectivity from the web as an application system
  - Read the layer stack as a reasoning tool rather than an implementation claim
  - Use layer boundaries to narrow where a failure lives
estimatedMinutes: 12
difficulty: beginner
tags: [web-foundations]
---

## The page is down, but the server answers

A colleague reports that the site is unreachable. You ping the host and it
replies. You open a connection on port 443 and it accepts. By every measure you
have to hand, the machine is fine — and the page still does not load.

Nothing here is contradictory. Each of those checks proves something about a
different layer, and none of them proves the one the user cares about.

## Connectivity is not an application

The internet is a network of interconnected networks: it moves packets between
interfaces. The web is an application system built on that connectivity, using
URLs to identify resources, HTTP to exchange representations, and browsers as
general-purpose clients.

...
```

Continue through the template: the reasoning stack as `## The stack is a reasoning tool` (reuse the source's ```text block verbatim — it renders correctly in mono), mechanisms in dependency order, a worked example tracing `https://shop.example/orders`, the TLS-termination and intermediary tradeoffs, and failure modes framed as what each symptom rules out. Close with:

```markdown
## Sources

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) (accessed 2026-07-18)
```

Drop the source's `## Related topics` — its relative links do not resolve inside the app.

- [ ] **Step 3: Write the ten items**

Append to `items.json`. Five inline, ids `internet-and-the-web-mc1`, `-mc2`, `-ord1`, `-mat1`, `-sa1`, matching the five `::activity` directives in body order; five flashcards `-card1` … `-card5`. Every item tagged `web-foundations`. Illustrative shapes:

```json
[
  {
    "id": "internet-and-the-web-mc1",
    "type": "multiple-choice",
    "prompt": "A host answers ping and accepts a connection on port 443, but the page will not load. What has been ruled out?",
    "options": [
      { "id": "a", "text": "Nothing — these checks prove the application works", "feedback": "They prove packets arrive and a transport connection opens, which is a claim about lower layers only." },
      { "id": "b", "text": "Routing and basic reachability, but not HTTP behaviour", "correct": true },
      { "id": "c", "text": "DNS, because the host responded", "feedback": "You reached it by address; name resolution was never exercised." }
    ],
    "explanation": "Each check proves a property of one layer. Reachability says nothing about whether HTTP semantics are correct.",
    "tags": ["web-foundations"]
  },
  {
    "id": "internet-and-the-web-ord1",
    "type": "ordering",
    "prompt": "Order the stack from the application downward.",
    "steps": [
      { "id": "s1", "text": "HTTP messages" },
      { "id": "s2", "text": "TLS protection" },
      { "id": "s3", "text": "TCP or QUIC transport" },
      { "id": "s4", "text": "IP routing" }
    ],
    "tags": ["web-foundations"]
  },
  {
    "id": "internet-and-the-web-card1",
    "type": "flashcard",
    "front": "Internet vs web",
    "back": "The internet is connectivity between networks; the web is an application system built on it using URLs, HTTP and browsers.",
    "reverse": true,
    "tags": ["web-foundations"]
  }
]
```

The `matching` item is required here — it is the only lesson in this task and unit `web-foundations` needs one eventually, but placing it now satisfies the constraint early.

- [ ] **Step 4: Validate**

Run: `npm run validate:content -- content/web-app-reference`
Expected: `OK   content/web-app-reference — 57 lessons, 10 items, 0 quizzes, 0 games`

- [ ] **Step 5: Check the word count**

Run: `wc -w content/web-app-reference/lessons/01-01-internet-and-the-web.md`
Expected: between 700 and 900.

- [ ] **Step 6: Commit**

```bash
git add content/web-app-reference
git commit -m "content: write internet-and-the-web lesson"
```

- [ ] **Step 7: Stop for review**

This is a review gate. Present the lesson and its items to the user before writing any further lesson. Voice, activity density and item quality are all being judged here; a correction now saves 56 rewrites.

---

### Task 4: Finish unit 01 — Web foundations

**Files:**
- Modify: `content/web-app-reference/lessons/01-02-request-response-lifecycle.md`
- Modify: `content/web-app-reference/lessons/01-03-urls-dns-http-and-tls.md`
- Modify: `content/web-app-reference/lessons/01-04-clients-servers-and-resources.md`
- Modify: `content/web-app-reference/items.json`
- Create: `content/web-app-reference/quizzes.json`
- Create: `content/web-app-reference/games.json`

**Interfaces:**
- Consumes: the voice and item-id scheme established in Task 3.
- Produces: `quizzes.json` and `games.json`, which every later unit task appends to.

- [ ] **Step 1: Apply The Unit Procedure**

Unit id `web-foundations`. Source docs, in order: `request-response-lifecycle.md`, `urls-dns-http-and-tls.md`, `clients-servers-and-resources.md`.

`request-response-lifecycle.md` carries a mermaid flowchart. Redraw it as an ASCII diagram in a plain fenced block — mermaid renders as literal text. Keep the same nodes and edges.

`urls-dns-http-and-tls.md` carries a table of URL parts. Keep cells to a few words; they never wrap.

- [ ] **Step 2: Create the quiz file**

Create `content/web-app-reference/quizzes.json`:

```json
[
  {
    "id": "quiz-web-foundations",
    "title": "Web foundations check",
    "items": [
      "internet-and-the-web-mc1",
      "internet-and-the-web-ord1",
      "request-response-lifecycle-mc1",
      "urls-dns-http-and-tls-mc1",
      "clients-servers-and-resources-mc1"
    ],
    "passThreshold": 0.75
  }
]
```

Replace the item ids with the actual inline activity ids written in Step 1. Flashcards must not appear — validation rejects them.

- [ ] **Step 3: Create the games file**

Create `content/web-app-reference/games.json`:

```json
[
  {
    "id": "game-web-foundations-match",
    "template": "matching",
    "title": "Web foundations — match them up",
    "source": { "tags": ["web-foundations"] }
  },
  {
    "id": "game-web-foundations-speed",
    "template": "timed-round",
    "title": "Web foundations — quick fire",
    "source": { "tags": ["web-foundations"] },
    "settings": { "timeLimitSeconds": 60 }
  }
]
```

- [ ] **Step 4: Validate**

Run: `npm run validate:content -- content/web-app-reference`
Expected: `OK   content/web-app-reference — 57 lessons, 40 items, 1 quizzes, 2 games`

- [ ] **Step 5: Commit**

```bash
git add content/web-app-reference
git commit -m "content: write web-foundations unit"
```

- [ ] **Step 6: Import against a running server**

In one shell: `npm start -w server`
In another:

```bash
cd content/web-app-reference && zip -r /tmp/war.zip manifest.json lessons items.json quizzes.json games.json && cd -
curl -s -o /dev/null -w '%{http_code}\n' --data-binary @/tmp/war.zip http://localhost:4321/api/packages/import
```

Expected: `201`

- [ ] **Step 7: Stop for review**

Second review gate. The user reviews the completed pilot unit in the running app before the remaining eleven units are written.

---

### Tasks 5–15: Remaining units

Each task applies **The Unit Procedure** to one unit and ends with its own validation and commit. They are independent and may be executed in any order after Task 4, though ascending order keeps `prerequisites` easy to wire.

Expected item count after each task is the running total: every lesson contributes exactly 10 items.

| Task | Unit id | Section | Lessons | Items added | Notes |
| --- | --- | --- | --- | --- | --- |
| 5 | `start-here` | `00-start-here` | 1 | 10 | Mermaid diagram to redraw as ASCII. Needs ≥1 matching and ≥2 multiple-choice among only 5 inline activities. |
| 6 | `browser-platform` | `02-browser-platform` | 4 | 40 | `rendering-and-the-dom.md` carries a mermaid diagram to redraw. |
| 7 | `frontend` | `03-frontend` | 6 | 60 | |
| 8 | `backend` | `04-backend` | 5 | 50 | |
| 9 | `data` | `05-data` | 6 | 60 | |
| 10 | `apis-and-integration` | `06-apis-and-integration` | 5 | 50 | |
| 11 | `security` | `07-security` | 5 | 50 | |
| 12 | `quality-and-observability` | `08-quality-and-observability` | 5 | 50 | |
| 13 | `delivery-and-operations` | `09-delivery-and-operations` | 6 | 60 | |
| 14 | `architecture` | `10-architecture` | 5 | 50 | |
| 15 | `technology-landscape` | `11-technology-landscape` | 5 | 50 | |

Per task:

- [ ] **Step 1:** Read the unit's `index.md` for reading order and its `## Prerequisites` line for cross-unit wiring.
- [ ] **Step 2:** Apply The Unit Procedure steps 1–6.
- [ ] **Step 3:** Set each lesson's `prerequisites` frontmatter to the lesson ids named by the source's prerequisites, if any. A prerequisite must be an existing lesson id or validation fails.
- [ ] **Step 4:** Run `npm run validate:content -- content/web-app-reference` and fix every error.
- [ ] **Step 5:** Commit with `git commit -m "content: write <unit-id> unit"`.

After Task 15 the totals are 57 lessons, 570 items, 12 quizzes, 24 games.

---

### Task 16: Glossary flashcards

**Files:**
- Modify: `content/web-app-reference/items.json`

**Interfaces:**
- Consumes: nothing; these items are referenced by no lesson.
- Produces: 38 flashcards tagged `glossary`, available to free study and the scheduler.

- [ ] **Step 1: Read the glossary**

Run: `cat /Users/ooj/Documents/web-app-reference/docs/glossary.md`

It holds 38 terms as `- **Term:** definition.` bullets across three alphabetical groups.

- [ ] **Step 2: Write the flashcards**

Append one flashcard per term. Id is `glossary-<term-slug>`. `front` is the term alone; `back` is the definition as a single paragraph. Set `reverse: true` so both directions are scheduled. Example:

```json
{
  "id": "glossary-idempotency",
  "type": "flashcard",
  "front": "Idempotency",
  "back": "The property that repeating one logical operation does not repeat its intended effect.",
  "reverse": true,
  "tags": ["glossary"]
}
```

- [ ] **Step 3: Verify the count**

Run: `node -e "const i=require('./content/web-app-reference/items.json');console.log(i.filter(x=>x.tags?.includes('glossary')).length)"`
Expected: `38`

- [ ] **Step 4: Validate**

Run: `npm run validate:content -- content/web-app-reference`
Expected: `OK   content/web-app-reference — 57 lessons, 608 items, 12 quizzes, 24 games`

- [ ] **Step 5: Commit**

```bash
git add content/web-app-reference
git commit -m "content: add glossary flashcards"
```

---

### Task 17: Whole-package verification

**Files:**
- Modify: `content/README.md` (document the new package)

**Interfaces:**
- Consumes: the finished package.
- Produces: a verified, importable package and a documented authoring entry.

- [ ] **Step 1: Validate the finished package**

Run: `npm run validate:content -- content/web-app-reference content/matching-and-recommendation`
Expected: both `OK`; the reference package reports 57 lessons, 608 items, 12 quizzes, 24 games.

- [ ] **Step 2: Confirm no renderer violations**

```bash
cd content/web-app-reference/lessons
grep -ln '^# ' *.md            # expect no output — H1 collides with the page title
grep -ln '<!--\|<[a-z][a-z]*>' *.md   # expect no output — raw HTML renders literally
grep -ln '\[\^' *.md           # expect no output — footnotes are unsupported
grep -ln '```mermaid' *.md     # expect no output — mermaid renders literally
cd -
```

The H1, footnote and mermaid checks must print nothing; any filename listed is a violation to fix. The raw-HTML check needs judgement: an HTML tag inside a fenced code block is fine and renders as code, so inspect each hit rather than treating it as a failure.

- [ ] **Step 3: Confirm every activity directive is well formed**

```bash
grep -hn '::activity' content/web-app-reference/lessons/*.md | grep -v '^\s*[0-9]*:::activity{id="[a-z0-9-]*"}$' || true
```

Expected: no output. Anything printed is a directive that is indented or has trailing content, which breaks the surrounding block.

- [ ] **Step 4: Import into a running server**

In one shell: `npm start -w server`
In another:

```bash
cd content/web-app-reference && zip -r /tmp/war.zip manifest.json lessons items.json quizzes.json games.json && cd -
curl -s -w '\n%{http_code}\n' --data-binary @/tmp/war.zip http://localhost:4321/api/packages/import
```

Expected: `201` and a `packageId` of `web-app-reference`.

- [ ] **Step 5: Spot-check in the browser**

Open `http://localhost:4321`, enter the package, and confirm: units appear in order, a lesson renders with its activities inline, a quiz runs, and both games start.

- [ ] **Step 6: Document the package**

Add a short entry to `content/README.md` naming the package, its source library, and the fact that it is generated-then-hand-written — the skeleton comes from `scripts/gen-skeleton.mjs`, the prose does not.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add content/README.md
git commit -m "docs: document the Web App Reference package"
```
