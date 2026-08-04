# Study App — Stage 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working local study app: portable package format (Zod-validated zip of Markdown + JSON), import/export, library, lesson player with inline exercises, and spaced-repetition flashcards with a due queue and free study.

**Architecture:** npm-workspaces TypeScript monorepo. `shared/` holds the single definition of the package format plus all pure logic (validation, answer checking, scheduling). `server/` (Hono + better-sqlite3) imports/exports packages and owns all user state; answer checking happens server-side. `web/` (Vite + React) is a thin player over the JSON API. Content tables and user-state tables never mix; user state references content by stable IDs and survives re-import.

**Tech Stack:** Node ≥ 20, TypeScript 5 (strict), Zod 3, Hono 4, better-sqlite3 11, adm-zip, gray-matter, Vitest 2, Vite 6, React 18, react-router-dom 7, react-markdown 9, Playwright (e2e only).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-study-app-design.md`. On any conflict, the spec wins.
- Server listens on `localhost:4321`; SQLite file at `data/study.db` (override dir with env `STUDY_DATA_DIR`); WAL mode; writes in transactions.
- Package `formatVersion` for this stage is exactly `"1.0.0"`.
- IDs (package, lesson, item, quiz, game, option, step) match `/^[a-z0-9][a-z0-9_-]*$/i`, max 64 chars.
- Unknown fields are **rejected** (Zod `.strict()` everywhere); deliberate extensions go in `meta`.
- Import is all-or-nothing (one SQLite transaction); errors reported as a list of `{file, path, message}`.
- API error shape, always: `{ "error": { "code": string, "message": string, "details"?: unknown } }`.
- All answer checking and scheduling logic lives in `shared/` and runs on the server — the client never decides correctness.
- Difficulty enum everywhere: `"beginner" | "intermediate" | "advanced"`. Item `shuffle` defaults `true`; short-answer `match` defaults `"fold"` (trim + case-insensitive + accent-insensitive).
- TDD: every task writes the failing test first. Commit after every green test cycle. Plain conventional commit subjects (`feat:`, `test:`, `chore:`); **no AI-attribution lines in commit messages.**
- ESM everywhere (`"type": "module"` in every package.json).

## File Structure

```
package.json                 # workspaces root: shared, server, web
tsconfig.base.json           # strict base config all workspaces extend
shared/src/ids.ts            # ID regex + slug helpers
shared/src/items.ts          # item discriminated union (Zod) + Item types
shared/src/packageSchema.ts  # manifest, lesson frontmatter, quiz, game schemas
shared/src/lessonBody.ts     # splitLessonBody(): markdown ⇄ ::activity segments
shared/src/validatePackage.ts# LoadedPackage type + referential-integrity validation
shared/src/checking.ts       # checkAnswer(item, answer) per item type
shared/src/scheduler.ts      # SM-2-style schedule(state, rating, now)
shared/src/index.ts          # re-exports (the workspace's public interface)
shared/test/*.test.ts
server/src/db.ts             # open DB, migrate, WAL
server/src/schema.sql        # all Stage-1 tables
server/src/zip.ts            # zip ⇄ LoadedPackage (adm-zip + gray-matter)
server/src/importer.ts       # validate + transactional upsert into content tables
server/src/exporter.ts       # DB → zip (lossless content round-trip)
server/src/routes/packages.ts# list/import/export/delete + asset serving
server/src/routes/lessons.ts # lesson fetch + progress
server/src/routes/attempts.ts# exercise answers (server-side checking)
server/src/routes/review.ts  # due queue, grade, free study
server/src/app.ts            # Hono app assembly + error handler + static files
server/src/index.ts          # entrypoint: migrate, seed sample, listen :4321
server/sample/…              # bundled sample package (folder form)
server/test/*.test.ts
web/src/api.ts               # typed fetch client
web/src/components/Markdown.tsx      # react-markdown + asset URL rewriting
web/src/components/ActivityView.tsx  # exercise renderer per item type
web/src/pages/Library.tsx    # packages: list/import/export/delete → lessons
web/src/pages/Lesson.tsx     # lesson player (markdown + inline activities)
web/src/pages/Study.tsx      # due queue + grading + free study
web/src/App.tsx, main.tsx    # router + nav
e2e/smoke.spec.ts            # import sample → lesson → exercise → review
```

Boundaries: `shared` exports pure functions/types only (no I/O). `server` is the only writer of SQLite. `web` talks only to `/api/*`. Each route file owns its resource; `db.ts` owns connection/migration only.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`, `shared/test/smoke.test.ts`

**Interfaces:**
- Produces: workspace layout; `npm test` runs Vitest across workspaces; `@study/shared` importable as TS source (its `main` points at `src/index.ts` — no build step anywhere).

- [ ] **Step 1: Write root config + shared workspace with a failing smoke test**

`package.json` (root):
```json
{
  "name": "study-app",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "web"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p shared && tsc --noEmit -p server && tsc --noEmit -p web"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^20.14.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`.gitignore`:
```
node_modules/
data/
dist/
*.zip
```

`shared/package.json`:
```json
{
  "name": "@study/shared",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": { "zod": "^3.23.0" }
}
```

`shared/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

`shared/src/index.ts`:
```ts
export const FORMAT_VERSION = "1.0.0";
```

`shared/test/smoke.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { FORMAT_VERSION } from "../src/index.js";

describe("workspace", () => {
  it("exposes the format version", () => {
    expect(FORMAT_VERSION).toBe("1.0.0");
  });
});
```

- [ ] **Step 2: Install and run the test**

Run: `npm install && npm test`
Expected: 1 test PASSES (this task's "failing state" is the empty repo itself — the test proves toolchain + TS-source imports work).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold npm-workspaces TypeScript monorepo with vitest"
```

### Task 2: Shared — ID rules and item schemas

**Files:**
- Create: `shared/src/ids.ts`, `shared/src/items.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/items.test.ts`

**Interfaces:**
- Produces: `idSchema` (Zod string); `itemSchema` (Zod discriminated union on `type`); TS types `Item`, `ItemType`, and per-type `McItem`, `MsItem`, `FillBlankItem`, `ShortAnswerItem`, `OrderingItem`, `MatchingItem`, `FlashcardItem`. Later tasks call `itemSchema.parse(json)`.

- [ ] **Step 1: Write the failing tests**

`shared/test/items.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { itemSchema } from "../src/index.js";

const base = { id: "q1", prompt: "Pick one." };

describe("itemSchema", () => {
  it("accepts a minimal multiple-choice item", () => {
    const item = itemSchema.parse({
      ...base,
      type: "multiple-choice",
      options: [
        { id: "a", text: "Right", correct: true },
        { id: "b", text: "Wrong" },
      ],
    });
    expect(item.type).toBe("multiple-choice");
  });

  it("rejects multiple-choice without exactly one correct option", () => {
    expect(() =>
      itemSchema.parse({
        ...base,
        type: "multiple-choice",
        options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
      }),
    ).toThrow(/exactly one/i);
  });

  it("rejects multi-select with zero correct options", () => {
    expect(() =>
      itemSchema.parse({
        ...base,
        type: "multi-select",
        options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
      }),
    ).toThrow(/at least one/i);
  });

  it("rejects fill-blank whose blanks don't match {{n}} placeholders", () => {
    expect(() =>
      itemSchema.parse({
        ...base,
        type: "fill-blank",
        template: "Capital of {{1}} is {{2}}.",
        blanks: [{ slot: 1, accept: ["France"] }],
      }),
    ).toThrow(/blank/i);
  });

  it("accepts a flashcard and defaults reverse to undefined", () => {
    const card = itemSchema.parse({
      id: "c1",
      type: "flashcard",
      front: "hola",
      back: "hello",
    });
    expect(card.type).toBe("flashcard");
  });

  it("rejects unknown fields", () => {
    expect(() =>
      itemSchema.parse({ ...base, type: "short-answer", accept: ["x"], bogus: 1 }),
    ).toThrow();
  });

  it("rejects bad ids", () => {
    expect(() =>
      itemSchema.parse({ id: "bad id!", type: "short-answer", prompt: "p", accept: ["x"] }),
    ).toThrow(/id/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shared/test/items.test.ts`
Expected: FAIL — `itemSchema` is not exported.

- [ ] **Step 3: Implement**

`shared/src/ids.ts`:
```ts
import { z } from "zod";

export const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;
export const idSchema = z
  .string()
  .max(64)
  .regex(ID_RE, "id must match /^[a-z0-9][a-z0-9_-]*$/i");
```

`shared/src/items.ts`:
```ts
import { z } from "zod";
import { idSchema } from "./ids.js";

export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
const mediaSchema = z.object({ src: z.string(), alt: z.string().optional() }).strict();
const metaSchema = z.record(z.unknown());

const itemBase = {
  id: idSchema,
  hints: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  difficulty: difficultySchema.optional(),
  tags: z.array(z.string()).optional(),
  media: z.array(mediaSchema).optional(),
  meta: metaSchema.optional(),
};
const prompted = { ...itemBase, prompt: z.string() };

const optionSchema = z
  .object({
    id: idSchema,
    text: z.string(),
    correct: z.boolean().optional(),
    feedback: z.string().optional(),
  })
  .strict();

const mcSchema = z
  .object({
    ...prompted,
    type: z.literal("multiple-choice"),
    options: z.array(optionSchema).min(2),
    shuffle: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.options.filter((o) => o.correct).length === 1, {
    message: "multiple-choice requires exactly one correct option",
    path: ["options"],
  });

const msSchema = z
  .object({
    ...prompted,
    type: z.literal("multi-select"),
    options: z.array(optionSchema).min(2),
    shuffle: z.boolean().optional(),
    partialCredit: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.options.some((o) => o.correct), {
    message: "multi-select requires at least one correct option",
    path: ["options"],
  });

const blankSchema = z
  .object({
    slot: z.number().int().positive(),
    accept: z.array(z.string()).min(1),
    caseSensitive: z.boolean().optional(),
  })
  .strict();

const fillBlankSchema = z
  .object({
    ...prompted,
    type: z.literal("fill-blank"),
    template: z.string(),
    blanks: z.array(blankSchema).min(1),
  })
  .strict()
  .refine(
    (v) => {
      const slots = [...v.template.matchAll(/\{\{(\d+)\}\}/g)]
        .map((m) => Number(m[1]))
        .sort((a, b) => a - b);
      const declared = v.blanks.map((b) => b.slot).sort((a, b) => a - b);
      return (
        slots.length === declared.length &&
        slots.every((s, i) => s === declared[i])
      );
    },
    { message: "blanks must match the {{n}} placeholders in template", path: ["blanks"] },
  );

const shortAnswerSchema = z
  .object({
    ...prompted,
    type: z.literal("short-answer"),
    accept: z.array(z.string()).min(1),
    match: z.enum(["exact", "fold", "regex"]).optional(),
  })
  .strict();

const orderingSchema = z
  .object({
    ...prompted,
    type: z.literal("ordering"),
    steps: z.array(z.object({ id: idSchema, text: z.string() }).strict()).min(2),
  })
  .strict();

const matchingSchema = z
  .object({
    ...prompted,
    type: z.literal("matching"),
    pairs: z.array(z.object({ left: z.string(), right: z.string() }).strict()).min(2),
    distractors: z.array(z.string()).optional(),
  })
  .strict();

const flashcardSchema = z
  .object({
    ...itemBase,
    type: z.literal("flashcard"),
    front: z.string(),
    back: z.string(),
    reverse: z.boolean().optional(),
    examples: z.array(z.string()).optional(),
  })
  .strict();

export const itemSchema = z.union([
  mcSchema,
  msSchema,
  fillBlankSchema,
  shortAnswerSchema,
  orderingSchema,
  matchingSchema,
  flashcardSchema,
]);

export type Item = z.infer<typeof itemSchema>;
export type ItemType = Item["type"];
export type McItem = Extract<Item, { type: "multiple-choice" }>;
export type MsItem = Extract<Item, { type: "multi-select" }>;
export type FillBlankItem = Extract<Item, { type: "fill-blank" }>;
export type ShortAnswerItem = Extract<Item, { type: "short-answer" }>;
export type OrderingItem = Extract<Item, { type: "ordering" }>;
export type MatchingItem = Extract<Item, { type: "matching" }>;
export type FlashcardItem = Extract<Item, { type: "flashcard" }>;
```

> **Note:** `z.union` (not `z.discriminatedUnion`) is deliberate: `.refine()` wraps object schemas in `ZodEffects`, which `discriminatedUnion` cannot accept without stripping the refinements — and the per-type refinements ("exactly one correct") are load-bearing. Union error messages are noisier; that trade-off is acceptable.

`shared/src/index.ts`:
```ts
export const FORMAT_VERSION = "1.0.0";
export { idSchema, ID_RE } from "./ids.js";
export { itemSchema, difficultySchema } from "./items.js";
export type {
  Item, ItemType, McItem, MsItem, FillBlankItem, ShortAnswerItem,
  OrderingItem, MatchingItem, FlashcardItem,
} from "./items.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shared/test/items.test.ts`
Expected: all 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat: item schemas — 7 activity types with per-type invariants"
```

### Task 3: Shared — manifest, lesson, quiz, game schemas + lesson-body splitter

**Files:**
- Create: `shared/src/packageSchema.ts`, `shared/src/lessonBody.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/packageSchema.test.ts`, `shared/test/lessonBody.test.ts`

**Interfaces:**
- Produces: `manifestSchema`, `lessonFrontmatterSchema`, `quizSchema`, `gameSchema` (+ inferred types `Manifest`, `LessonFrontmatter`, `Quiz`, `Game`); `splitLessonBody(body: string): BodySegment[]` where `BodySegment = { kind: "md"; md: string } | { kind: "activity"; id: string }`.

- [ ] **Step 1: Write the failing tests**

`shared/test/packageSchema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { gameSchema, lessonFrontmatterSchema, manifestSchema, quizSchema } from "../src/index.js";

describe("manifestSchema", () => {
  it("accepts a minimal manifest", () => {
    const m = manifestSchema.parse({
      formatVersion: "1.0.0",
      id: "spanish-basics",
      title: "Spanish Basics",
      version: "1.0.0",
    });
    expect(m.id).toBe("spanish-basics");
  });

  it("rejects a formatVersion the importer doesn't know", () => {
    expect(() =>
      manifestSchema.parse({ formatVersion: "9.0.0", id: "x", title: "X", version: "1" }),
    ).toThrow(/formatVersion/i);
  });

  it("accepts optional units and meta, rejects unknown fields", () => {
    const m = manifestSchema.parse({
      formatVersion: "1.0.0",
      id: "p",
      title: "P",
      version: "2",
      language: "es-MX",
      units: [{ id: "u1", title: "Unit 1", lessonIds: ["l1"] }],
      meta: { anything: { goes: true } },
    });
    expect(m.units?.[0]?.lessonIds).toEqual(["l1"]);
    expect(() =>
      manifestSchema.parse({ formatVersion: "1.0.0", id: "p", title: "P", version: "2", nope: 1 }),
    ).toThrow();
  });
});

describe("lessonFrontmatterSchema", () => {
  it("accepts minimal frontmatter (id + title)", () => {
    const fm = lessonFrontmatterSchema.parse({ id: "greetings", title: "Greetings" });
    expect(fm.title).toBe("Greetings");
  });
});

describe("quizSchema / gameSchema", () => {
  it("accepts a quiz", () => {
    expect(
      quizSchema.parse({ id: "q", title: "Quiz", items: ["a", "b"], passThreshold: 0.8 }).items,
    ).toHaveLength(2);
  });
  it("rejects passThreshold outside 0..1", () => {
    expect(() => quizSchema.parse({ id: "q", title: "Q", items: ["a"], passThreshold: 2 })).toThrow();
  });
  it("accepts a game with tag source", () => {
    const g = gameSchema.parse({ id: "g", template: "matching", title: "Match!", source: { tags: ["food"] } });
    expect(g.template).toBe("matching");
  });
});
```

`shared/test/lessonBody.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { splitLessonBody } from "../src/index.js";

describe("splitLessonBody", () => {
  it("splits markdown around activity directives", () => {
    const body = 'Intro text.\n\n::activity{id="mcq-1"}\n\nMore text.\n';
    expect(splitLessonBody(body)).toEqual([
      { kind: "md", md: "Intro text.\n" },
      { kind: "activity", id: "mcq-1" },
      { kind: "md", md: "\nMore text.\n" },
    ]);
  });

  it("returns one md segment when there are no directives", () => {
    expect(splitLessonBody("Just text.")).toEqual([{ kind: "md", md: "Just text." }]);
  });

  it("ignores a directive that is not alone on its line", () => {
    const body = 'text ::activity{id="x"} more';
    expect(splitLessonBody(body)).toEqual([{ kind: "md", md: body }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shared/test/packageSchema.test.ts shared/test/lessonBody.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

`shared/src/packageSchema.ts`:
```ts
import { z } from "zod";
import { idSchema } from "./ids.js";
import { difficultySchema } from "./items.js";

export const KNOWN_FORMAT_VERSIONS = ["1.0.0"];
const metaSchema = z.record(z.unknown());

export const manifestSchema = z
  .object({
    formatVersion: z
      .string()
      .refine((v) => KNOWN_FORMAT_VERSIONS.includes(v), {
        message: `unsupported formatVersion (known: ${KNOWN_FORMAT_VERSIONS.join(", ")})`,
      }),
    id: idSchema,
    title: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    language: z.string().optional(),
    tags: z.array(z.string()).optional(),
    authors: z.array(z.string()).optional(),
    license: z.string().optional(),
    objectives: z.array(z.string()).optional(),
    prerequisites: z.array(z.string()).optional(),
    units: z
      .array(z.object({ id: idSchema, title: z.string(), lessonIds: z.array(idSchema) }).strict())
      .optional(),
    meta: metaSchema.optional(),
  })
  .strict();

export const lessonFrontmatterSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    summary: z.string().optional(),
    objectives: z.array(z.string()).optional(),
    estimatedMinutes: z.number().positive().optional(),
    difficulty: difficultySchema.optional(),
    prerequisites: z.array(idSchema).optional(),
    tags: z.array(z.string()).optional(),
    activities: z.array(idSchema).optional(),
  })
  .strict();

export const quizSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    items: z.array(idSchema).min(1),
    shuffle: z.boolean().optional(),
    timeLimitSeconds: z.number().int().positive().optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    meta: metaSchema.optional(),
  })
  .strict();

export const gameSchema = z
  .object({
    id: idSchema,
    template: z.enum(["matching", "timed-round", "order-it"]),
    title: z.string().min(1),
    source: z.union([
      z.object({ itemIds: z.array(idSchema).min(1) }).strict(),
      z.object({ tags: z.array(z.string()).min(1) }).strict(),
    ]),
    settings: z
      .object({
        timeLimitSeconds: z.number().int().positive().optional(),
        roundSize: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    meta: metaSchema.optional(),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
export type LessonFrontmatter = z.infer<typeof lessonFrontmatterSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type Game = z.infer<typeof gameSchema>;
```

`shared/src/lessonBody.ts`:
```ts
export type BodySegment = { kind: "md"; md: string } | { kind: "activity"; id: string };

const DIRECTIVE_RE = /^::activity\{id="([A-Za-z0-9][A-Za-z0-9_-]*)"\}[ \t]*$/;

export function splitLessonBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) segments.push({ kind: "md", md: buf.join("\n") });
    buf = [];
  };
  for (const line of body.split("\n")) {
    const m = DIRECTIVE_RE.exec(line);
    if (m && m[1]) {
      flush();
      segments.push({ kind: "activity", id: m[1] });
    } else {
      buf.push(line);
    }
  }
  flush();
  return segments.length ? segments : [{ kind: "md", md: "" }];
}

export function activityIdsInBody(body: string): string[] {
  return splitLessonBody(body)
    .filter((s): s is Extract<BodySegment, { kind: "activity" }> => s.kind === "activity")
    .map((s) => s.id);
}
```

Add to `shared/src/index.ts`:
```ts
export {
  manifestSchema,
  lessonFrontmatterSchema,
  quizSchema,
  gameSchema,
  KNOWN_FORMAT_VERSIONS,
} from "./packageSchema.js";
export type { Manifest, LessonFrontmatter, Quiz, Game } from "./packageSchema.js";
export { splitLessonBody, activityIdsInBody } from "./lessonBody.js";
export type { BodySegment } from "./lessonBody.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shared/test/packageSchema.test.ts shared/test/lessonBody.test.ts`
Expected: all PASS. Note on the split test: a directive line consumes its own line; the surrounding `\n` handling in the expected segments is exact — match it.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat: manifest/lesson/quiz/game schemas and lesson-body splitter"
```

### Task 4: Shared — LoadedPackage + referential-integrity validation

**Files:**
- Create: `shared/src/validatePackage.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/validatePackage.test.ts`

**Interfaces:**
- Consumes: all schemas from Tasks 2–3; `activityIdsInBody` from Task 3.
- Produces:
  ```ts
  interface LoadedLesson { frontmatter: LessonFrontmatter; body: string; file: string; order: number }
  interface LoadedPackage {
    manifest: Manifest; lessons: LoadedLesson[]; items: Item[];
    quizzes: Quiz[]; games: Game[]; assets: { path: string; data: Uint8Array }[];
  }
  interface PackageError { file: string; path: string; message: string }
  validatePackage(pkg: LoadedPackage): PackageError[]   // [] = valid
  ```
  Task 8 (importer) calls `validatePackage` after Zod-parsing each file; Task 9 (exporter) builds a `LoadedPackage`.

- [ ] **Step 1: Write the failing tests**

`shared/test/validatePackage.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { LoadedPackage } from "../src/index.js";
import { validatePackage } from "../src/index.js";

function pkg(overrides: Partial<LoadedPackage> = {}): LoadedPackage {
  return {
    manifest: { formatVersion: "1.0.0", id: "p", title: "P", version: "1" },
    lessons: [
      {
        file: "lessons/01-a.md",
        order: 0,
        frontmatter: { id: "l1", title: "L1" },
        body: 'Hello\n\n::activity{id="i1"}\n',
      },
    ],
    items: [
      { id: "i1", type: "flashcard", front: "a", back: "b" },
      { id: "i2", type: "short-answer", prompt: "?", accept: ["yes"] },
    ],
    quizzes: [],
    games: [],
    assets: [],
    ...overrides,
  };
}

describe("validatePackage", () => {
  it("passes a consistent package", () => {
    expect(validatePackage(pkg())).toEqual([]);
  });

  it("flags a directive referencing a missing item", () => {
    const errs = validatePackage(
      pkg({ lessons: [{ file: "lessons/01-a.md", order: 0, frontmatter: { id: "l1", title: "L1" }, body: '::activity{id="ghost"}' }] }),
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ file: "lessons/01-a.md", message: expect.stringContaining("ghost") });
  });

  it("flags duplicate item ids, quiz refs to missing items, unit refs to missing lessons, and bad media paths", () => {
    const errs = validatePackage(
      pkg({
        manifest: {
          formatVersion: "1.0.0", id: "p", title: "P", version: "1",
          units: [{ id: "u1", title: "U", lessonIds: ["nope"] }],
        },
        items: [
          { id: "dup", type: "flashcard", front: "a", back: "b" },
          { id: "dup", type: "flashcard", front: "c", back: "d" },
          { id: "img", type: "short-answer", prompt: "?", accept: ["y"], media: [{ src: "assets/missing.png" }] },
        ],
        quizzes: [{ id: "q1", title: "Q", items: ["absent"] }],
        lessons: [{ file: "lessons/01-a.md", order: 0, frontmatter: { id: "l1", title: "L1", activities: ["alsoAbsent"] }, body: "text" }],
      }),
    );
    const messages = errs.map((e) => e.message).join("\n");
    for (const needle of ["dup", "absent", "alsoAbsent", "nope", "assets/missing.png"]) {
      expect(messages).toContain(needle);
    }
  });

  it("flags a game whose source resolves to zero compatible items", () => {
    const errs = validatePackage(
      pkg({ games: [{ id: "g1", template: "matching", title: "M", source: { itemIds: ["i1"] } }] }),
    );
    expect(errs.map((e) => e.message).join()).toMatch(/no compatible items/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shared/test/validatePackage.test.ts`
Expected: FAIL — `validatePackage` not exported.

- [ ] **Step 3: Implement**

`shared/src/validatePackage.ts`:
```ts
import type { Game, LessonFrontmatter, Manifest, Quiz } from "./packageSchema.js";
import type { Item } from "./items.js";
import { activityIdsInBody } from "./lessonBody.js";

export interface LoadedLesson {
  frontmatter: LessonFrontmatter;
  body: string;
  file: string;
  order: number;
}
export interface LoadedPackage {
  manifest: Manifest;
  lessons: LoadedLesson[];
  items: Item[];
  quizzes: Quiz[];
  games: Game[];
  assets: { path: string; data: Uint8Array }[];
}
export interface PackageError {
  file: string;
  path: string;
  message: string;
}

const GAME_COMPAT: Record<Game["template"], Item["type"][]> = {
  matching: ["matching"],
  "timed-round": ["multiple-choice", "multi-select"],
  "order-it": ["ordering"],
};

export function validatePackage(pkg: LoadedPackage): PackageError[] {
  const errs: PackageError[] = [];
  const err = (file: string, path: string, message: string) => errs.push({ file, path, message });

  const itemIds = new Map<string, Item>();
  for (const item of pkg.items) {
    if (itemIds.has(item.id)) err("items.json", item.id, `duplicate item id "${item.id}"`);
    itemIds.set(item.id, item);
  }
  const lessonIds = new Set<string>();
  for (const l of pkg.lessons) {
    if (lessonIds.has(l.frontmatter.id)) err(l.file, "id", `duplicate lesson id "${l.frontmatter.id}"`);
    lessonIds.add(l.frontmatter.id);
  }
  const assetPaths = new Set(pkg.assets.map((a) => a.path));

  for (const l of pkg.lessons) {
    for (const id of activityIdsInBody(l.body)) {
      if (!itemIds.has(id)) err(l.file, "body", `activity directive references missing item "${id}"`);
    }
    for (const id of l.frontmatter.activities ?? []) {
      if (!itemIds.has(id)) err(l.file, "activities", `activities references missing item "${id}"`);
    }
    for (const id of l.frontmatter.prerequisites ?? []) {
      if (!lessonIds.has(id)) err(l.file, "prerequisites", `prerequisite references missing lesson "${id}"`);
    }
    for (const m of l.body.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)) {
      const p = m[1]!;
      if (!assetPaths.has(p)) err(l.file, "body", `image references missing asset "${p}"`);
    }
  }

  for (const u of pkg.manifest.units ?? []) {
    for (const id of u.lessonIds) {
      if (!lessonIds.has(id)) err("manifest.json", `units.${u.id}`, `unit references missing lesson "${id}"`);
    }
  }

  for (const q of pkg.quizzes) {
    for (const id of q.items) {
      if (!itemIds.has(id)) err("quizzes.json", q.id, `quiz references missing item "${id}"`);
      else if (itemIds.get(id)!.type === "flashcard")
        err("quizzes.json", q.id, `quiz item "${id}" is a flashcard (not quizzable)`);
    }
  }

  for (const g of pkg.games) {
    const compat = GAME_COMPAT[g.template];
    const source =
      "itemIds" in g.source
        ? g.source.itemIds.map((id) => {
            if (!itemIds.has(id)) err("games.json", g.id, `game references missing item "${id}"`);
            return itemIds.get(id);
          })
        : pkg.items.filter((i) => i.tags?.some((t) => (g.source as { tags: string[] }).tags.includes(t)));
    const usable = source.filter((i): i is Item => !!i && compat.includes(i.type));
    if (usable.length === 0)
      err("games.json", g.id, `game "${g.id}" (${g.template}) has no compatible items (needs: ${compat.join("/")})`);
  }

  for (const item of pkg.items) {
    for (const m of item.media ?? []) {
      if (!assetPaths.has(m.src)) err("items.json", item.id, `media references missing asset "${m.src}"`);
    }
  }

  return errs;
}
```

Add to `shared/src/index.ts`:
```ts
export { validatePackage } from "./validatePackage.js";
export type { LoadedPackage, LoadedLesson, PackageError } from "./validatePackage.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shared/test/validatePackage.test.ts`
Expected: all 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat: package referential-integrity validation"
```

### Task 5: Shared — answer checking

**Files:**
- Create: `shared/src/checking.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/checking.test.ts`

**Interfaces:**
- Consumes: `Item` types from Task 2.
- Produces:
  ```ts
  type Answer =
    | { type: "multiple-choice"; optionId: string }
    | { type: "multi-select"; optionIds: string[] }
    | { type: "fill-blank"; answers: Record<string, string> }  // key = slot number as string
    | { type: "short-answer"; text: string }
    | { type: "ordering"; orderedIds: string[] }
    | { type: "matching"; pairs: { left: string; right: string }[] };
  interface CheckResult { correct: boolean; score: number; expected: unknown; feedback?: string }
  checkAnswer(item: Item, answer: Answer): CheckResult   // throws on flashcard or type mismatch
  fold(s: string): string                                 // trim+lower+strip diacritics
  ```
  Task 12's `POST /api/attempts` calls `checkAnswer`; `expected` is what the UI reveals after answering.

- [ ] **Step 1: Write the failing tests**

`shared/test/checking.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Item } from "../src/index.js";
import { checkAnswer, fold } from "../src/index.js";

const mc: Item = {
  id: "m1", type: "multiple-choice", prompt: "?",
  options: [
    { id: "a", text: "A", correct: true },
    { id: "b", text: "B", feedback: "Nope — B is a distractor." },
  ],
};

describe("fold", () => {
  it("trims, lowercases, strips accents", () => {
    expect(fold("  Café ")).toBe("cafe");
  });
});

describe("checkAnswer", () => {
  it("multiple-choice: right and wrong, with per-option feedback", () => {
    expect(checkAnswer(mc, { type: "multiple-choice", optionId: "a" })).toMatchObject({ correct: true, score: 1 });
    const wrong = checkAnswer(mc, { type: "multiple-choice", optionId: "b" });
    expect(wrong).toMatchObject({ correct: false, score: 0, expected: "a", feedback: "Nope — B is a distractor." });
  });

  it("multi-select: exact set required unless partialCredit", () => {
    const ms: Item = {
      id: "s1", type: "multi-select", prompt: "?", partialCredit: true,
      options: [
        { id: "a", text: "A", correct: true },
        { id: "b", text: "B", correct: true },
        { id: "c", text: "C" },
      ],
    };
    expect(checkAnswer(ms, { type: "multi-select", optionIds: ["a", "b"] }).correct).toBe(true);
    const partial = checkAnswer(ms, { type: "multi-select", optionIds: ["a", "c"] });
    expect(partial.correct).toBe(false);
    expect(partial.score).toBe(0); // (1 right - 1 wrong) / 2 correct → 0
    const noPartial: Item = { ...ms, partialCredit: false };
    expect(checkAnswer(noPartial, { type: "multi-select", optionIds: ["a"] }).score).toBe(0);
  });

  it("fill-blank: per-blank accept lists, case sensitivity respected", () => {
    const fb: Item = {
      id: "f1", type: "fill-blank", prompt: "?", template: "{{1}} and {{2}}",
      blanks: [
        { slot: 1, accept: ["Paris"] },
        { slot: 2, accept: ["Lyon"], caseSensitive: true },
      ],
    };
    expect(checkAnswer(fb, { type: "fill-blank", answers: { "1": "paris", "2": "Lyon" } }).correct).toBe(true);
    const half = checkAnswer(fb, { type: "fill-blank", answers: { "1": "Paris", "2": "lyon" } });
    expect(half).toMatchObject({ correct: false, score: 0.5 });
  });

  it("short-answer: fold (default), exact, regex", () => {
    const sa: Item = { id: "a1", type: "short-answer", prompt: "?", accept: ["Café"] };
    expect(checkAnswer(sa, { type: "short-answer", text: "cafe " }).correct).toBe(true);
    const rx: Item = { id: "a2", type: "short-answer", prompt: "?", accept: ["^\\d{4}$"], match: "regex" };
    expect(checkAnswer(rx, { type: "short-answer", text: "2026" }).correct).toBe(true);
    expect(checkAnswer(rx, { type: "short-answer", text: "20x6" }).correct).toBe(false);
  });

  it("ordering: binary correct, positional partial score", () => {
    const ord: Item = {
      id: "o1", type: "ordering", prompt: "?",
      steps: [{ id: "s1", text: "1" }, { id: "s2", text: "2" }, { id: "s3", text: "3" }],
    };
    expect(checkAnswer(ord, { type: "ordering", orderedIds: ["s1", "s2", "s3"] }).correct).toBe(true);
    const off = checkAnswer(ord, { type: "ordering", orderedIds: ["s1", "s3", "s2"] });
    expect(off).toMatchObject({ correct: false, score: 1 / 3 });
  });

  it("matching: fraction of correct pairs", () => {
    const mt: Item = {
      id: "x1", type: "matching", prompt: "?",
      pairs: [{ left: "perro", right: "dog" }, { left: "gato", right: "cat" }],
    };
    const r = checkAnswer(mt, { type: "matching", pairs: [{ left: "perro", right: "dog" }, { left: "gato", right: "dog" }] });
    expect(r).toMatchObject({ correct: false, score: 0.5 });
  });

  it("throws on flashcards and on type mismatch", () => {
    const card: Item = { id: "c", type: "flashcard", front: "f", back: "b" };
    expect(() => checkAnswer(card, { type: "short-answer", text: "b" })).toThrow(/flashcard/i);
    expect(() => checkAnswer(mc, { type: "short-answer", text: "a" })).toThrow(/mismatch/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shared/test/checking.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement**

`shared/src/checking.ts`:
```ts
import type { Item } from "./items.js";

export type Answer =
  | { type: "multiple-choice"; optionId: string }
  | { type: "multi-select"; optionIds: string[] }
  | { type: "fill-blank"; answers: Record<string, string> }
  | { type: "short-answer"; text: string }
  | { type: "ordering"; orderedIds: string[] }
  | { type: "matching"; pairs: { left: string; right: string }[] };

export interface CheckResult {
  correct: boolean;
  score: number;
  expected: unknown;
  feedback?: string;
}

export function fold(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function checkAnswer(item: Item, answer: Answer): CheckResult {
  if (item.type === "flashcard") throw new Error("flashcards are self-graded, not checked");
  if (item.type !== answer.type) throw new Error(`answer/item type mismatch: ${answer.type} vs ${item.type}`);

  switch (item.type) {
    case "multiple-choice": {
      const a = answer as Extract<Answer, { type: "multiple-choice" }>;
      const correctOpt = item.options.find((o) => o.correct)!;
      const picked = item.options.find((o) => o.id === a.optionId);
      const correct = a.optionId === correctOpt.id;
      return {
        correct,
        score: correct ? 1 : 0,
        expected: correctOpt.id,
        feedback: correct ? undefined : picked?.feedback,
      };
    }
    case "multi-select": {
      const a = answer as Extract<Answer, { type: "multi-select" }>;
      const correctIds = new Set(item.options.filter((o) => o.correct).map((o) => o.id));
      const chosen = new Set(a.optionIds);
      const right = [...chosen].filter((id) => correctIds.has(id)).length;
      const wrong = chosen.size - right;
      const exact = right === correctIds.size && wrong === 0;
      const partial = Math.max(0, (right - wrong) / correctIds.size);
      return {
        correct: exact,
        score: exact ? 1 : item.partialCredit ? partial : 0,
        expected: [...correctIds],
      };
    }
    case "fill-blank": {
      const a = answer as Extract<Answer, { type: "fill-blank" }>;
      let right = 0;
      for (const b of item.blanks) {
        const given = a.answers[String(b.slot)] ?? "";
        const ok = b.caseSensitive
          ? b.accept.some((acc) => acc === given.trim())
          : b.accept.some((acc) => fold(acc) === fold(given));
        if (ok) right += 1;
      }
      const score = right / item.blanks.length;
      return { correct: score === 1, score, expected: Object.fromEntries(item.blanks.map((b) => [b.slot, b.accept[0]])) };
    }
    case "short-answer": {
      const a = answer as Extract<Answer, { type: "short-answer" }>;
      const mode = item.match ?? "fold";
      const ok =
        mode === "exact"
          ? item.accept.some((acc) => acc === a.text.trim())
          : mode === "regex"
            ? item.accept.some((acc) => new RegExp(acc).test(a.text.trim()))
            : item.accept.some((acc) => fold(acc) === fold(a.text));
      return { correct: ok, score: ok ? 1 : 0, expected: item.accept[0] };
    }
    case "ordering": {
      const a = answer as Extract<Answer, { type: "ordering" }>;
      const want = item.steps.map((s) => s.id);
      const right = want.filter((id, i) => a.orderedIds[i] === id).length;
      const score = right / want.length;
      return { correct: score === 1, score, expected: want };
    }
    case "matching": {
      const a = answer as Extract<Answer, { type: "matching" }>;
      const want = new Map(item.pairs.map((p) => [p.left, p.right]));
      const right = a.pairs.filter((p) => want.get(p.left) === p.right).length;
      const score = right / item.pairs.length;
      return { correct: score === 1, score, expected: item.pairs };
    }
  }
}
```

Add to `shared/src/index.ts`:
```ts
export { checkAnswer, fold } from "./checking.js";
export type { Answer, CheckResult } from "./checking.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shared/test/checking.test.ts`
Expected: all 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat: server-authoritative answer checking for all item types"
```

### Task 6: Shared — SM-2-style scheduler

**Files:**
- Create: `shared/src/scheduler.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/scheduler.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Rating = "again" | "hard" | "good" | "easy";
  interface CardState { intervalDays: number; ease: number; reps: number; lapses: number; dueAt: string }  // dueAt ISO-8601
  schedule(prev: CardState | null, rating: Rating, now: Date): CardState
  ```
  Exact rules (spec §4 "SM-2-style", pinned here):
  - New card defaults: `ease 2.5, intervalDays 0, reps 0, lapses 0`.
  - `again`: `lapses+1` (only if prev existed), `reps=0`, `ease=max(1.3, ease-0.2)`, `intervalDays=0`, due **now** (comes back this session).
  - `hard`: `intervalDays = reps===0 ? 1 : max(prev+1, round(prev*1.2))`, `ease=max(1.3, ease-0.15)`, `reps+1`.
  - `good`: `intervalDays = reps===0 ? 1 : max(prev+1, round(prev*ease))`, `reps+1`.
  - `easy`: `intervalDays = reps===0 ? 3 : max(prev+2, round(prev*ease*1.3))`, `ease=ease+0.15`, `reps+1`.
  - `dueAt = now + intervalDays*86400s` (for `again`: `now`).
  Task 13's grade endpoint persists this state verbatim.

- [ ] **Step 1: Write the failing tests**

`shared/test/scheduler.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { schedule } from "../src/index.js";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const day = 86_400_000;

describe("schedule", () => {
  it("new card graded good → 1 day out", () => {
    const s = schedule(null, "good", NOW);
    expect(s).toMatchObject({ intervalDays: 1, reps: 1, lapses: 0, ease: 2.5 });
    expect(s.dueAt).toBe(new Date(NOW.getTime() + day).toISOString());
  });

  it("new card graded easy → 3 days, ease up", () => {
    const s = schedule(null, "easy", NOW);
    expect(s).toMatchObject({ intervalDays: 3, ease: 2.65 });
  });

  it("mature card graded good multiplies by ease", () => {
    const prev = { intervalDays: 10, ease: 2.5, reps: 3, lapses: 0, dueAt: NOW.toISOString() };
    expect(schedule(prev, "good", NOW).intervalDays).toBe(25);
  });

  it("again resets reps, bumps lapses, floors ease at 1.3, due immediately", () => {
    const prev = { intervalDays: 10, ease: 1.35, reps: 3, lapses: 1, dueAt: NOW.toISOString() };
    const s = schedule(prev, "again", NOW);
    expect(s).toMatchObject({ intervalDays: 0, reps: 0, lapses: 2, ease: 1.3 });
    expect(s.dueAt).toBe(NOW.toISOString());
  });

  it("hard grows slowly and always at least +1 day", () => {
    const prev = { intervalDays: 2, ease: 2.5, reps: 2, lapses: 0, dueAt: NOW.toISOString() };
    expect(schedule(prev, "hard", NOW).intervalDays).toBe(3); // max(3, round(2.4)) = 3
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- shared/test/scheduler.test.ts`
Expected: FAIL — `schedule` not exported.

- [ ] **Step 3: Implement**

`shared/src/scheduler.ts`:
```ts
export type Rating = "again" | "hard" | "good" | "easy";

export interface CardState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  dueAt: string;
}

const DAY_MS = 86_400_000;

export function schedule(prev: CardState | null, rating: Rating, now: Date): CardState {
  const p = prev ?? { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, dueAt: now.toISOString() };
  let { intervalDays, ease, reps, lapses } = p;

  switch (rating) {
    case "again":
      if (prev) lapses += 1;
      reps = 0;
      ease = Math.max(1.3, ease - 0.2);
      intervalDays = 0;
      break;
    case "hard":
      intervalDays = reps === 0 ? 1 : Math.max(intervalDays + 1, Math.round(intervalDays * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      reps += 1;
      break;
    case "good":
      intervalDays = reps === 0 ? 1 : Math.max(intervalDays + 1, Math.round(intervalDays * ease));
      reps += 1;
      break;
    case "easy":
      intervalDays = reps === 0 ? 3 : Math.max(intervalDays + 2, Math.round(intervalDays * ease * 1.3));
      ease = ease + 0.15;
      reps += 1;
      break;
  }

  const dueAt = new Date(now.getTime() + intervalDays * DAY_MS).toISOString();
  return { intervalDays, ease: Math.round(ease * 100) / 100, reps, lapses, dueAt };
}
```

Add to `shared/src/index.ts`:
```ts
export { schedule } from "./scheduler.js";
export type { Rating, CardState } from "./scheduler.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- shared/test/scheduler.test.ts`
Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "feat: SM-2-style spaced repetition scheduler"
```

### Task 7: Server — database layer

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/schema.sql`, `server/src/db.ts`
- Test: `server/test/db.test.ts`

**Interfaces:**
- Produces: `openDb(dataDir?: string): Database` (better-sqlite3 instance; `":memory:"`-style temp DBs for tests via explicit dir). Applies `schema.sql` idempotently, enables WAL + foreign keys. All later server tasks receive this `Database`.

- [ ] **Step 1: Create the server workspace**

`server/package.json`:
```json
{
  "name": "@study/server",
  "private": true,
  "type": "module",
  "scripts": { "dev": "tsx watch src/index.ts", "start": "tsx src/index.ts" },
  "dependencies": {
    "@study/shared": "*",
    "adm-zip": "^0.5.14",
    "better-sqlite3": "^11.3.0",
    "gray-matter": "^4.0.3",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "tsx": "^4.19.0"
  },
  "devDependencies": { "@types/better-sqlite3": "^7.6.0", "@types/adm-zip": "^0.5.5" }
}
```

`server/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 2: Write the failing test**

`server/test/db.test.ts`:
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";

describe("openDb", () => {
  it("creates the schema idempotently with WAL on", () => {
    const dir = mkdtempSync(join(tmpdir(), "study-"));
    const db = openDb(dir);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    for (const t of ["packages", "lessons", "items", "quizzes", "games", "assets",
                     "card_state", "review_log", "attempts", "lesson_progress"]) {
      expect(tables).toContain(t);
    }
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.close();
    openDb(dir).close(); // second open on same dir must not throw
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm install && npm test -- server/test/db.test.ts`
Expected: FAIL — `db.ts` missing.

- [ ] **Step 4: Implement**

`server/src/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  manifest TEXT NOT NULL,           -- Manifest JSON
  imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  file TEXT NOT NULL,               -- original path, e.g. lessons/01-a.md
  frontmatter TEXT NOT NULL,        -- LessonFrontmatter JSON
  body TEXT NOT NULL,
  PRIMARY KEY (package_id, id)
);
CREATE TABLE IF NOT EXISTS items (
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,               -- full Item JSON
  PRIMARY KEY (package_id, id)
);
CREATE TABLE IF NOT EXISTS quizzes (
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (package_id, id)
);
CREATE TABLE IF NOT EXISTS games (
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (package_id, id)
);
CREATE TABLE IF NOT EXISTS assets (
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (package_id, path)
);
-- user state: no FK to content — must survive package deletion/re-import
CREATE TABLE IF NOT EXISTS card_state (
  package_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('front','back')),
  interval_days REAL NOT NULL,
  ease REAL NOT NULL,
  reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  PRIMARY KEY (package_id, item_id, direction)
);
CREATE TABLE IF NOT EXISTS review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  rating TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('exercise','quiz','game')),
  ref_id TEXT,                      -- quiz/game id when kind != 'exercise'
  item_id TEXT,
  answer TEXT,                      -- Answer JSON
  correct INTEGER,
  score REAL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  package_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in-progress','completed')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (package_id, lesson_id)
);
```

`server/src/db.ts`:
```ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Db = Database.Database;

export function openDb(dataDir = process.env.STUDY_DATA_DIR ?? "data"): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "study.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- server/test/db.test.ts`
Expected: PASS. (If better-sqlite3 needs a native rebuild: `npm rebuild better-sqlite3`.)

- [ ] **Step 6: Commit**

```bash
git add server package-lock.json
git commit -m "feat: sqlite layer — schema, WAL, idempotent migration"
```

### Task 8: Server — zip parsing + transactional import

**Files:**
- Create: `server/src/zip.ts`, `server/src/importer.ts`, `server/test/helpers.ts`
- Test: `server/test/importer.test.ts`

**Interfaces:**
- Consumes: `openDb` (Task 7); shared schemas, `validatePackage`, `LoadedPackage`, `PackageError` (Tasks 2–4).
- Produces:
  ```ts
  // zip.ts
  readPackageZip(zip: Buffer): { pkg: LoadedPackage | null; errors: PackageError[] }  // parse+Zod; never throws on bad content
  buildPackageZip(pkg: LoadedPackage): Buffer                                  // used by Task 9
  // importer.ts
  importPackage(db: Db, zip: Buffer): { ok: true; packageId: string } | { ok: false; errors: PackageError[] }
  ```
  Import replaces all content rows for the package id in ONE transaction; user-state tables untouched.

- [ ] **Step 1: Write the failing tests**

`server/test/helpers.ts` (shared by all server test files — helpers must NOT live inside a `*.test.ts` file, or importing them would re-register that file's tests in every importer):
```ts
import AdmZip from "adm-zip";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

export const freshDb = () => openDb(mkdtempSync(join(tmpdir(), "study-")));

export function makeZip(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [path, content] of Object.entries(files)) {
    zip.addFile(path, Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"));
  }
  return zip.toBuffer();
}

export const GOOD_FILES: Record<string, string | Buffer> = {
  "manifest.json": JSON.stringify({
    formatVersion: "1.0.0", id: "demo", title: "Demo", version: "1",
  }),
  "lessons/01-intro.md": [
    "---", "id: intro", "title: Intro", "---", "",
    "Hello!", "", '::activity{id="mc1"}', "",
    "![pic](assets/dot.png)", "",
  ].join("\n"),
  "items.json": JSON.stringify([
    { id: "mc1", type: "multiple-choice", prompt: "Pick", options: [
      { id: "a", text: "A", correct: true }, { id: "b", text: "B" } ] },
    { id: "card1", type: "flashcard", front: "hola", back: "hello", reverse: true },
  ]),
  "assets/dot.png": Buffer.from("89504e470d0a1a0a", "hex"), // fake but binary
};
```

`server/test/importer.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { importPackage } from "../src/importer.js";
import { freshDb, GOOD_FILES, makeZip } from "./helpers.js";

describe("importPackage", () => {
  it("imports a valid zip and stores all content", () => {
    const db = freshDb();
    const res = importPackage(db, makeZip(GOOD_FILES));
    expect(res).toEqual({ ok: true, packageId: "demo" });
    expect(db.prepare("SELECT COUNT(*) n FROM items WHERE package_id='demo'").get()).toMatchObject({ n: 2 });
    expect(db.prepare("SELECT COUNT(*) n FROM assets WHERE package_id='demo'").get()).toMatchObject({ n: 1 });
    expect(db.prepare("SELECT ord FROM lessons WHERE package_id='demo' AND id='intro'").get()).toMatchObject({ ord: 0 });
  });

  it("rejects a zip with a dangling activity ref, atomically", () => {
    const db = freshDb();
    const bad = { ...GOOD_FILES, "items.json": JSON.stringify([]) };
    const res = importPackage(db, makeZip(bad));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.message.includes("mc1"))).toBe(true);
    expect(db.prepare("SELECT COUNT(*) n FROM packages").get()).toMatchObject({ n: 0 });
  });

  it("reports Zod errors with file and path", () => {
    const db = freshDb();
    const bad = { ...GOOD_FILES, "manifest.json": JSON.stringify({ formatVersion: "1.0.0", id: "demo" }) };
    const res = importPackage(db, makeZip(bad));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatchObject({ file: "manifest.json" });
  });

  it("re-import replaces content but preserves user state", () => {
    const db = freshDb();
    importPackage(db, makeZip(GOOD_FILES));
    db.prepare(
      "INSERT INTO card_state (package_id,item_id,direction,interval_days,ease,reps,lapses,due_at) VALUES ('demo','card1','front',1,2.5,1,0,'2026-08-04T00:00:00.000Z')",
    ).run();
    const v2 = {
      ...GOOD_FILES,
      "manifest.json": JSON.stringify({ formatVersion: "1.0.0", id: "demo", title: "Demo v2", version: "2" }),
    };
    const res = importPackage(db, makeZip(v2));
    expect(res.ok).toBe(true);
    expect(JSON.parse((db.prepare("SELECT manifest FROM packages WHERE id='demo'").get() as any).manifest).title).toBe("Demo v2");
    expect(db.prepare("SELECT COUNT(*) n FROM card_state").get()).toMatchObject({ n: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/test/importer.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`server/src/zip.ts`:
```ts
import AdmZip from "adm-zip";
import matter from "gray-matter";
import {
  itemSchema, lessonFrontmatterSchema, manifestSchema, quizSchema, gameSchema,
  validatePackage,
} from "@study/shared";
import type { LoadedLesson, LoadedPackage, PackageError } from "@study/shared";
import { z } from "zod";

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
    const { data, content } = matter(text(file)!);
    const fm = lessonFrontmatterSchema.safeParse(data);
    if (fm.success) lessons.push({ file, order, frontmatter: fm.data, body: content });
    else errors.push(...zodErrors(file, fm.error));
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

  if (!manifest || errors.length) return { pkg: null, errors };
  const pkg: LoadedPackage = { manifest, lessons, items, quizzes, games, assets };
  errors.push(...validatePackage(pkg));
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
```

`server/src/importer.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/test/importer.test.ts`
Expected: all 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: zip parsing and all-or-nothing package import"
```

### Task 9: Server — export + lossless round-trip

**Files:**
- Create: `server/src/exporter.ts`
- Test: `server/test/roundtrip.test.ts`

**Interfaces:**
- Consumes: `buildPackageZip`, `readPackageZip` (Task 8); DB rows (Task 7).
- Produces: `exportPackage(db: Db, packageId: string): Buffer | null` (null = unknown id). Round-trip guarantee (spec §2.7): `readPackageZip(exportPackage(db, id))` yields a `LoadedPackage` deep-equal to the imported one (semantic equality — manifest, lessons frontmatter+body, items, quizzes, games, asset bytes; YAML/JSON byte formatting may differ).

- [ ] **Step 1: Write the failing test**

`server/test/roundtrip.test.ts`:
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { importPackage } from "../src/importer.js";
import { exportPackage } from "../src/exporter.js";
import { readPackageZip } from "../src/zip.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

describe("export round-trip", () => {
  it("import → export → parse yields identical content", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "study-")));
    const original = readPackageZip(makeZip(GOOD_FILES)).pkg!;
    importPackage(db, makeZip(GOOD_FILES));

    const out = exportPackage(db, "demo")!;
    const reread = readPackageZip(out);
    expect(reread.errors).toEqual([]);
    const rt = reread.pkg!;
    expect(rt.manifest).toEqual(original.manifest);
    expect(rt.lessons.map(({ frontmatter, body, file }) => ({ frontmatter, body: body.trim(), file })))
      .toEqual(original.lessons.map(({ frontmatter, body, file }) => ({ frontmatter, body: body.trim(), file })));
    expect(rt.items).toEqual(original.items);
    expect(rt.quizzes).toEqual(original.quizzes);
    expect(rt.games).toEqual(original.games);
    expect(rt.assets).toEqual(original.assets);
  });

  it("returns null for an unknown package", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "study-")));
    expect(exportPackage(db, "nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- server/test/roundtrip.test.ts`
Expected: FAIL — `exporter.ts` missing.

- [ ] **Step 3: Implement**

`server/src/exporter.ts`:
```ts
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
  // ORDER BY rowid preserves original file order — round-trip equality depends on it
  const items = (db.prepare("SELECT data FROM items WHERE package_id = ? ORDER BY rowid").all(packageId) as any[])
    .map((r) => JSON.parse(r.data));
  const quizzes = (db.prepare("SELECT data FROM quizzes WHERE package_id = ? ORDER BY rowid").all(packageId) as any[])
    .map((r) => JSON.parse(r.data));
  const games = (db.prepare("SELECT data FROM games WHERE package_id = ? ORDER BY rowid").all(packageId) as any[])
    .map((r) => JSON.parse(r.data));
  const assets = (db.prepare("SELECT path, data FROM assets WHERE package_id = ? ORDER BY rowid").all(packageId) as any[])
    .map((r) => ({ path: r.path, data: new Uint8Array(r.data) }));
  return { manifest: JSON.parse(row.manifest), lessons, items, quizzes, games, assets };
}

export function exportPackage(db: Db, packageId: string): Buffer | null {
  const pkg = loadPackageFromDb(db, packageId);
  return pkg ? buildPackageZip(pkg) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- server/test/roundtrip.test.ts`
Expected: both PASS. If frontmatter ordering from `matter.stringify` breaks equality, the fix belongs in the test's normalization only if values (not meaning) differ — key order in YAML does not affect the parsed object, so `toEqual` already ignores it.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: package export with lossless content round-trip"
```

### Task 10: Server — Hono app + package routes

**Files:**
- Create: `server/src/app.ts`, `server/src/routes/packages.ts`
- Test: `server/test/api.packages.test.ts`

**Interfaces:**
- Consumes: `importPackage`, `exportPackage`, `openDb`.
- Produces: `createApp(db: Db): Hono` — all later route tasks register on this app; tests drive it with `app.request(path, init)` (no listening socket needed). Routes:
  - `GET /api/packages` → `{ packages: [{ id, title, description?, version, tags?, lessonCount, lessons: [{ id, title, summary?, status }] }] }` (`status` from `lesson_progress`, default `"not-started"`)
  - `POST /api/packages/import` (body: raw zip bytes) → `201 { packageId }` or `422 { error: { code: "invalid_package", message, details: PackageError[] } }`
  - `GET /api/packages/:id/export` → zip download (`application/zip`, `Content-Disposition: attachment; filename="<id>.zip"`)
  - `DELETE /api/packages/:id` → `204` (content only; user state rows survive per spec §3)
  - `GET /api/packages/:id/assets/*` → asset bytes with mime by extension (png/jpg/jpeg/gif/svg/webp/mp3), `404` if missing
  - Error shape everywhere: `{ error: { code, message, details? } }`; unknown routes → 404 same shape.

- [ ] **Step 1: Write the failing tests**

`server/test/api.packages.test.ts`:
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDb(mkdtempSync(join(tmpdir(), "study-")));
  app = createApp(db);
});

const importGood = () =>
  app.request("/api/packages/import", { method: "POST", body: makeZip(GOOD_FILES) });

describe("package routes", () => {
  it("imports and lists", async () => {
    expect((await importGood()).status).toBe(201);
    const res = await app.request("/api/packages");
    const body = await res.json();
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0]).toMatchObject({
      id: "demo", title: "Demo", lessonCount: 1,
      lessons: [{ id: "intro", title: "Intro", status: "not-started" }],
    });
  });

  it("rejects an invalid zip with 422 and error details", async () => {
    const res = await app.request("/api/packages/import", { method: "POST", body: Buffer.from("junk") });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_package");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("exports a zip and 404s unknown ids", async () => {
    await importGood();
    const res = await app.request("/api/packages/demo/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect((await app.request("/api/packages/nope/export")).status).toBe(404);
  });

  it("serves assets with mime type", async () => {
    await importGood();
    const res = await app.request("/api/packages/demo/assets/assets/dot.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("deletes content but keeps user state", async () => {
    await importGood();
    db.prepare(
      "INSERT INTO card_state (package_id,item_id,direction,interval_days,ease,reps,lapses,due_at) VALUES ('demo','card1','front',1,2.5,1,0,'2026-01-01T00:00:00.000Z')",
    ).run();
    expect((await app.request("/api/packages/demo", { method: "DELETE" })).status).toBe(204);
    expect(db.prepare("SELECT COUNT(*) n FROM lessons").get()).toMatchObject({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) n FROM card_state").get()).toMatchObject({ n: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/test/api.packages.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`server/src/app.ts`:
```ts
import { Hono } from "hono";
import type { Db } from "./db.js";
import { packageRoutes } from "./routes/packages.js";

export type AppEnv = { Variables: { db: Db } };

export function createApp(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });
  app.onError((err, c) =>
    c.json({ error: { code: "internal", message: err.message } }, 500),
  );
  app.notFound((c) => c.json({ error: { code: "not_found", message: "no such route or resource" } }, 404));
  app.route("/api/packages", packageRoutes());
  return app;
}
```

`server/src/routes/packages.ts`:
```ts
import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { importPackage } from "../importer.js";
import { exportPackage } from "../exporter.js";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  svg: "image/svg+xml", webp: "image/webp", mp3: "audio/mpeg",
};

export function packageRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/", (c) => {
    const db = c.get("db");
    const packages = (db.prepare("SELECT id, manifest FROM packages ORDER BY id").all() as any[]).map((p) => {
      const m = JSON.parse(p.manifest);
      const lessons = (db
        .prepare(
          `SELECT l.id, l.frontmatter, COALESCE(lp.status, 'not-started') AS status
           FROM lessons l LEFT JOIN lesson_progress lp
             ON lp.package_id = l.package_id AND lp.lesson_id = l.id
           WHERE l.package_id = ? ORDER BY l.ord`,
        )
        .all(p.id) as any[]).map((l) => {
          const fm = JSON.parse(l.frontmatter);
          return { id: l.id, title: fm.title, summary: fm.summary, status: l.status };
        });
      return {
        id: p.id, title: m.title, description: m.description, version: m.version,
        tags: m.tags, lessonCount: lessons.length, lessons,
      };
    });
    return c.json({ packages });
  });

  r.post("/import", async (c) => {
    const body = Buffer.from(await c.req.arrayBuffer());
    const res = importPackage(c.get("db"), body);
    if (!res.ok) {
      return c.json(
        { error: { code: "invalid_package", message: "package failed validation", details: res.errors } },
        422,
      );
    }
    return c.json({ packageId: res.packageId }, 201);
  });

  r.get("/:id/export", (c) => {
    const zip = exportPackage(c.get("db"), c.req.param("id"));
    if (!zip) return c.json({ error: { code: "not_found", message: "unknown package" } }, 404);
    return c.body(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${c.req.param("id")}.zip"`,
    });
  });

  r.delete("/:id", (c) => {
    c.get("db").prepare("DELETE FROM packages WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });

  r.get("/:id/assets/*", (c) => {
    const path = c.req.path.split("/assets/").slice(1).join("/assets/");
    const assetPath = `assets/${path.replace(/^assets\//, "")}`;
    const row = c.get("db")
      .prepare("SELECT data FROM assets WHERE package_id = ? AND path = ?")
      .get(c.req.param("id"), assetPath) as { data: Buffer } | undefined;
    if (!row) return c.json({ error: { code: "not_found", message: "unknown asset" } }, 404);
    const ext = assetPath.split(".").pop() ?? "";
    return c.body(row.data.buffer.slice(row.data.byteOffset, row.data.byteOffset + row.data.byteLength) as ArrayBuffer, 200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
    });
  });

  return r;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/test/api.packages.test.ts`
Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: package API — list, import, export, delete, assets"
```

### Task 11: Server — lesson + progress + exercise-attempt routes

**Files:**
- Create: `server/src/routes/lessons.ts`, `server/src/routes/attempts.ts`
- Modify: `server/src/app.ts` (two `app.route` lines)
- Test: `server/test/api.lessons.test.ts`

**Interfaces:**
- Consumes: `checkAnswer`, `splitLessonBody` types (shared); `createApp` pattern from Task 10.
- Produces:
  - `GET /api/lessons/:packageId/:lessonId` → `{ lesson: { id, title, frontmatter, body }, items: Record<string, Item>, progress: "not-started" | "in-progress" | "completed" }` — `items` contains every item referenced by the body's directives **or** frontmatter `activities` (the client never fetches items separately). 404 if unknown.
  - `POST /api/lessons/:packageId/:lessonId/progress` body `{ status: "in-progress" | "completed" }` → `{ ok: true }`, upserts `lesson_progress` (404 on unknown lesson).
  - `POST /api/attempts` body `{ packageId, itemId, answer: Answer }` → `200 CheckResult`, logs an `attempts` row (`kind='exercise'`). `404` unknown item; `422` flashcard or type-mismatch (`code: "not_checkable"`).
  Task 15/16 (web) consume exactly these shapes.

- [ ] **Step 1: Write the failing tests**

`server/test/api.lessons.test.ts`:
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  db = openDb(mkdtempSync(join(tmpdir(), "study-")));
  app = createApp(db);
  await app.request("/api/packages/import", { method: "POST", body: makeZip(GOOD_FILES) });
});

describe("lesson routes", () => {
  it("returns lesson body, referenced items, and progress", async () => {
    const res = await app.request("/api/lessons/demo/intro");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lesson.title).toBe("Intro");
    expect(body.items.mc1.type).toBe("multiple-choice");
    expect(body.progress).toBe("not-started");
  });

  it("upserts progress", async () => {
    const post = await app.request("/api/lessons/demo/intro/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(post.status).toBe(200);
    const body = await (await app.request("/api/lessons/demo/intro")).json();
    expect(body.progress).toBe("completed");
  });

  it("404s unknown lessons", async () => {
    expect((await app.request("/api/lessons/demo/ghost")).status).toBe(404);
  });
});

describe("attempts", () => {
  it("checks an exercise answer server-side and logs it", async () => {
    const res = await app.request("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "demo", itemId: "mc1", answer: { type: "multiple-choice", optionId: "a" } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ correct: true, score: 1 });
    expect(db.prepare("SELECT kind, correct FROM attempts").get()).toMatchObject({ kind: "exercise", correct: 1 });
  });

  it("422s a flashcard answer", async () => {
    const res = await app.request("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "demo", itemId: "card1", answer: { type: "short-answer", text: "x" } }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("not_checkable");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/test/api.lessons.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`server/src/routes/lessons.ts`:
```ts
import { Hono } from "hono";
import { activityIdsInBody } from "@study/shared";
import type { AppEnv } from "../app.js";

export function lessonRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/:packageId/:lessonId", (c) => {
    const db = c.get("db");
    const { packageId, lessonId } = c.req.param();
    const row = db
      .prepare("SELECT id, frontmatter, body FROM lessons WHERE package_id = ? AND id = ?")
      .get(packageId, lessonId) as any;
    if (!row) return c.json({ error: { code: "not_found", message: "unknown lesson" } }, 404);
    const frontmatter = JSON.parse(row.frontmatter);
    const ids = [...new Set([...activityIdsInBody(row.body), ...(frontmatter.activities ?? [])])];
    const items: Record<string, unknown> = {};
    const getItem = db.prepare("SELECT data FROM items WHERE package_id = ? AND id = ?");
    for (const id of ids) {
      const item = getItem.get(packageId, id) as any;
      if (item) items[id] = JSON.parse(item.data);
    }
    const prog = db
      .prepare("SELECT status FROM lesson_progress WHERE package_id = ? AND lesson_id = ?")
      .get(packageId, lessonId) as any;
    return c.json({
      lesson: { id: row.id, title: frontmatter.title, frontmatter, body: row.body },
      items,
      progress: prog?.status ?? "not-started",
    });
  });

  r.post("/:packageId/:lessonId/progress", async (c) => {
    const db = c.get("db");
    const { packageId, lessonId } = c.req.param();
    const exists = db.prepare("SELECT 1 FROM lessons WHERE package_id = ? AND id = ?").get(packageId, lessonId);
    if (!exists) return c.json({ error: { code: "not_found", message: "unknown lesson" } }, 404);
    const { status } = await c.req.json();
    if (status !== "in-progress" && status !== "completed") {
      return c.json({ error: { code: "bad_request", message: "status must be in-progress|completed" } }, 400);
    }
    db.prepare(
      `INSERT INTO lesson_progress (package_id, lesson_id, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(package_id, lesson_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    ).run(packageId, lessonId, status, new Date().toISOString());
    return c.json({ ok: true });
  });

  return r;
}
```

`server/src/routes/attempts.ts`:
```ts
import { Hono } from "hono";
import { checkAnswer } from "@study/shared";
import type { AppEnv } from "../app.js";

export function attemptRoutes() {
  const r = new Hono<AppEnv>();

  r.post("/", async (c) => {
    const db = c.get("db");
    const { packageId, itemId, answer } = await c.req.json();
    const row = db.prepare("SELECT data FROM items WHERE package_id = ? AND id = ?").get(packageId, itemId) as any;
    if (!row) return c.json({ error: { code: "not_found", message: "unknown item" } }, 404);
    try {
      const result = checkAnswer(JSON.parse(row.data), answer);
      db.prepare(
        "INSERT INTO attempts (package_id, kind, item_id, answer, correct, score, at) VALUES (?, 'exercise', ?, ?, ?, ?, ?)",
      ).run(packageId, itemId, JSON.stringify(answer), result.correct ? 1 : 0, result.score, new Date().toISOString());
      return c.json(result);
    } catch (e) {
      return c.json({ error: { code: "not_checkable", message: (e as Error).message } }, 422);
    }
  });

  return r;
}
```

In `server/src/app.ts` add after the packages route:
```ts
import { lessonRoutes } from "./routes/lessons.js";
import { attemptRoutes } from "./routes/attempts.js";
// inside createApp, after app.route("/api/packages", …):
app.route("/api/lessons", lessonRoutes());
app.route("/api/attempts", attemptRoutes());
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/test/api.lessons.test.ts`
Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: lesson, progress, and exercise-attempt API"
```

### Task 12: Server — review routes (due queue, grade, free study)

**Files:**
- Create: `server/src/routes/review.ts`
- Modify: `server/src/app.ts` (one `app.route` line)
- Test: `server/test/api.review.test.ts`

**Interfaces:**
- Consumes: `schedule` (Task 6).
- Produces:
  - `GET /api/review/due` → `{ cards: [{ packageId, itemId, direction, front, back, examples?, isNew }] }` — every flashcard direction (`front` always; `back` when the item sets `reverse: true`) whose `card_state` row is missing (`isNew: true`) or has `due_at <= now`. New cards first, then oldest due; `front`/`back` are pre-swapped for `direction: "back"` so the client always shows `front` then reveals `back`.
  - `POST /api/review/grade` body `{ packageId, itemId, direction, rating }` → `{ state: CardState }`; loads prior state, calls `schedule`, upserts `card_state`, appends `review_log`. `404` unknown flashcard; `400` bad rating/direction.
  - `GET /api/review/free-study?packageId=<id>` → same card shape, ALL of that package's flashcard directions, no schedule reads or writes.
  Task 17 (Study page) consumes these.

- [ ] **Step 1: Write the failing tests**

`server/test/api.review.test.ts`:
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";
import { GOOD_FILES, makeZip } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  db = openDb(mkdtempSync(join(tmpdir(), "study-")));
  app = createApp(db);
  await app.request("/api/packages/import", { method: "POST", body: makeZip(GOOD_FILES) });
});

const grade = (direction: string, rating: string) =>
  app.request("/api/review/grade", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packageId: "demo", itemId: "card1", direction, rating }),
  });

describe("review", () => {
  it("due queue includes both directions of a reverse card, new first", async () => {
    const body = await (await app.request("/api/review/due")).json();
    expect(body.cards).toHaveLength(2); // card1 front + back (reverse: true)
    expect(body.cards.every((c: any) => c.isNew)).toBe(true);
    const back = body.cards.find((c: any) => c.direction === "back");
    expect(back).toMatchObject({ front: "hello", back: "hola" }); // pre-swapped
  });

  it("grading good pushes the card out of the due queue", async () => {
    const res = await grade("front", "good");
    expect(res.status).toBe(200);
    expect((await res.json()).state.intervalDays).toBe(1);
    const due = await (await app.request("/api/review/due")).json();
    expect(due.cards.map((c: any) => c.direction)).toEqual(["back"]);
    expect(db.prepare("SELECT COUNT(*) n FROM review_log").get()).toMatchObject({ n: 1 });
  });

  it("grading again keeps the card due now", async () => {
    await grade("front", "again");
    const due = await (await app.request("/api/review/due")).json();
    expect(due.cards.some((c: any) => c.direction === "front")).toBe(true);
  });

  it("free study returns all cards without touching state", async () => {
    const body = await (await app.request("/api/review/free-study?packageId=demo")).json();
    expect(body.cards).toHaveLength(2);
    expect(db.prepare("SELECT COUNT(*) n FROM card_state").get()).toMatchObject({ n: 0 });
  });

  it("validates rating and item", async () => {
    expect((await grade("front", "meh")).status).toBe(400);
    const res = await app.request("/api/review/grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "demo", itemId: "mc1", direction: "front", rating: "good" }),
    });
    expect(res.status).toBe(404); // mc1 is not a flashcard
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/test/api.review.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`server/src/routes/review.ts`:
```ts
import { Hono } from "hono";
import { schedule } from "@study/shared";
import type { CardState, FlashcardItem, Rating } from "@study/shared";
import type { AppEnv } from "../app.js";
import type { Db } from "../db.js";

interface CardRow { packageId: string; itemId: string; direction: "front" | "back";
  front: string; back: string; examples?: string[]; isNew: boolean; dueAt: string | null }

function allCards(db: Db, packageId?: string): CardRow[] {
  const rows = db
    .prepare(
      `SELECT i.package_id, i.id, i.data, s.due_at, s.item_id AS has_state, s.direction AS state_dir
       FROM items i
       LEFT JOIN card_state s ON s.package_id = i.package_id AND s.item_id = i.id
       WHERE i.type = 'flashcard' ${packageId ? "AND i.package_id = ?" : ""}`,
    )
    .all(...(packageId ? [packageId] : [])) as any[];
  // one row per (item, state) join — regroup per item, then expand directions
  const byItem = new Map<string, { pkg: string; item: FlashcardItem; states: Map<string, string> }>();
  for (const r of rows) {
    const key = `${r.package_id}/${r.id}`;
    const entry = byItem.get(key) ?? { pkg: r.package_id, item: JSON.parse(r.data), states: new Map() };
    if (r.has_state) entry.states.set(r.state_dir, r.due_at);
    byItem.set(key, entry);
  }
  const cards: CardRow[] = [];
  for (const { pkg, item, states } of byItem.values()) {
    const dirs: ("front" | "back")[] = item.reverse ? ["front", "back"] : ["front"];
    for (const direction of dirs) {
      const dueAt = states.get(direction) ?? null;
      cards.push({
        packageId: pkg, itemId: item.id, direction,
        front: direction === "front" ? item.front : item.back,
        back: direction === "front" ? item.back : item.front,
        examples: item.examples, isNew: dueAt === null, dueAt,
      });
    }
  }
  return cards;
}

export function reviewRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/due", (c) => {
    const now = new Date().toISOString();
    const cards = allCards(c.get("db"))
      .filter((card) => card.isNew || card.dueAt! <= now)
      .sort((a, b) => Number(b.isNew) - Number(a.isNew) || (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    return c.json({ cards: cards.map(({ dueAt, ...rest }) => rest) });
  });

  r.get("/free-study", (c) => {
    const packageId = c.req.query("packageId");
    if (!packageId) return c.json({ error: { code: "bad_request", message: "packageId required" } }, 400);
    return c.json({ cards: allCards(c.get("db"), packageId).map(({ dueAt, ...rest }) => rest) });
  });

  r.post("/grade", async (c) => {
    const db = c.get("db");
    const { packageId, itemId, direction, rating } = await c.req.json();
    if (!["again", "hard", "good", "easy"].includes(rating) || !["front", "back"].includes(direction)) {
      return c.json({ error: { code: "bad_request", message: "bad rating or direction" } }, 400);
    }
    const item = db
      .prepare("SELECT 1 FROM items WHERE package_id = ? AND id = ? AND type = 'flashcard'")
      .get(packageId, itemId);
    if (!item) return c.json({ error: { code: "not_found", message: "unknown flashcard" } }, 404);

    const prevRow = db
      .prepare("SELECT interval_days, ease, reps, lapses, due_at FROM card_state WHERE package_id = ? AND item_id = ? AND direction = ?")
      .get(packageId, itemId, direction) as any;
    const prev: CardState | null = prevRow
      ? { intervalDays: prevRow.interval_days, ease: prevRow.ease, reps: prevRow.reps, lapses: prevRow.lapses, dueAt: prevRow.due_at }
      : null;
    const now = new Date();
    const state = schedule(prev, rating as Rating, now);
    db.transaction(() => {
      db.prepare(
        `INSERT INTO card_state (package_id, item_id, direction, interval_days, ease, reps, lapses, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(package_id, item_id, direction) DO UPDATE SET
           interval_days = excluded.interval_days, ease = excluded.ease,
           reps = excluded.reps, lapses = excluded.lapses, due_at = excluded.due_at`,
      ).run(packageId, itemId, direction, state.intervalDays, state.ease, state.reps, state.lapses, state.dueAt);
      db.prepare(
        "INSERT INTO review_log (package_id, item_id, direction, rating, at) VALUES (?, ?, ?, ?, ?)",
      ).run(packageId, itemId, direction, rating, now.toISOString());
    })();
    return c.json({ state });
  });

  return r;
}
```

In `server/src/app.ts`:
```ts
import { reviewRoutes } from "./routes/review.js";
// inside createApp:
app.route("/api/review", reviewRoutes());
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/test/api.review.test.ts`
Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: review API — due queue, SM-2 grading, free study"
```

### Task 13: Server — sample package, seed, static serving, entrypoint

**Files:**
- Create: `server/sample/manifest.json`, `server/sample/lessons/01-spaced-repetition.md`, `server/sample/lessons/02-active-recall.md`, `server/sample/items.json`, `server/sample/quizzes.json`, `server/sample/games.json`, `server/src/index.ts`
- Modify: `server/src/app.ts` (static serving)
- Test: `server/test/seed.test.ts`

**Interfaces:**
- Consumes: `insertPackage`, `readPackageZip`/folder loading, `createApp`.
- Produces: `seedSampleIfEmpty(db: Db): void` (loads `server/sample/` as a package when `packages` is empty); `server/src/index.ts` entrypoint (`npm start` → migrate, seed, serve API + `web/dist` static on `:4321`). The sample package doubles as living documentation of the format.

- [ ] **Step 1: Write the sample package**

`server/sample/manifest.json`:
```json
{
  "formatVersion": "1.0.0",
  "id": "learning-how-to-learn",
  "title": "Learning How to Learn",
  "version": "1.0.0",
  "description": "A starter package about the study techniques this app is built on.",
  "tags": ["meta", "sample"],
  "objectives": [
    "Explain why spaced repetition beats cramming",
    "Use active recall instead of rereading"
  ]
}
```

`server/sample/lessons/01-spaced-repetition.md`:
```markdown
---
id: spaced-repetition
title: Spaced Repetition
summary: Why reviewing at increasing intervals beats cramming.
estimatedMinutes: 10
difficulty: beginner
tags: [memory]
---

## The forgetting curve

Memories decay fast at first, then slower. Each successful recall **flattens the curve** —
so the best moment to review is just before you'd forget.

::activity{id="mc-forgetting"}

## Intervals that grow

Rate a card *Good* and it comes back later each time: 1 day, then a few days, then weeks.
Rate it *Again* and it returns in the same session.

::activity{id="fb-intervals"}
```

`server/sample/lessons/02-active-recall.md`:
```markdown
---
id: active-recall
title: Active Recall
summary: Testing yourself beats rereading.
estimatedMinutes: 8
difficulty: beginner
tags: [memory]
activities: [sa-recall]
---

## Retrieval is practice

Rereading feels productive but builds little. **Pulling the answer from memory** is what
strengthens it — that's why every lesson here quizzes you as you read.

::activity{id="ord-study-loop"}
```

`server/sample/items.json`:
```json
[
  {
    "id": "mc-forgetting",
    "type": "multiple-choice",
    "prompt": "When is the most efficient moment to review a fact?",
    "options": [
      { "id": "a", "text": "Immediately after learning it", "feedback": "Too soon — the memory is still fresh, so the review adds little." },
      { "id": "b", "text": "Just before you would forget it", "correct": true },
      { "id": "c", "text": "After you have fully forgotten it", "feedback": "Now it's relearning, which costs more time." }
    ],
    "explanation": "Reviewing near the edge of forgetting gives the biggest boost per minute spent.",
    "tags": ["memory"]
  },
  {
    "id": "fb-intervals",
    "type": "fill-blank",
    "prompt": "Fill in the grading rule.",
    "template": "Rating a card {{1}} brings it back in the same session; rating it Good pushes it {{2}} out each time.",
    "blanks": [
      { "slot": 1, "accept": ["Again", "again"] },
      { "slot": 2, "accept": ["further", "farther", "longer"] }
    ]
  },
  {
    "id": "sa-recall",
    "type": "short-answer",
    "prompt": "One word: pulling an answer from memory instead of rereading it is called active ____.",
    "accept": ["recall", "retrieval"],
    "hints": ["It starts with r.", "Active ___ — the name of this lesson."]
  },
  {
    "id": "ord-study-loop",
    "type": "ordering",
    "prompt": "Order the study loop.",
    "steps": [
      { "id": "s1", "text": "Read a small chunk" },
      { "id": "s2", "text": "Close the source" },
      { "id": "s3", "text": "Recall it from memory" },
      { "id": "s4", "text": "Check and correct" }
    ]
  },
  { "id": "card-spacing", "type": "flashcard", "front": "Spacing effect", "back": "Reviews spread over time beat the same time spent cramming.", "reverse": true },
  { "id": "card-recall", "type": "flashcard", "front": "Active recall", "back": "Strengthening memory by retrieving it, not rereading it." },
  { "id": "card-curve", "type": "flashcard", "front": "Forgetting curve", "back": "Memory decays fast at first, slower after each successful review.", "examples": ["Ebbinghaus, 1885"] },
  {
    "id": "match-terms",
    "type": "matching",
    "prompt": "Match each technique to its description.",
    "pairs": [
      { "left": "Spaced repetition", "right": "Grow the gap between reviews" },
      { "left": "Active recall", "right": "Test yourself before checking" },
      { "left": "Interleaving", "right": "Mix topics within one session" }
    ],
    "tags": ["memory"]
  }
]
```

`server/sample/quizzes.json`:
```json
[
  {
    "id": "quiz-basics",
    "title": "Study techniques check",
    "items": ["mc-forgetting", "fb-intervals", "sa-recall", "ord-study-loop"],
    "passThreshold": 0.75
  }
]
```

`server/sample/games.json`:
```json
[
  { "id": "game-match", "template": "matching", "title": "Match the techniques", "source": { "itemIds": ["match-terms"] } },
  { "id": "game-speed", "template": "timed-round", "title": "Quick fire", "source": { "tags": ["memory"] }, "settings": { "timeLimitSeconds": 60 } }
]
```

- [ ] **Step 2: Write the failing test**

`server/test/seed.test.ts`:
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { seedSampleIfEmpty } from "../src/index.js";

describe("seedSampleIfEmpty", () => {
  it("imports the bundled sample exactly once", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "study-")));
    seedSampleIfEmpty(db);
    expect(db.prepare("SELECT id FROM packages").get()).toMatchObject({ id: "learning-how-to-learn" });
    const before = db.prepare("SELECT COUNT(*) n FROM items").get();
    seedSampleIfEmpty(db); // idempotent — DB not empty now
    expect(db.prepare("SELECT COUNT(*) n FROM items").get()).toEqual(before);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- server/test/seed.test.ts`
Expected: FAIL — `seedSampleIfEmpty` missing.

- [ ] **Step 4: Implement entrypoint**

`server/src/index.ts`:
```ts
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

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = join(HERE, "..", "sample");

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
  const errs = validatePackage(pkg);
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
  serve({ fetch: app.fetch, port: 4321 }, () =>
    console.log("study app on http://localhost:4321"),
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- server/test/seed.test.ts`
Expected: PASS. Also verify all server tests still pass: `npm test -- server`.

- [ ] **Step 6: Manual smoke**

Run: `npm start -w server` then `curl -s localhost:4321/api/packages | head -c 400`
Expected: JSON listing `learning-how-to-learn` with 2 lessons. Ctrl-C the server.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat: bundled sample package, first-run seed, server entrypoint"
```

> **Web testing approach (Tasks 14–17):** all decision logic (checking, scheduling, splitting) already lives in `shared/` under unit test, and every API behavior is integration-tested. The web tasks therefore verify by running the app (steps below) — the automated safety net for the UI is Task 18's Playwright e2e. Don't add a jsdom component-test layer; it would duplicate the e2e at higher maintenance cost.

### Task 14: Web — scaffold, API client, Library page

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/src/api.ts`, `web/src/pages/Library.tsx`

**Interfaces:**
- Consumes: Task 10's package API shapes.
- Produces: `api.ts` typed client used by all pages:
  ```ts
  listPackages(): Promise<PackageSummary[]>
  importPackageZip(file: File): Promise<{ packageId: string }>   // throws ApiError with .details on 422
  deletePackage(id: string): Promise<void>
  exportUrl(id: string): string                                   // href for download
  getLesson(packageId, lessonId): Promise<LessonPayload>
  setProgress(packageId, lessonId, status): Promise<void>
  submitAnswer(packageId, itemId, answer): Promise<CheckResult>
  getDueCards(): Promise<Card[]>
  getFreeStudy(packageId): Promise<Card[]>
  gradeCard(packageId, itemId, direction, rating): Promise<void>
  ```
  Routes registered in `App.tsx`: `/` (Library), `/lesson/:packageId/:lessonId`, `/study`.

- [ ] **Step 1: Scaffold the web workspace**

`web/package.json`:
```json
{
  "name": "@study/web",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": {
    "@study/shared": "*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0"
  }
}
```

`web/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src"]
}
```

`web/vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:4321" } },
});
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Study</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/index.css`:
```css
:root { font-family: system-ui, sans-serif; line-height: 1.6; color-scheme: light dark; }
body { margin: 0; }
nav { display: flex; gap: 1rem; padding: 0.75rem 1.5rem; border-bottom: 1px solid #8884; }
nav a { text-decoration: none; font-weight: 600; }
main { max-width: 46rem; margin: 0 auto; padding: 1.5rem; }
button { cursor: pointer; padding: 0.4rem 0.9rem; border-radius: 6px; border: 1px solid #8886; }
button.primary { background: #4667d6; color: white; border-color: transparent; }
.card { border: 1px solid #8884; border-radius: 10px; padding: 1rem 1.25rem; margin: 1rem 0; }
.correct { color: #1a7f37; } .incorrect { color: #cf222e; }
.error-list { color: #cf222e; font-size: 0.9rem; }
img { max-width: 100%; }
```

`web/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

`web/src/App.tsx`:
```tsx
import { Link, Route, Routes } from "react-router-dom";
import Library from "./pages/Library.js";
import Lesson from "./pages/Lesson.js";
import Study from "./pages/Study.js";

export default function App() {
  return (
    <>
      <nav>
        <Link to="/">Library</Link>
        <Link to="/study">Study</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/lesson/:packageId/:lessonId" element={<Lesson />} />
          <Route path="/study" element={<Study />} />
        </Routes>
      </main>
    </>
  );
}
```

(Create `web/src/pages/Lesson.tsx` and `web/src/pages/Study.tsx` as placeholders that render `<p>Coming in Task 16/17</p>` so the app compiles; Tasks 16–17 replace them.)

- [ ] **Step 2: Implement the API client**

`web/src/api.ts`:
```ts
import type { Answer, CheckResult, Item, PackageError, Rating } from "@study/shared";

export interface LessonSummary { id: string; title: string; summary?: string; status: string }
export interface PackageSummary {
  id: string; title: string; description?: string; version: string;
  tags?: string[]; lessonCount: number; lessons: LessonSummary[];
}
export interface LessonPayload {
  lesson: { id: string; title: string; frontmatter: Record<string, unknown> & { activities?: string[] }; body: string };
  items: Record<string, Item>;
  progress: "not-started" | "in-progress" | "completed";
}
export interface Card {
  packageId: string; itemId: string; direction: "front" | "back";
  front: string; back: string; examples?: string[]; isNew: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public code: string, public details?: PackageError[]) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 204) return undefined as T;
  const body = await res.json();
  if (!res.ok) throw new ApiError(body.error?.message ?? res.statusText, body.error?.code ?? "unknown", body.error?.details);
  return body as T;
}
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const listPackages = () => req<{ packages: PackageSummary[] }>("/api/packages").then((r) => r.packages);
export const importPackageZip = async (file: File) =>
  req<{ packageId: string }>("/api/packages/import", { method: "POST", body: await file.arrayBuffer() });
export const deletePackage = (id: string) => req<void>(`/api/packages/${id}`, { method: "DELETE" });
export const exportUrl = (id: string) => `/api/packages/${id}/export`;
export const getLesson = (packageId: string, lessonId: string) =>
  req<LessonPayload>(`/api/lessons/${packageId}/${lessonId}`);
export const setProgress = (packageId: string, lessonId: string, status: "in-progress" | "completed") =>
  req<{ ok: true }>(`/api/lessons/${packageId}/${lessonId}/progress`, json({ status })).then(() => undefined);
export const submitAnswer = (packageId: string, itemId: string, answer: Answer) =>
  req<CheckResult>("/api/attempts", json({ packageId, itemId, answer }));
export const getDueCards = () => req<{ cards: Card[] }>("/api/review/due").then((r) => r.cards);
export const getFreeStudy = (packageId: string) =>
  req<{ cards: Card[] }>(`/api/review/free-study?packageId=${encodeURIComponent(packageId)}`).then((r) => r.cards);
export const gradeCard = (packageId: string, itemId: string, direction: string, rating: Rating) =>
  req<unknown>("/api/review/grade", json({ packageId, itemId, direction, rating })).then(() => undefined);
```

- [ ] **Step 3: Implement the Library page**

`web/src/pages/Library.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError, deletePackage, exportUrl, importPackageZip, listPackages, type PackageSummary,
} from "../api.js";

export default function Library() {
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => listPackages().then(setPackages).catch((e) => setErrors([String(e)]));
  useEffect(() => { refresh(); }, []);

  async function onImport(file: File) {
    setErrors([]);
    try {
      await importPackageZip(file);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        setErrors(e.details.map((d) => `${d.file} ${d.path ? `(${d.path})` : ""}: ${d.message}`));
      } else setErrors([String(e)]);
    }
  }

  if (!packages) return <p>Loading…</p>;
  return (
    <>
      <h1>Library</h1>
      <p>
        <button className="primary" onClick={() => fileInput.current?.click()}>Import package (.zip)</button>
        <input ref={fileInput} type="file" accept=".zip" hidden
          onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
      </p>
      {errors.length > 0 && (
        <ul className="error-list">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
      {packages.map((p) => (
        <div className="card" key={p.id}>
          <h2>{p.title} <small>v{p.version}</small></h2>
          {p.description && <p>{p.description}</p>}
          <ul>
            {p.lessons.map((l) => (
              <li key={l.id}>
                <Link to={`/lesson/${p.id}/${l.id}`}>{l.title}</Link>
                {l.status !== "not-started" && <em> — {l.status}</em>}
              </li>
            ))}
          </ul>
          <p>
            <a href={exportUrl(p.id)} download>Export</a>{" · "}
            <button onClick={() => { if (confirm(`Delete "${p.title}"? Your progress is kept.`)) deletePackage(p.id).then(refresh); }}>
              Delete
            </button>
          </p>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Verify by running**

Run: `npm install`, then in one terminal `npm start -w server`, in another `npm run dev -w web`. Open `http://localhost:5173`.
Expected: sample package listed with 2 lessons; Export downloads a zip; importing that zip back succeeds (list unchanged); importing a text file renamed `.zip` shows a readable error list; Delete removes it (re-seed by restarting the server with an empty DB, or re-import the exported zip).

- [ ] **Step 5: Commit**

```bash
git add web package-lock.json
git commit -m "feat: web scaffold, typed API client, library page"
```

### Task 15: Web — activity components (exercise player)

**Files:**
- Create: `web/src/components/Markdown.tsx`, `web/src/components/ActivityView.tsx`

**Interfaces:**
- Consumes: `Item`, `Answer`, `CheckResult` types (shared); `submitAnswer` (Task 14).
- Produces:
  - `<Markdown packageId={id}>{md}</Markdown>` — GFM rendering; rewrites `assets/…` image srcs to `/api/packages/:id/assets/assets/…`.
  - `<ActivityView packageId={id} item={item} />` — renders any `Item`; on submit calls `submitAnswer`, shows ✓/✗, score, per-option `feedback`, item `explanation`, and progressive hints; flashcards render as click-to-reveal (no grading — scheduling lives on the Study page).
  Task 16 embeds these; Task 17 reuses `Markdown`.

- [ ] **Step 1: Implement Markdown**

`web/src/components/Markdown.tsx`:
```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ packageId, children }: { packageId: string; children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) =>
        url.startsWith("assets/") ? `/api/packages/${packageId}/${url}` : url
      }
    >
      {children}
    </ReactMarkdown>
  );
}
```

> Note: the server's asset route is `/api/packages/:id/assets/*` where `*` is the full stored path (`assets/foo.png`), so the rewritten URL is `/api/packages/demo/assets/foo.png` → route strips and re-adds the `assets/` prefix (Task 10 handles both forms, and its test covers the server side).

- [ ] **Step 2: Implement ActivityView**

`web/src/components/ActivityView.tsx`:
```tsx
import { useState } from "react";
import type { Answer, CheckResult, Item } from "@study/shared";
import { submitAnswer } from "../api.js";
import Markdown from "./Markdown.js";

export default function ActivityView({ packageId, item }: { packageId: string; item: Item }) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = (answer: Answer) =>
    submitAnswer(packageId, item.id, answer).then(setResult).catch((e) => setError(String(e)));

  if (item.type === "flashcard") return <FlashcardReveal item={item} packageId={packageId} />;

  return (
    <div className="card">
      <Markdown packageId={packageId}>{item.prompt}</Markdown>
      <AnswerForm item={item} disabled={!!result} onSubmit={submit} />
      {item.hints && hintsShown < item.hints.length && !result && (
        <p><button onClick={() => setHintsShown(hintsShown + 1)}>Hint</button></p>
      )}
      {item.hints?.slice(0, hintsShown).map((h, i) => <p key={i}><em>Hint: {h}</em></p>)}
      {result && (
        <div>
          <p className={result.correct ? "correct" : "incorrect"}>
            {result.correct ? "✓ Correct" : `✗ Not quite${result.score > 0 ? ` (score ${Math.round(result.score * 100)}%)` : ""}`}
          </p>
          {!result.correct && result.feedback && <p>{result.feedback}</p>}
          {!result.correct && <p>Answer: <code>{JSON.stringify(result.expected)}</code></p>}
          {item.explanation && <Markdown packageId={packageId}>{item.explanation}</Markdown>}
          <button onClick={() => setResult(null)}>Try again</button>
        </div>
      )}
      {error && <p className="incorrect">{error}</p>}
    </div>
  );
}

function FlashcardReveal({ item, packageId }: { item: Extract<Item, { type: "flashcard" }>; packageId: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="card">
      <Markdown packageId={packageId}>{item.front}</Markdown>
      {shown
        ? <Markdown packageId={packageId}>{item.back}</Markdown>
        : <button onClick={() => setShown(true)}>Reveal</button>}
    </div>
  );
}

function AnswerForm({ item, disabled, onSubmit }:
  { item: Exclude<Item, { type: "flashcard" }>; disabled: boolean; onSubmit: (a: Answer) => void }) {
  switch (item.type) {
    case "multiple-choice": return <Options item={item} multi={false} disabled={disabled} onSubmit={onSubmit} />;
    case "multi-select": return <Options item={item} multi={true} disabled={disabled} onSubmit={onSubmit} />;
    case "fill-blank": return <FillBlank item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "short-answer": return <ShortAnswer item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "ordering": return <Ordering item={item} disabled={disabled} onSubmit={onSubmit} />;
    case "matching": return <Matching item={item} disabled={disabled} onSubmit={onSubmit} />;
  }
}

function useShuffled<T>(arr: T[], active: boolean): T[] {
  const [order] = useState(() =>
    active ? [...arr.keys()].sort(() => Math.random() - 0.5) : [...arr.keys()]);
  return order.map((i) => arr[i]!);
}

function Options({ item, multi, disabled, onSubmit }: {
  item: Extract<Item, { type: "multiple-choice" | "multi-select" }>;
  multi: boolean; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const options = useShuffled(item.options, item.shuffle !== false);
  const toggle = (id: string) =>
    setPicked(multi ? (picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]) : [id]);
  return (
    <div>
      {options.map((o) => (
        <label key={o.id} style={{ display: "block" }}>
          <input type={multi ? "checkbox" : "radio"} name={item.id} disabled={disabled}
            checked={picked.includes(o.id)} onChange={() => toggle(o.id)} /> {o.text}
        </label>
      ))}
      <button className="primary" disabled={disabled || picked.length === 0}
        onClick={() => onSubmit(multi
          ? { type: "multi-select", optionIds: picked }
          : { type: "multiple-choice", optionId: picked[0]! })}>
        Check
      </button>
    </div>
  );
}

function FillBlank({ item, disabled, onSubmit }: {
  item: Extract<Item, { type: "fill-blank" }>; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const parts = item.template.split(/(\{\{\d+\}\})/);
  return (
    <div>
      <p>
        {parts.map((part, i) => {
          const m = /^\{\{(\d+)\}\}$/.exec(part);
          return m ? (
            <input key={i} size={12} disabled={disabled} value={answers[m[1]!] ?? ""}
              onChange={(e) => setAnswers({ ...answers, [m[1]!]: e.target.value })} />
          ) : <span key={i}>{part}</span>;
        })}
      </p>
      <button className="primary" disabled={disabled} onClick={() => onSubmit({ type: "fill-blank", answers })}>Check</button>
    </div>
  );
}

function ShortAnswer({ item, disabled, onSubmit }: {
  item: Extract<Item, { type: "short-answer" }>; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [text, setText] = useState("");
  return (
    <p>
      <input value={text} disabled={disabled} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text && onSubmit({ type: "short-answer", text })} />{" "}
      <button className="primary" disabled={disabled || !text} onClick={() => onSubmit({ type: "short-answer", text })}>Check</button>
    </p>
  );
}

function Ordering({ item, disabled, onSubmit }: {
  item: Extract<Item, { type: "ordering" }>; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [steps, setSteps] = useState(() => shuffleOnce(item.steps));
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSteps(next);
  };
  return (
    <div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.id}>
            {s.text}{" "}
            <button disabled={disabled} onClick={() => move(i, -1)}>↑</button>
            <button disabled={disabled} onClick={() => move(i, 1)}>↓</button>
          </li>
        ))}
      </ol>
      <button className="primary" disabled={disabled}
        onClick={() => onSubmit({ type: "ordering", orderedIds: steps.map((s) => s.id) })}>Check</button>
    </div>
  );
}
function shuffleOnce<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function Matching({ item, disabled, onSubmit }: {
  item: Extract<Item, { type: "matching" }>; disabled: boolean; onSubmit: (a: Answer) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const rights = [...new Set([...item.pairs.map((p) => p.right), ...(item.distractors ?? [])])];
  return (
    <div>
      {item.pairs.map((p) => (
        <p key={p.left}>
          {p.left} →{" "}
          <select disabled={disabled} value={choices[p.left] ?? ""}
            onChange={(e) => setChoices({ ...choices, [p.left]: e.target.value })}>
            <option value="" disabled>choose…</option>
            {rights.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </p>
      ))}
      <button className="primary"
        disabled={disabled || Object.keys(choices).length < item.pairs.length}
        onClick={() => onSubmit({ type: "matching", pairs: item.pairs.map((p) => ({ left: p.left, right: choices[p.left]! })) })}>
        Check
      </button>
    </div>
  );
}
```

> Implementation note: `shuffleOnce` is a plain function (deliberately no `use` prefix — it's called inside a `useState` initializer, which hook-lint would flag for a `use`-named function). `useShuffled` IS a hook and stays at component top level as written.

- [ ] **Step 3: Verify compilation**

Run: `npm run typecheck && npm run build -w web`
Expected: clean typecheck and build (components are exercised in the browser next task).

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "feat: activity components for all exercise item types"
```

### Task 16: Web — lesson player page

**Files:**
- Create: `web/src/pages/Lesson.tsx` (replaces the Task 14 placeholder)

**Interfaces:**
- Consumes: `getLesson`, `setProgress` (Task 14); `splitLessonBody` (shared); `Markdown`, `ActivityView` (Task 15).
- Produces: the `/lesson/:packageId/:lessonId` route — renders body segments in order (md → `Markdown`, activity → `ActivityView`), then frontmatter `activities` not already embedded, then a "Mark lesson complete" button. Marks `in-progress` on first load when status is `not-started`.

- [ ] **Step 1: Implement**

`web/src/pages/Lesson.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { activityIdsInBody, splitLessonBody } from "@study/shared";
import { getLesson, setProgress, type LessonPayload } from "../api.js";
import ActivityView from "../components/ActivityView.js";
import Markdown from "../components/Markdown.js";

export default function Lesson() {
  const { packageId = "", lessonId = "" } = useParams();
  const [data, setData] = useState<LessonPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLesson(packageId, lessonId)
      .then((d) => {
        setData(d);
        if (d.progress === "not-started") {
          setProgress(packageId, lessonId, "in-progress").catch(() => {});
        }
      })
      .catch((e) => setError(String(e)));
  }, [packageId, lessonId]);

  if (error) return <p className="incorrect">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const segments = splitLessonBody(data.lesson.body);
  const embedded = new Set(activityIdsInBody(data.lesson.body));
  const extra = (data.lesson.frontmatter.activities ?? []).filter((id) => !embedded.has(id));
  const done = data.progress === "completed";

  return (
    <>
      <p><Link to="/">← Library</Link></p>
      <h1>{data.lesson.title}</h1>
      {segments.map((seg, i) =>
        seg.kind === "md" ? (
          <Markdown key={i} packageId={packageId}>{seg.md}</Markdown>
        ) : data.items[seg.id] ? (
          <ActivityView key={i} packageId={packageId} item={data.items[seg.id]!} />
        ) : null,
      )}
      {extra.length > 0 && <h2>Practice</h2>}
      {extra.map((id) =>
        data.items[id] ? <ActivityView key={id} packageId={packageId} item={data.items[id]!} /> : null,
      )}
      <p>
        <button className="primary" disabled={done}
          onClick={() => setProgress(packageId, lessonId, "completed").then(() => setData({ ...data, progress: "completed" }))}>
          {done ? "✓ Lesson completed" : "Mark lesson complete"}
        </button>
      </p>
    </>
  );
}
```

- [ ] **Step 2: Verify by running**

With `npm start -w server` + `npm run dev -w web` running, open the sample package's *Spaced Repetition* lesson.
Expected: prose renders with the multiple-choice embedded mid-lesson at the exact directive point; answering wrong shows the option's feedback + explanation + expected answer; *Active Recall* lesson shows `sa-recall` under "Practice" (frontmatter-attached) and the ordering exercise inline with working ↑/↓; completing the lesson flips the Library status to "completed"; revisiting shows "in-progress" behavior correctly.

- [ ] **Step 3: Commit**

```bash
git add web
git commit -m "feat: lesson player with inline activities and progress"
```

### Task 17: Web — study page (due queue + free study)

**Files:**
- Create: `web/src/pages/Study.tsx` (replaces the Task 14 placeholder)

**Interfaces:**
- Consumes: `getDueCards`, `getFreeStudy`, `gradeCard`, `listPackages` (Task 14); `Markdown` (Task 15).
- Produces: the `/study` route. Due mode: fetch queue once, walk it card-by-card (front → Reveal → back + Again/Hard/Good/Easy); `again` re-appends the card locally to the end of the session queue; finished state shows "All caught up". Free-study mode: pick a package, same card walk but with Next instead of grades (never calls `gradeCard`).

- [ ] **Step 1: Implement**

`web/src/pages/Study.tsx`:
```tsx
import { useEffect, useState } from "react";
import type { Rating } from "@study/shared";
import { getDueCards, getFreeStudy, gradeCard, listPackages, type Card } from "../api.js";
import Markdown from "../components/Markdown.js";

export default function Study() {
  const [mode, setMode] = useState<"due" | "free">("due");
  const [packages, setPackages] = useState<{ id: string; title: string }[]>([]);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => { listPackages().then((ps) => setPackages(ps.map(({ id, title }) => ({ id, title })))); }, []);
  useEffect(() => {
    if (mode === "due") { setQueue(null); getDueCards().then(setQueue); }
    else setQueue(null);
    setRevealed(false); setReviewed(0);
  }, [mode]);

  const card = queue?.[0] ?? null;
  const advance = () => { setQueue((q) => q!.slice(1)); setRevealed(false); };

  async function grade(rating: Rating) {
    const c = card!;
    await gradeCard(c.packageId, c.itemId, c.direction, rating);
    setReviewed((n) => n + 1);
    if (rating === "again") setQueue((q) => [...q!.slice(1), c]);
    else advance();
    setRevealed(false);
  }

  return (
    <>
      <h1>Study</h1>
      <p>
        <label><input type="radio" checked={mode === "due"} onChange={() => setMode("due")} /> Due today</label>{" "}
        <label><input type="radio" checked={mode === "free"} onChange={() => setMode("free")} /> Free study</label>
        {mode === "free" && (
          <select defaultValue="" onChange={(e) => { setQueue(null); getFreeStudy(e.target.value).then(setQueue); }}>
            <option value="" disabled>pick a package…</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
      </p>
      {queue === null && mode === "due" && <p>Loading…</p>}
      {queue !== null && !card && (
        <p className="correct">{mode === "due" ? `All caught up — ${reviewed} reviewed.` : "Deck finished."}</p>
      )}
      {card && (
        <div className="card">
          {card.isNew && mode === "due" && <p><em>new card</em></p>}
          <Markdown packageId={card.packageId}>{card.front}</Markdown>
          {!revealed ? (
            <button className="primary" onClick={() => setRevealed(true)}>Reveal</button>
          ) : (
            <>
              <hr />
              <Markdown packageId={card.packageId}>{card.back}</Markdown>
              {card.examples?.map((ex, i) => <p key={i}><em>{ex}</em></p>)}
              {mode === "due" ? (
                <p>
                  <button onClick={() => grade("again")}>Again</button>{" "}
                  <button onClick={() => grade("hard")}>Hard</button>{" "}
                  <button onClick={() => grade("good")}>Good</button>{" "}
                  <button onClick={() => grade("easy")}>Easy</button>
                </p>
              ) : (
                <p><button className="primary" onClick={advance}>Next</button></p>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify by running**

Open `/study` with the sample package freshly imported.
Expected: 4 due cards (card-spacing front+back, card-recall front, card-curve front), "new card" badge on each; *Again* re-queues the card this session; *Good* advances; finishing shows the caught-up message with count; reloading shows an empty due queue (cards are now scheduled out); free study on the sample package walks all 4 directions with Next and leaves the due queue empty afterwards (no state written).

- [ ] **Step 3: Commit**

```bash
git add web
git commit -m "feat: study page — due queue with grading, free study"
```

### Task 18: E2E smoke + README

**Files:**
- Create: `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/smoke.spec.ts`, `README.md`
- Modify: root `package.json` (add `e2e` script)

**Interfaces:**
- Consumes: the whole app (`npm start -w server` serving built web).
- Produces: one Playwright spec covering the spec's e2e path (§7): import → lesson + exercise → review. Runs against the production-style single server on `:4321` (no Vite dev server) with a temp `STUDY_DATA_DIR`.

- [ ] **Step 1: Scaffold e2e**

`e2e/package.json`:
```json
{
  "name": "@study/e2e",
  "private": true,
  "type": "module",
  "devDependencies": { "@playwright/test": "^1.48.0" }
}
```

Add `"e2e"` to root `package.json` scripts, and `e2e` to the `workspaces` array:
```json
"e2e": "npm run build -w web && playwright test -c e2e"
```

`e2e/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: ".",
  use: { baseURL: "http://localhost:4321" },
  webServer: {
    command: "npm start -w server",
    port: 4321,
    reuseExistingServer: false,
    env: { STUDY_DATA_DIR: mkdtempSync(join(tmpdir(), "study-e2e-")) },
  },
});
```

- [ ] **Step 2: Write the smoke test**

`e2e/smoke.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("sample package: lesson → exercise → flashcard review", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Learning How to Learn" })).toBeVisible();

  await page.getByRole("link", { name: "Spaced Repetition" }).click();
  await expect(page.getByRole("heading", { name: "The forgetting curve" })).toBeVisible();

  // inline exercise: answer the embedded multiple-choice correctly
  await page.getByLabel(/just before you would forget/i).check();
  await page.getByRole("button", { name: "Check" }).first().click();
  await expect(page.getByText("✓ Correct")).toBeVisible();

  await page.getByRole("button", { name: "Mark lesson complete" }).click();
  await expect(page.getByRole("button", { name: "✓ Lesson completed" })).toBeVisible();

  // review flow
  await page.getByRole("link", { name: "Study" }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await page.getByRole("button", { name: "Reveal" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText(/All caught up — 4 reviewed/)).toBeVisible();

  // export produces a real zip
  await page.goto("/");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export" }).click();
  expect((await download).suggestedFilename()).toBe("learning-how-to-learn.zip");
});
```

- [ ] **Step 3: Run it**

Run: `npm install && npx playwright install chromium && npm run e2e`
Expected: 1 test PASSES. If the multiple-choice label locator is flaky due to option shuffling, target by option text as written (`getByLabel` matches the label text regardless of order).

- [ ] **Step 4: Write README**

`README.md`:
```markdown
# Study App

Local-first study platform: lessons with inline exercises, spaced-repetition
flashcards, quizzes and games (Stage 2), all driven by a portable package format.

## Run

    npm install
    npm run build -w web
    npm start -w server        # http://localhost:4321

Dev mode: `npm start -w server` + `npm run dev -w web` (Vite on :5173, proxies /api).

## Data

Everything lives in `data/study.db` (override dir: `STUDY_DATA_DIR`). Back up by
copying the file. Deleting a package keeps your progress; re-importing a package
updates content in place.

## Packages

A package is a zip: `manifest.json` + `lessons/*.md` (+ optional `items.json`,
`quizzes.json`, `games.json`, `assets/`). See `server/sample/` for a working
example and `docs/superpowers/specs/2026-08-03-study-app-design.md` for the full format.

## Tests

    npm test        # unit + integration
    npm run e2e     # Playwright smoke (builds web first)
```

- [ ] **Step 5: Full verification sweep**

Run: `npm run typecheck && npm test && npm run e2e`
Expected: everything green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: e2e smoke test and README"
```

---

## Post-plan checklist (for the executing session)

- Stage 1 delivers spec §8 stage 1 exactly: format, import/export, library, lesson player + exercises, flashcards + due queue + free study, sample package.
- Deferred to Stage 2 (do NOT build now): quiz runner UI, game templates UI. Their *content* (quizzes.json/games.json) already imports, validates, and round-trips — that's Stage 1's job.
- Deferred to Stage 3: notes, explain-back, home dashboard, orphaned-state purge action.






