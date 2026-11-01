# Study App — Design

**Date:** 2026-08-03
**Status:** Approved; Stages 1–2 implemented

## Overview

A local web app for studying and learning new concepts through active engagement:
reading lessons, answering embedded exercises, reviewing flashcards on a spaced-repetition
schedule, taking quizzes, playing content-driven games, writing notes, and explaining
concepts back in your own words.

All teaching content lives in a **portable package format** that can be imported and
exported losslessly. The app is a *player and tracker* for that format: content is
authored outside or inside the app (provenance doesn't matter), imported, studied, and
re-exported. Personal progress stays local and survives content updates.

### Requirements settled during brainstorming

- All study modes wanted: lessons/exercises, flashcards, quizzes, games, notes, explain-back.
- Content is primarily user-authored; no AI/API dependency in the core app.
- Runs as a local server with a SQLite database.
- Spaced repetition drives a "due today" queue, plus free study on demand that
  doesn't affect the schedule.
- Rich import/export of lessons, exercises, and games is a core requirement, not a
  bolt-on. Games are **built-in templates** fed by package content (no arbitrary
  bundled code).
- Node/TypeScript full stack.

### Chosen approach

Package-first platform, built in stages (Approach A). The format is designed first;
content tables and user-state tables are strictly separated; each build stage ships a
working app.

## 1. Architecture

One TypeScript repo, three parts:

- **`shared/`** — the package format's types and Zod validation schemas. Server and
  UI both import from here, so the format has exactly one definition.
- **`server/`** — Node + Hono + better-sqlite3. Serves the JSON API and the built
  frontend; one command starts everything on the loopback-only address
  `127.0.0.1:4321`. All data lives in a single SQLite file at `data/study.db` (WAL
  mode); live backups use SQLite's backup operation (`npm run backup -w server --
  <destination.db>`), while direct file copies require the app to be stopped.
- **`web/`** — Vite + React single-page app.

**Core rule: teaching content and personal state never mix.** Imported content goes in
content tables; review schedule, scores, notes, and explanations live in separate
user-state tables that reference content by stable IDs. That separation is what makes
export lossless and re-import safe.

## 2. Package format

A package is a zip (or folder). Prose is Markdown (human-writable, diffable);
structured content is JSON (machine-checkable). A minimal package is a manifest plus
one lesson; everything else is opt-in.

### 2.1 File layout

```
spanish-basics.zip
├── manifest.json          # required
├── lessons/               # required (≥1 lesson)
│   ├── 01-greetings.md    # YAML frontmatter + Markdown body
│   └── 02-numbers.md
├── items.json             # optional — the shared activity pool
├── quizzes.json           # optional
├── games.json             # optional
└── assets/                # optional — images/audio referenced from lessons
    └── map.png
```

### 2.2 Manifest — `manifest.json`

```ts
{
  formatVersion: string        // semver of the format itself, e.g. "1.0.0";
                               // importer validates/migrates on this
  id: string                   // globally unique slug, e.g. "spanish-basics"
  title: string
  version: string              // content version; bump + re-import updates in place
  description?: string
  language?: string            // BCP-47, e.g. "en", "es-MX"
  tags?: string[]
  authors?: string[]
  license?: string
  objectives?: string[]        // what you'll be able to do after this package
  prerequisites?: string[]     // package ids or freeform text
  units?: { id: string, title: string, lessonIds: string[] }[]
                               // optional grouping; omitted → flat ordered lesson list
  meta?: Record<string, unknown>  // freeform extension point
}
```

### 2.3 Lessons — `lessons/*.md`

YAML frontmatter + Markdown body:

```markdown
---
id: greetings
title: Greetings & Introductions
summary: Say hello, introduce yourself, ask how someone is.
objectives: ["Greet formally and informally", "Introduce yourself"]
estimatedMinutes: 15
difficulty: beginner        # beginner | intermediate | advanced
prerequisites: []           # lesson ids within this package
tags: [conversation]
activities: []              # optional item ids rendered after the body
---

## Formal vs informal

In Spanish, *usted* is formal...

::activity{id="mcq-usted"}

![Dialect map](assets/map.png)
```

Lesson ordering: filename sort order within `lessons/` (the `01-` prefix convention),
or the order given by `units` when present.

The `::activity{id="..."}` directive embeds any item from the pool at that exact point
in the prose — the player swaps it for the live interactive component. Items can also
be attached lesson-wide via the `activities` frontmatter key (rendered after the body),
or both.

### 2.4 Items — `items.json`, the shared activity pool

Items are defined once and reused everywhere: exercises present them inline with
instant feedback, quizzes score sets of them, games render them competitively.

Every item shares a base, then a discriminated union on `type`:

```ts
// Base — all types
{
  id: string
  type: "multiple-choice" | "multi-select" | "fill-blank" | "short-answer"
      | "ordering" | "matching" | "flashcard"
  prompt: string               // Markdown (flashcards use front/back instead)
  hints?: string[]             // progressive: revealed one at a time
  explanation?: string         // shown after answering — the "why"
  difficulty?: "beginner" | "intermediate" | "advanced"
  tags?: string[]
  media?: { src: string, alt?: string }[]   // paths into assets/
  meta?: Record<string, unknown>
}

// multiple-choice / multi-select
{ options: { id: string, text: string, correct?: boolean, feedback?: string }[]
                               // per-option feedback for wrong picks
  shuffle?: boolean            // default true
  partialCredit?: boolean }    // multi-select only, default false

// fill-blank
{ template: string             // "The capital of {{1}} is {{2}}."
  blanks: { slot: number, accept: string[], caseSensitive?: boolean }[] }

// short-answer
{ accept: string[]             // any match = correct
  match?: "exact" | "fold" | "regex" }  // default "fold": trim + case/accent-insensitive

// ordering
{ steps: { id: string, text: string }[] }  // listed in correct order; presented shuffled

// matching
{ pairs: { left: string, right: string }[]
  distractors?: string[] }     // extra wrong right-side entries

// flashcard
{ front: string, back: string  // Markdown
  reverse?: boolean            // also schedule the back→front direction
  examples?: string[] }
```

Type-level constraints enforced at validation: multiple-choice has exactly one
`correct: true` option; multi-select has at least one; fill-blank `blanks` slots must
match the `{{n}}` placeholders in `template`.

A short-answer `match: "regex"` pattern is at most 200 characters and may not use
backreferences. A group followed by `*`, `+` or `{n,}` may not contain, at any
depth, `*`, `+`, `{n,}`, `{n,m}` with m > 1, `?`, `{0,1}` or an alternation. A group
followed by `{n}` with n > 1 or `{n,m}` with m > 1 may not contain `*`, `+`, `{n,}`
or an alternation. Lazy forms count the same. This guards nested repetition;
it is not a full backtracking analysis: overlapping repeats in sequence and
ranged repeats inside bounded repeats may still pass. Stored patterns are checked
before any regex accept entry runs.

Typed answers (short-answer text and each fill-blank value) are capped at 200
characters. A matching item's pair texts and distractors are at most 2000
characters each. Lesson frontmatter `activities` may not list the same item twice;
repeated `::activity` directives in a lesson body stay allowed.

### 2.5 Quizzes — `quizzes.json`

```ts
{
  id: string
  title: string
  description?: string
  items: string[]              // item ids, in order
  shuffle?: boolean
  timeLimitSeconds?: number
  passThreshold?: number       // 0–1, e.g. 0.8 — shown as pass/fail on results
  meta?: Record<string, unknown>
}
```

Items run in listed order; `shuffle` defaults to false. When true, the quiz order
is shuffled once per run; an item's own `shuffle` still sets its option order. A
quiz lists at most 200 items and may not list an item twice.
`timeLimitSeconds` is at most 86400 (one day), the longest time a run can record.

The score is the mean item score over every quiz item. Partial credit counts and
an unanswered item scores 0. A run passes when its score is at least
`passThreshold` (with floating-point tolerance); without a threshold it has no pass
or fail. `timeLimitSeconds` counts down from Start. At expiry the answers lock,
the quiz submits as it stands and the stored time is capped at the limit. Each
run is one `attempts` row of kind `quiz`.

### 2.6 Games — `games.json`

```ts
{
  id: string
  template: "matching" | "timed-round" | "order-it"
  title: string
  source: { itemIds: string[] } | { tags: string[] }  // explicit list, or all items tagged X
  settings?: {
    timeLimitSeconds?: number
    roundSize?: number         // e.g. pairs per matching round
  }
  meta?: Record<string, unknown>
}
```

Template/content compatibility: `matching` consumes matching items; `timed-round`
consumes multiple-choice/multi-select; `order-it` consumes ordering items. A game
whose source resolves to zero compatible items fails validation at import.

| template | `roundSize` counts | default `roundSize` | default `timeLimitSeconds` |
|---|---|---|---|
| `matching` | pairs | 6 | none (stopwatch) |
| `timed-round` | questions | 10 | 60 |
| `order-it` | ordering items | 3 | none (stopwatch) |

- A `tags` source takes every item carrying any listed tag, in items.json order.
  An `itemIds` source keeps listed order and ignores duplicate ids. Both keep only
  the template's compatible types.
- A play is one round of `min(roundSize, available units)`; `roundSize` is at most
  200, and `timeLimitSeconds` at most 86400 (one day), the longest time a play can
  record. Matching pools pairs across resolved matching items; a repeated left keeps
  its first pair. Repeated right texts remain separate tiles.
- Up to 2 of the dealt items' distractors join the right column. A distractor
  equal to a dealt right is never dealt.
- Matching scores matched ÷ (dealt pairs + misses). Timed-round and order-it score
  the mean question score, including multi-select partial credit and ordering
  positions; unanswered questions score 0.
- Time is recorded and shown, never scored. Expiry ends the round and logs it.
  A matching play also ends, and is logged, at 2000 picks, the most one play carries.
  Each play is one `attempts` row of kind `game`, with `ref_id` = the game id;
  stored elapsed time is capped at the game's limit when it has one.
- The server checks every move and replays the submitted play to compute its
  recorded score. The client deals rounds; no server game session is created.

### 2.7 Validation & compatibility rules

- Zod validates everything on import; errors are reported per-file, per-path;
  import is all-or-nothing.
- Referential integrity checked at import: every `::activity` directive, quiz item id,
  game source, unit lessonId, and media path must resolve. Dangling refs → import
  rejected with a list of what's broken.
- Unknown fields are rejected (typo protection). Deliberate extensions go in `meta`,
  which round-trips untouched.
- `formatVersion` gates migration: the importer upgrades older packages it knows how
  to, refuses ones newer than itself.
- Export reproduces the package (content only) from the database. Lossless round-trip
  (import → export → identical content) is a test in the suite.
- **Stable IDs everywhere:** re-importing a bumped `version` of a package updates
  content in place; user progress on unchanged item ids survives.

## 3. Data model

**Content tables** — replaced wholesale on re-import, keyed by stable IDs:
`packages`, `lessons`, `items` (type-specific fields in a validated JSON column;
content is read-mostly, so no over-normalization), `quizzes`, `games`.

**User-state tables** — never touched by import:

- `card_state` — per flashcard (and per direction if `reverse`): due date, interval,
  ease, rep count, lapses. Drives the scheduler.
- `review_log` — every graded review: item, timestamp, rating.
- `attempts` — every exercise answer, quiz result, and game score, with timestamps.
- `lesson_progress` — per lesson: not started / in progress / completed.
- `notes` — Markdown body, optionally linked to a package or lesson, or standalone.
- `explanations` — explain-back write-ups: linked lesson, Markdown body, self-rated
  confidence, timestamp.

If a re-import drops an item, its orphaned user state is kept but hidden (purgeable
via a maintenance action) — never silently deleted.

## 4. Study modes

Every mode makes you *do* something with the material:

- **Lesson player** — rendered Markdown with exercises embedded inline via
  `::activity`; you answer as you read, get instant right/wrong feedback plus the
  item's `explanation`; finishing marks the lesson complete.
- **Exercises** — instant feedback, progressive hints, every attempt logged.
- **Flashcards** — a global **Due today** queue across all packages. Grades are
  Again / Hard / Good / Easy; an SM-2-style scheduler adjusts intervals (missed cards
  return sooner, easy cards push further out). **Free study** drills any package's
  cards without touching the schedule.
- **Quizzes** — a named set of items, scored at the end (with `passThreshold`
  pass/fail when defined); history accumulates so improvement is visible.
- **Games** — three built-in templates fed by package content: **Matching** (pair off
  matches against the clock), **Timed round** (multiple-choice countdown), **Order it**
  (arrange sequences). Scores are logged to `attempts`.
- **Notes** — Markdown editor; notes attach to a package/lesson or stand alone.
- **Explain-back** — pick a lesson, explain it in your own words in Markdown,
  self-rate confidence. Low-confidence explanations resurface on the home screen as
  "revisit" prompts.
- **Home screen** — cards due today, lessons in progress, revisit prompts: one glance
  says what to work on.

## 5. API and pages

REST JSON API (all under `/api`):

- `GET /packages`, `POST /packages/import`, `GET /packages/:id/export`,
  `DELETE /packages/:id`
- `GET /lessons/:packageId/:lessonId`, `POST /lessons/:packageId/:lessonId/progress`
- `GET /review/due`, `POST /review/grade`, `GET /review/free-study?packageId=…`
  (free study reads cards without touching schedule state)
- `POST /review/grade` with `direction: "back"` on a card without `reverse: true`
  returns 404 and writes nothing.
- `GET /quizzes/:packageId/:quizId` (quiz + whole items),
  `GET /games/:packageId/:gameId` (game, effective settings, resolved pool),
  `POST /games/:packageId/:gameId/check` (one move; writes nothing)
- `POST /attempts`: `{packageId, itemId, answer}` (exercise) |
  `{kind:"quiz", packageId, quizId, answers:[{itemId, answer:null|Answer}], elapsedSeconds}` |
  `{kind:"game", packageId, gameId, play, elapsedSeconds}`;
  `GET /attempts?packageId&kind&refId&limit` (refId needs kind quiz|game; limit
  1–200, default 50; newest first; rows for removed content are hidden)
- `GET /packages` also lists each package's quizzes and games with `runs` and `best`.
- Errors: 400 `invalid_request`, 404 `not_found`, 422 `not_checkable` /
  `invalid_package`; a rejected request writes nothing.
- `GET/POST/PATCH/DELETE /notes`
- `GET/POST/PATCH /explanations`

Answer checking happens server-side (single source of truth in `shared/` checking
functions), so results in `attempts` are trustworthy.

Pages: **Home**, **Library** (packages → lessons), **Lesson**, **Study** (due queue +
free study), **Quiz**, **Games**, **Notes** (incl. explain-back).

## 6. Error handling

- Import: validated with the shared Zod schemas; all-or-nothing (single transaction);
  rejection returns a readable list of every problem (file, path, message).
- API: one consistent JSON error shape `{ error: { code, message, details? } }`;
  UI surfaces errors inline/toast.
- SQLite in WAL mode; writes wrapped in transactions.
- Re-import conflicts: content is replaced by id; orphaned user state kept hidden
  (§3).

## 7. Testing

- **Unit (Vitest):** scheduler math, answer checking per item type, Zod schema
  validation, activity-directive parsing.
- **Round-trip:** import → export → content-identical package (the format's lossless
  guarantee, as a test).
- **API integration:** against a temp SQLite file.
- **E2E (Playwright, light):** import sample package → read a lesson and answer an
  inline exercise → review due cards.

## 8. Build stages (each ships a working app)

1. **Foundation** — `shared/` schemas, server + DB, import/export, Library, Lesson
   player with inline exercises, flashcards with the due queue + free study. Ships
   with a bundled sample package so the app is usable on day one. *(done)*
2. **Quizzes + games** — quiz runner with history; the three game templates. *(done)*
3. **Notes + explain-back + Home polish** — notes editor, explanations with revisit
   prompts, dashboard.

Each stage gets its own implementation plan.
