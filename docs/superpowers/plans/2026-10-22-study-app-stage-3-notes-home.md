# Study App — Stage 3 (Notes, explain-back, Home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec §8 Stage 3. That means four things: a Markdown notes editor whose notes attach to a package, to a lesson or to nothing; explain-back write-ups with a 1–5 self-rated confidence, where low ratings come back as revisit prompts; a Home dashboard at `/`; and a guarded per-package purge of the user state that removed content leaves behind.

**Architecture:** Two new user-state tables, `notes` and `explanations`, join `card_state`, `review_log`, `attempts` and `lesson_progress`. Like those four, they have no foreign key to content. One SQL builder, `LIVE` in `server/src/orphans.ts`, decides for all six tables whether a row's content still exists. `GET /api/attempts`, the `orphaned` and `revisit` flags, the orphan counts and the purge all go through it. The due queue, free study and `GET /api/packages` lesson status keep their own content-first joins, and tests pin that they agree with `LIVE`. The server does CRUD and computes flags and counts, against strict shared Zod contracts and DTOs in `shared/src/notes.ts` and `shared/src/maintenance.ts`. The web filters lists client-side with pure helpers. It builds Home from endpoints that already exist (`/api/review/due`, `/api/packages`, `/api/explanations?revisit=1`). It edits Markdown in a textarea with a Write/Preview toggle, backed by localStorage drafts.

**Tech Stack:** Node ≥ 20 (root `engines`, added by Stage 2), TypeScript 5.9.3 (`strict`, `noUncheckedIndexedAccess`), Zod 3.25.76, Hono 4.13.0 with @hono/node-server 1.19.17, better-sqlite3 11.10.0 (bundled SQLite with `json_extract`), Vitest 2.1.9, Vite 6.4.3, React 18.3.1, react-router-dom 7.18.2 (`BrowserRouter`, no data router), react-markdown 9.1.0 with remark-gfm 4.0.1, remark-math 6.0.0, rehype-katex 7.0.1 and KaTeX 0.16.47, and @playwright/test 1.62.1. All versions are as resolved in `package-lock.json`.

**Spec:** `docs/superpowers/specs/2026-08-03-study-app-design.md` (the plan argues from the spec; executors read both). **Baseline:** this plan assumes `docs/superpowers/plans/2026-10-22-study-app-stage-2-quizzes-games.md` has been fully executed.

## Global Constraints

- **Stage 2 is the baseline, and it must be fully done.** This plan uses Stage 2's names unchanged:
  - `server/src/http.ts`: `Parsed<T> = { ok: true; data: T } | { ok: false; response: Response }`, `apiError`, the async `parseJsonBody` and the synchronous `parseQuery`;
  - `server/src/attemptLog.ts`: `listAttempts` and its module-private `VISIBLE_ATTEMPT`;
  - `shared/src/requests.ts`: `gradeRequestSchema`, `progressRequestSchema`;
  - `web/src/format.ts`: `formatClock`, `remainingSeconds`, `percent`;
  - `PLAY_FILES` in `server/test/helpers.ts`;
  - the test files this plan extends: `server/test/api.play.test.ts`, `web/test/api.test.ts`, `web/test/format.test.ts`, and `e2e/play.spec.ts` (13 tests);
  - the `span.nav-label` nav labels, their `@media (max-width: 39.99rem)` collapse in `layout.css`, and the Icon names `quiz` and `game`;
  - `workers: 1` and `globalTeardown` in `e2e/playwright.config.ts`.

  If any of these is missing, stop: Stage 2 has not finished.
- **Stage 2 already shipped these, so no task here repeats them:**
  - follow-up #2 (the frontmatter extras de-duplicated);
  - follow-up #4 (400 `invalid_request` on progress, grade and attempts);
  - follow-up #7 (the e2e temp dir and its teardown);
  - follow-up #8 (`engines`);
  - follow-up #9 (`'back'` on a non-reverse card returns 404 and writes nothing);
  - the nav-label collapse below 40rem;
  - type-checking of `web/test`.
- On any conflict, the spec wins.
- The server listens on `127.0.0.1:4321` (`PORT` overrides the port). The DB is `data/study.db`, and `STUDY_DATA_DIR` overrides its directory.
- **IDs.**
  - Content ids match `/^[a-z0-9][a-z0-9_-]*$/i` and are at most 64 characters (`idSchema`, `shared/src/ids.ts:3-7`).
  - Note and explanation ids are `INTEGER PRIMARY KEY AUTOINCREMENT`.
  - Path ids use the Hono param `:id{[1-9][0-9]*}`. Any other value falls through to `app.notFound` and returns 404 `not_found`.
- **Strict schemas, no format change.** Every Zod object is `.strict()`, and deliberate extensions go only in `meta`. The package format does not change: `formatVersion` stays `"1.0.0"` and export stays content-only.
- **Errors.** The error shape is always `{ error: { code, message, details? } }`. Stage 3's codes are `invalid_request` 400, `not_found` 404 and `orphans_changed` 409, alongside Stage 2's `not_checkable` 422. A client mistake never produces a 500.
- **Request parsing.**
  - POST and PATCH bodies go through `parseJsonBody`. The `?revisit` query goes through `parseQuery`.
  - Each route has one fixed `invalidMessage`:
    - `request body is not a valid note`
    - `request body is not a valid note update`
    - `request body is not a valid explanation`
    - `request body is not a valid explanation update`
    - `request body is not a valid purge request`
    - `revisit must be 1` (the `?revisit` query)
  - Handlers run in this order: parse, then 404 lookups, then the 409 check, then the write. A write of more than one statement runs inside `db.transaction`.
- **The server computes every verdict, score, flag and count.** Confidence is a self-rating and is stored as given. The `revisit` and `orphaned` flags, the orphan counts and the purge results are all computed on the server.
- **Content and user state never mix.**
  - `notes` and `explanations` refer to content only by `(package_id, lesson_id)` and have no foreign key. They survive a package delete and a re-import.
  - Package export never includes them. The whole-DB backup does: `npm run backup -w server -- <dest>`.
- **Orphaned user state is kept but hidden.**
  - The app leaves it out of every default view: the Notes and Explain-back lists, the due queue and badge, lesson status, Home and the attempts history.
  - `GET /api/notes` and `GET /api/explanations` still return it, each row flagged `orphaned: true`, and Library → Leftover progress counts it.
  - It can still be reached by id, through the "From removed content" views, and by re-importing the same ids.
  - Nothing deletes it silently. The Leftover progress purge deletes it per package, and the user can still delete a single note (orphaned or not) from its editor. Explanations have no other delete path.
- **No new dependency, runtime or dev.** That rules out an editor library, jsdom, @testing-library and @hono/zod-validator.
- **ESM.** Import paths carry a `.js` suffix, and type-only imports use `import type`. Shared exports go only through `shared/src/index.ts`, and code imports them as `@study/shared`.
- **Docs and typing.**
  - Every new exported function in `shared/` and `server/` gets a Google-style JSDoc (Args/Returns/Raises), matching `shared/src/lessonBody.ts:18-31`.
  - New server code uses typed row interfaces and mappers, never `as any`.
- **Web unit tests.** They run in node with no DOM: pure helpers, plus `renderToStaticMarkup` for components (wrapped in `MemoryRouter` when they use `Link`). Clicks, races and storage behaviour are tested in Playwright, not in unit tests.
- **e2e.**
  - Every spec file shares one server and one DB. The seeded sample is `learning-how-to-learn`, with 1 quiz, 3 games and 3 flashcards (4 due cards).
  - `e2e/notes.spec.ts` runs `serial` and uses the lesson `active-recall`.
  - It never grades a card and never completes "Spaced Repetition".
  - Its request counters filter by HTTP method.
  - Its purge test restores the sample in a `finally` block.
  - Task 6's `e2e/smoke.spec.ts` test 2 follows the same rules: it uses `active-recall`, never grades a card and never completes a lesson.
- **TDD for every task.** Write the failing test, run it and see it fail, implement, run it green, then commit.
- **Commits.**
  - Use a conventional subject (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
  - Show the exact `git add <paths>` and `git commit -m "<subject>"`.
  - Add no AI-attribution lines: no `Co-Authored-By`, no "Generated with".
- **Verification.**
  - Every task ends with `npm test` and `npm run typecheck` green.
  - Every task that touches `web/` or `e2e/` (Tasks 6–14) also runs `npm run e2e`.
  - The post-plan checklist runs `npm test`, `npm run typecheck`, `npm run e2e` and `npm run validate:content -- content/web-app-reference content/matching-and-recommendation`.
  - If port 4321 is taken (by another checkout, or a dev server left running), prefix every e2e command with a free port, e.g. `PORT=4400 npm run e2e` or `PORT=4400 npx playwright test -c e2e notes.spec.ts`. The config reads `PORT` (`e2e/playwright.config.ts:6` at HEAD) and never reuses a running server (`reuseExistingServer: false`, :15 at HEAD). Never set `reuseExistingServer: true`: the tests would then run against another checkout's server and DB.
- **Line citations** refer to HEAD `645ee63`, before Stage 2. Stage 2 edits these cited files first: `App.tsx`, `Library.tsx`, `Lesson.tsx`, `api.ts`, `Icon.tsx`, `ActivityView.tsx`, `layout.css`, `components.css`, `shared/src/index.ts`, `schema.sql`, `packages.ts`, `lessons.ts`, `attempts.ts`, `app.ts`, `helpers.ts`, `db.test.ts`, the spec and `README.md`. In those files a cite marks the code to look for. Find it by its content, not by its line number. Stage 2 does not touch `Study.tsx`, `Markdown.tsx` or `smoke.spec.ts`, so their cites hold until a task of this plan edits them. `Lesson.tsx` moves twice: Stage 2 Task 5 adds the exported `lessonExtras` and merges :50-51 into one line, and Task 11 adds an import. So its cites here (:27, :41, :59, :107) are HEAD lines; find each one by its quoted code.

## Review Focus

1. **Orphan predicates and purge scope.** Input: state left behind by `DELETE /api/packages/:id`, or by a re-import that drops an item, lesson, quiz or game. Expected: one `LIVE` builder decides liveness for all six user-state tables. It is the predicate behind `GET /api/attempts` (`LIVE.attempts('a')`; `VISIBLE_ATTEMPT` is deleted), the `orphaned` and `revisit` flags, the orphan counts and the purge. The due queue and badge, free study and `GET /api/packages` lesson status keep their content-first joins (`allCards` in review.ts, the lessons query in packages.ts), and they must hide exactly the rows `LIVE` calls orphaned. Back-direction state of a non-reverse card, exercise attempts on a dropped item, quiz and game runs whose `ref_id` is gone, and progress on a dropped lesson are orphaned; standalone notes never are, and a live quiz run counts 0. A purge deletes only the named package's rows that are orphaned at purge time, deletes notes and explanations only when `includeWriting: true`, and on any mismatch in a purged kind returns 409 `orphans_changed` with 0 rows deleted. Pinned in Task 2 (`server/test/orphans.test.ts`, with the `sqlite_master` classification test and the free-study parity test), Task 5 (`server/test/api.maintenance.test.ts`) and Task 6 (the due/free-study and dropped-lesson regressions, the attempts-parity `describe` and the `LIVE.attempts` source guard; Stage 2's `GET /api/attempts` tests pass unchanged).
2. **Revisit rule boundaries.** Input: explanations of one lesson that are written, re-rated and re-explained. Expected: exactly one prompt per live lesson whose `MAX(id)` explanation has confidence ≤ 2, so 2 prompts and 3 does not. A newer explanation rated ≥ 3, or a PATCH that raises the latest row to ≥ 3, clears it; a newer low explanation moves it to the newest row; PATCHing an older row, or only the body, changes nothing. A removed lesson hides its prompt while the row stays with `orphaned: true`, and a re-import brings the prompt back. `?revisit=1` sorts by confidence ASC, then id ASC, and any other query returns 400 `invalid_request` "revisit must be 1", never the unfiltered list. Pinned in Task 4 (`server/test/api.explanations.test.ts`).
3. **Editor data safety.** Input: a same-tick double click on Save, a failed save, typing while a save is in flight, the Preview toggle, the first POST, a save after the note was deleted elsewhere, leaving through the nav, storage that throws or holds corrupt JSON, and a blank or over-cap body. Expected: a double click sends exactly one POST or PATCH; a failed save keeps the text and shows a `role=alert` that clears at the next attempt; text typed while a save is in flight stays dirty ("Unsaved changes") and stays in the draft, even when the user leaves the editor before the save resolves (the draft is then settled under the saved id, and opening that note offers Restore); Preview hides the textarea without unmounting it; after the first POST the URL becomes `/notes/<id>` with no remount and no refetch, so the textarea keeps its focus; a PATCH answered 404 "unknown note" keeps the text and switches to create mode, so the next Save POSTs the note again; coming back through the nav offers Restore; a broken store or corrupt JSON reads as "no draft" and never throws; Save is disabled for a blank body and for one over 100 000 characters, which the textarea keeps whole (no `maxlength`). Pinned in Task 7 (`web/test/drafts.test.ts`), Task 8 (the `MarkdownEditor` render with no `maxlength`), Task 9 (`e2e/notes.spec.ts` tests 1–2: Save disabled for blank and 100 001 characters, the 500, then the alert gone while the retry POST is still held and exactly one more POST after a double click, the `data-probe` that survives the Preview toggle and the first save and zero `GET /api/notes/:id` requests through step 6, "Unsaved changes" after typing while a PATCH sent by a same-tick double click is held, with exactly one PATCH and that text still in the localStorage draft, `Control+S` with the textarea still focused, the deleted-elsewhere alert and the re-creating POST in step 7, Restore after the `Library` nav click, and Restore of the text typed while the first POST was held and the editor was left through the nav) and Task 10 (test 3: exactly one POST `/api/explanations` under a 300 ms delayed route, then exactly one PATCH).
4. **Route move and shared e2e state.** Input: the Library moves from `/` to `/library` while three spec files share one server and one DB. Expected: `/` renders Home and `/library` the Library; no `to="/"` link still means the Library (`Lesson.tsx:41` and `:59` at HEAD, Stage 2's `Quiz.tsx` and `Game.tsx` "Back to the library"), and the `Study.tsx:232-234` empty-state link reads "Back home"; the Home NavLink has `end`, so it is current only on `/`, and Notes stays current on `/notes/*`; `smoke.spec.ts:6`, `smoke.spec.ts:82` and every `play.spec.ts` entry go to `/library`, so smoke's one-shot 500 on `**/api/packages` hits the Library; `play` and `smoke` pass after `notes.spec` because it never grades a card or completes "Spaced Repetition" and restores the sample. Pinned in Task 9 (`e2e/notes.spec.ts` test 2: `aria-current` on Notes at `/notes/new`), Task 12 (the `HomeView` renders; `e2e/notes.spec.ts` test 4: "Today" with a due figure equal to the length of `GET /api/review/due`, and `aria-current` on Home at `/` and on Notes at `/notes/explain/new`; the `goto("/")` grep over `e2e/smoke.spec.ts` and `e2e/play.spec.ts` (test 4's own Home entry in notes.spec.ts is intended), the `to="/"` grep, and the `Back home` / `Back to library` greps over `Study.tsx`) and Task 13 (test 5's `finally` re-import).
5. **Validation and error shape on the new routes.** Input: malformed or `null` JSON, unknown keys, a `lessonId` without a `packageId`, `lessonId` on an explanation PATCH, `?revisit=true`, a non-numeric `:id`, an unknown package or lesson target, a body edit on an orphaned note, `DELETE /api/explanations/1`, and raw SQL that breaks a CHECK. Expected: 400 `invalid_request` with the route's fixed message, never a 500; 404 `not_found` through `app.notFound` for a non-numeric id and for the missing DELETE route; 404 with no row written for an unknown target; 200 for the orphaned-note body edit, without re-checking its unchanged target; and the DB rejects a `lesson_id` without a `package_id` and confidence 0, 6 or 2.5. Pinned in Task 2 (`server/test/db.test.ts`), Task 3 (`server/test/api.notes.test.ts`), Task 4 (`server/test/api.explanations.test.ts`) and Task 5 (`server/test/api.maintenance.test.ts`).

## Decisions this plan makes

These are the defaults this plan adopts for the open questions. Change them here before execution.

1. **Writing on removed content.**
   - A note or explanation whose package or lesson is gone is hidden from the default lists.
   - A "From removed content (N)" view and a count notice reveal it.
   - It stays readable, editable and re-attachable, and it comes back on re-import.
2. **Purge and writing.**
   - The Leftover progress purge always deletes card schedules, review history, results and lesson progress.
   - It deletes notes and explanations only when the user ticks "Also delete …", which starts unticked.
3. **Revisit prompts.** There is no Dismiss action, and Home shows at most 5 prompts.
4. **Confidence.**
   - The scale is 1–5: 1 Lost, 2 Shaky, 3 Getting there, 4 Solid, 5 Could teach it.
   - Low means ≤ 2 (`LOW_CONFIDENCE_MAX = 2`), and the UI sets no default rating.
5. **Home "Cards due".** It shows the nav badge's number, which includes new cards.

**Amendments Task 14 writes.** The spec wins on conflict, so it must agree with this plan. Spec and README cites here are HEAD lines; Stage 2 Task 26 shifts them first.

- **Status line** (spec:4): "Approved; Stages 1–3 implemented".
- **§3** (spec:237-239 and 252-253):
  - the content-table list gains `assets`, so it names the same six tables as `CONTENT_TABLES`;
  - which six user-state tables can be orphaned, and each table's live rule;
  - what "hidden" means: left out of every default view in the app; the notes and explanations list APIs return such rows flagged `orphaned: true`, and Leftover progress counts them; reachable through the removed-content views and by id; back on re-import;
  - the Leftover progress purge: per package; always deletes progress, and deletes writing only by explicit opt-in; guarded by the previewed counts, with a 409 on mismatch.
- **§4** (spec:272-277):
  - the 1–5 scale and its labels, with low ≤ 2;
  - the revisit rule: a lesson's latest explanation by id, on a live lesson, rated ≤ 2. A newer rating of ≥ 3, raising the latest rating to ≥ 3, or a Leftover progress purge that deletes it (writing opt-in) clears it. There is no Dismiss;
  - Home: "Cards due" is the Study badge's number. Lessons in progress are ordered by last opened. There are at most 5 lessons in progress and at most 5 revisit prompts.
- **§5** (spec:281-296):
  - the routes: `GET/POST /notes`, `GET/PATCH/DELETE /notes/:id`, `GET/POST /explanations` (with `?revisit=1`), `GET/PATCH /explanations/:id` (no DELETE), `GET /maintenance/orphans` and `POST /maintenance/orphans/purge`;
  - note and explanation bodies are Markdown, non-blank, and at most 100 000 characters (a 100 001-character body is a 400);
  - Stage 2's "`GET /packages` also lists…" line adds that each started lesson carries `updatedAt` (last opened);
  - Stage 2's "Errors:" line gains 409 `orphans_changed` (purge only) and moves to the end of the route list;
  - the pages: Home at `/`, Library at `/library`, Notes at `/notes`, and explain-back at `/notes/explain/…`.
  - Stage 2 already fixes the `/lessons/:packageId/:lessonId` drift.
- **§6** (spec:305-306): the re-import bullet points at Library → Leftover progress.
- **§8:** mark Stage 3 done, the same way Stage 2 marks Stage 2.
- **`README.md`:**
  - the status lines (Stage 2 rewrote README.md:3-7);
  - the Home and Library routes;
  - notes and explain-back;
  - the Leftover progress cleanup;
  - the delete note (README.md:28-29 at HEAD) says that deleting a package keeps progress, notes and explanations, hidden until a re-import, and that Leftover progress deletes them for good;
  - notes and explanations are left out of package exports but included in `npm run backup`;
  - the Stage 3 routes join Stage 2's API list;
  - the Tests line names the notes spec beside smoke and play.

## File Structure

**shared/**
- `shared/src/notes.ts`, Create (T1): `BODY_MAX`, the note and explanation create and patch schemas, `noteTargetSchema`, the confidence scale (`CONFIDENCE_LEVELS`, `Confidence`, `LOW_CONFIDENCE_MAX`, `confidenceSchema`, `isLowConfidence`), and the `Note` and `Explanation` DTOs.
- `shared/src/maintenance.ts`, Create (T1): `ORPHAN_KINDS`, `OrphanKind`, `WRITING_KINDS`, `purgedKinds`, `orphanCountsSchema`, `purgeOrphansRequestSchema` and `OrphanGroup`.
- `shared/src/index.ts`, Modify (T1): re-export both new modules.
- `shared/test/notes.test.ts`, Create (T1): schema boundaries (blank body, 100 000 vs 100 001 characters, target shapes, empty patches, confidence 0/6/2.5/"3") and `isLowConfidence`.
- `shared/test/maintenance.test.ts`, Create (T1): count schema rejects -1 and 1.5; `purgedKinds(false)` and `purgedKinds(true)`.

**server/**
- `server/src/schema.sql`, Modify (T2): append the `notes` and `explanations` tables, their CHECKs, and the `notes_target` and `explanations_lesson` indexes. They go after Stage 2's `attempts_history` index. There is no `db.ts` change.
- `server/src/orphans.ts`, Create (T2): `CONTENT_TABLES`, `ORPHAN_TABLE`, `LIVE`, `orphanReport`, `countOrphans` and `purgeOrphans`. This is the single liveness rule for all six user-state tables.
- `server/src/routes/notes.ts`, Create (T3): `noteRoutes()` for GET, POST, PATCH and DELETE on `/api/notes`, with the typed `NoteRow` and `toNote`.
- `server/src/routes/explanations.ts`, Create (T4): `explanationRoutes()` for GET, POST and PATCH on `/api/explanations`, plus `revisitSql`, `ExplanationRow` and `toExplanation`.
- `server/src/routes/maintenance.ts`, Create (T5): `maintenanceRoutes()` for `GET /orphans` and `POST /orphans/purge`.
- `server/src/app.ts`, Modify (T3, T4, T5): mount `/api/notes`, `/api/explanations` and `/api/maintenance` after Stage 2's mounts.
- `server/src/http.ts`, Modify (T5): widen `apiError` to status `400 | 404 | 409 | 422` and add `'orphans_changed'` to its code union.
- `server/src/attemptLog.ts`, Modify (T6): `listAttempts` filters with `LIVE.attempts('a')` from `orphans.ts`. Delete `VISIBLE_ATTEMPT`.
- `server/src/routes/packages.ts`, Modify (T6): the lessons query also selects `lp.updated_at` (packages.ts:20 at HEAD). Each lesson returns `updatedAt` (packages.ts:27 at HEAD).
- `server/test/helpers.ts`, Modify (T2): add `V2_FILES`, which spreads `GOOD_FILES` without mutating it, renames lesson `intro` to `intro2`, drops `card1` and adds a non-reverse `card2`; add `seedUserState(db)` and the count constants `NO_ORPHANS`, `ORPHANS_AFTER_V2` and `ORPHANS_AFTER_DELETE`, shared by Tasks 2, 5 and 6. The plan reuses Stage 2's `PLAY_FILES` wherever it needs quizzes and games.
- `server/test/db.test.ts`, Modify (T2):
  - add `notes` and `explanations` to the expected tables (db.test.ts:35-36);
  - test the CHECKs;
  - test that a pre-Stage-3 DB gains both tables;
  - test that a second open is idempotent.
- `server/test/orphans.test.ts`, Create (T2), extend (T6): the `LIVE` rules per kind, `orphanReport`, a stale `expected` that deletes nothing, `includeWriting`, the `sqlite_master` classification test and the free-study parity test (T2); the source guard that `attemptLog.ts` filters through `LIVE.attempts` (T6).
- `server/test/api.notes.test.ts`, Create (T3): notes CRUD, the 400 and 404 paths, orphaned and re-attached notes.
- `server/test/api.explanations.test.ts`, Create (T4): create, PATCH, the revisit boundaries, `?revisit` validation, and that DELETE returns 404.
- `server/test/api.maintenance.test.ts`, Create (T5): orphan groups, a purge, the 409 `orphans_changed`, the writing opt-in, and the 400s.
- `server/test/api.review.test.ts`, Modify (T6): after a package delete or a `V2_FILES` re-import, no orphaned card appears in `/due` or `/free-study`.
- `server/test/api.packages.test.ts`, Modify (T6): started lessons carry `updatedAt`, and orphaned `lesson_progress` never appears.
- `server/test/api.play.test.ts` (Stage 2), Modify (T6): a new `describe` in which visible runs plus `countOrphans(…).attempts` equal all runs through a quiz drop, a package delete and a restore. Stage 2's `GET /api/attempts` tests stay unchanged.
- `server/test/roundtrip.test.ts`, Modify (T6): the export entries and round-trip are unchanged when a linked note and a linked explanation exist.

**web/**
- `web/src/api.ts`, Modify (T7): turn `json(body)` into `json(body, method)`, add `LessonSummary.updatedAt`, and add the notes, explanations and maintenance client functions.
- `web/src/format.ts` (Stage 2), Modify (T7): add `formatDay(iso: string): string`.
- `web/src/text.ts`, Create (T7): `headline`, `message`, `plural`, `describeCounts` and `purgeTotal`.
- `web/src/drafts.ts`, Create (T7): `DraftStore`, `browserDraftStore`, `draftKey`, `readDraft`, `writeDraft`, `clearDraft` and `useDraft`.
- `web/src/listFilter.ts`, Create (T7): `ListFilter`, `parseListFilter`, `filterSearch`, `filterNotes` and `filterExplanations`.
- `web/src/home.ts`, Create (T7): `InProgressLesson` and `lessonsInProgress`.
- `web/src/components/Markdown.tsx`, Modify (T8): `packageId` becomes optional, and `assetUrls` (Markdown.tsx:29-30) rewrites `assets/…` only when `packageId` is set.
- `web/src/components/Icon.tsx`, Modify (T8): add the `home` and `note` paths.
- `web/src/components/MarkdownEditor.tsx`, Create (T8): a labelled textarea with a Write/Preview toggle. The textarea stays mounted. It saves on Ctrl/Cmd+Enter and Ctrl/Cmd+S, shows a count near the cap, and has no `maxLength`.
- `web/src/components/ConfidencePicker.tsx`, Create (T8): `ConfidencePicker` (default export), `ConfidenceChip` and `CONFIDENCE_LABEL`.
- `web/src/components/TargetSelect.tsx`, Create (T8): `TargetSelect`, `TargetPackage`, `encodeTarget` and `decodeTarget`. Its `currentOnly` mode offers only Standalone and the given target, for the note editor's library-failed fallback.
- `web/src/styles/components.css`, Modify (T8, T11, T12, T13): a `/* ---- Notes ---- */` section with the editor, notes-list, confidence and chip styles (T8), `.lesson-companion` (T11) and the `.leftover-*` rules (T13); a `/* ---- Home ---- */` section with `.home-figure` (T12). It adds no new tokens.
- `web/src/pages/Notes.tsx`, Create (T9), extend (T10): the Notes tab and the `NotesListView` export (T9), then the tab switch and the `ExplanationsListView` export (T10).
- `web/src/pages/NoteEditor.tsx`, Create (T9): create, edit and delete a note, with drafts, the save guard and an orphan banner.
- `web/src/pages/ExplanationEditor.tsx`, Create (T10): explain a lesson, rate confidence, edit, and show earlier explanations. It has no delete.
- `web/src/components/LessonCompanion.tsx`, Create (T11): the "After this lesson" links to explain-back, a new note and the lesson's notes.
- `web/src/pages/Lesson.tsx`, Modify (T6, T11, T12):
  - T6: write in-progress whenever `progress !== 'completed'` (Lesson.tsx:27);
  - T11: render `LessonCompanion` after `.finish`;
  - T12: point the back links (Lesson.tsx:41 and :59 at HEAD) at `/library`.
- `web/src/App.tsx`, Modify (T9, T10, T12):
  - T9: the `/notes`, `/notes/new` and `/notes/:noteId` routes through `NoteRoute` (with `editorKey`), and the Notes NavLink (icon `note`, last);
  - T10: `/notes/explain/new` and `/notes/explain/:explanationId` through `ExplanationRoute`;
  - T12: `/` goes to Home and `/library` to Library; the Home NavLink (first, `end`, icon `home`); the Library NavLink goes to `/library`; a `document` `visibilitychange` listener calls `refreshDue()`; `refreshDue` returns its promise, so Home can tell a count still loading from one that failed.
- `web/src/pages/Home.tsx`, Create (T12): the container plus `HomeView`, with three sections: Cards due, Continue reading and Revisit.
- `web/src/styles/layout.css`, Modify (T12): add a new `@media (max-width: 59.99rem)` block after Stage 2's `@media (max-width: 39.99rem)` block. In it, `.rail` gets `min-width: 0` (otherwise the `1fr` column at layout.css:5 takes the rail's min-content width), `.nav` gets `overflow-x: auto` and `scrollbar-width: none`, and `.nav-item` gets `flex: none`. The reason: six labelled items need more than 640 px, so the top bar would overflow between 40rem and 60rem. Inside Stage 2's 39.99rem block, `.nav-item` gets `padding: var(--s2)`. Stage 2 already collapses the labels there.
- `web/src/pages/Study.tsx`, Modify (T12): the empty-state link (Study.tsx:232-234) keeps `/` and reads "Back home". `message` is imported from `text.ts` (Study.tsx:26).
- `web/src/pages/Quiz.tsx`, `web/src/pages/Game.tsx` (Stage 2), Modify (T12): the not-found "Back to the library" link goes to `/library`. Their "All quizzes" and "All games" back-links already go to `/quizzes` and `/games`. Stage 2's `Quizzes.tsx` and `Games.tsx` have no `to="/"` link (their "All packages" back-link goes to `/quizzes` or `/games`), and Task 12's grep proves it.
- `web/src/components/LeftoverProgress.tsx`, Create (T13): `LeftoverProgress` (the container, keyed by `refreshKey`) and `LeftoverProgressView` (pure). It handles the per-package Clear… confirm, the writing opt-in and the 409 retry.
- `web/src/pages/Library.tsx`, Modify (T13):
  - render the panel below the package list;
  - bump `refreshKey` after an import and after a delete (Library.tsx:46-48 and 61-63);
  - change the delete copy (Library.tsx:190) to "Delete it? Your progress and notes are kept.";
  - import `message` and `plural` from `text.ts` (Library.tsx:14, 16).
- `web/test/text.test.ts`, `web/test/drafts.test.ts`, `web/test/listFilter.test.ts` and `web/test/home.test.ts`, Create (T7): tests for the pure helpers.
- `web/test/format.test.ts` (Stage 2), Modify (T7): add `formatDay` cases.
- `web/test/api.test.ts` (Stage 2), Modify (T7): with `fetch` stubbed, the `?revisit=1` query, PATCH versus the default POST, a 204 delete, and a 409 surfacing as `ApiError` code `orphans_changed`.
- `web/test/rendering.test.tsx`, Modify (T8–T13): static renders of:
  - `Markdown` with and without `packageId`, and bad TeX;
  - `MarkdownEditor`, `ConfidencePicker` and `TargetSelect`;
  - `NotesListView` and `ExplanationsListView`;
  - `LessonCompanion`;
  - `HomeView`;
  - `LeftoverProgressView`.

**e2e/**
- `e2e/notes.spec.ts`, Create (T9) and extend (T10–T13). It runs `serial`.
  - T9: test 1 (the note flow) and test 2 (draft restore);
  - T10: test 3 (explain-back);
  - T11: tests 1 and 3 enter through the lesson-page links;
  - T12: test 4 (Home's due figure, nav state and revisit section);
  - T13: test 5 (purge, then re-import, with a `finally` that restores the sample).
- `e2e/smoke.spec.ts`, Modify (T6, T12):
  - T6: adds test 2 (reopening an unfinished lesson moves its last-opened time) after test 1, which stays unchanged;
  - T12: `page.goto("/library")` at smoke.spec.ts:6 and :82.
- `e2e/play.spec.ts` (Stage 2), Modify (T12): every `page.goto("/")` becomes `page.goto("/library")`.

**docs/**
- `docs/superpowers/specs/2026-08-03-study-app-design.md`, Modify (T14): the status line, §3, §4, §5, §6 and §8, as listed under Decisions.
- `README.md`, Modify (T14): status, routes, notes and explain-back, Leftover progress, the delete note, export versus backup, and the Tests line.

---

### Task 1: Shared contracts for notes, explanations and orphan purges

**Files:**
- Create: `shared/src/notes.ts` (note and explanation request schemas, the confidence scale, response DTOs)
- Create: `shared/src/maintenance.ts` (orphan kinds, counts, the purge request, report groups)
- Modify: `shared/src/index.ts` (append one value-export and one `export type` block per new module at the end, after Stage 2's exports, in the style of index.ts:28-31)
- Test: `shared/test/notes.test.ts`, `shared/test/maintenance.test.ts`

**Interfaces:**
- Consumes: `idSchema` (shared/src/ids.ts:4-7).
- Produces (all through `@study/shared`):
  - `BODY_MAX = 100_000`; `noteTargetSchema`, `noteCreateSchema`, `notePatchSchema`, `confidenceSchema`, `explanationCreateSchema`, `explanationPatchSchema`
  - `CONFIDENCE_LEVELS = [1, 2, 3, 4, 5] as const`; `type Confidence = (typeof CONFIDENCE_LEVELS)[number]`; `LOW_CONFIDENCE_MAX = 2`; `isLowConfidence(confidence: number): boolean`
  - types `NoteTarget`, `NoteCreate`, `NotePatch`, `ExplanationCreate`, `ExplanationPatch` (the `z.infer` of each schema)
  - `interface NoteTargetView extends NoteTarget { packageTitle: string | null; lessonTitle: string | null }`
  - `interface Note { id: number; body: string; target: NoteTargetView | null; orphaned: boolean; createdAt: string; updatedAt: string }`
  - `interface Explanation { id: number; packageId: string; lessonId: string; packageTitle: string | null; lessonTitle: string | null; body: string; confidence: Confidence; revisit: boolean; orphaned: boolean; createdAt: string; updatedAt: string }`
  - `ORPHAN_KINDS = ["cardState", "reviewLog", "attempts", "lessonProgress", "notes", "explanations"] as const`; `type OrphanKind`; `WRITING_KINDS = ["notes", "explanations"] as const satisfies readonly OrphanKind[]`; `purgedKinds(includeWriting: boolean): OrphanKind[]`
  - `orphanCountsSchema`, `type OrphanCounts` (one non-negative integer per OrphanKind); `purgeOrphansRequestSchema`, `type PurgeOrphansRequest = { packageId: string; includeWriting: boolean; expected: OrphanCounts }`
  - `interface OrphanGroup { packageId: string; packageTitle: string | null; inLibrary: boolean; counts: OrphanCounts }`

- [ ] **Step 1: Write the failing tests**

Both files import from `"../src/index.js"` with type imports on their own line (shared/test/checking.test.ts:1-3) and share this helper:
```ts
import type { ZodTypeAny } from "zod";
const issues = (s: ZodTypeAny, v: unknown) => {
  const r = s.safeParse(v);
  return r.success ? "ok" : r.error.issues.map((i) => i.message).join("; ");
};
```
`shared/test/notes.test.ts`:
```ts
it("rejects a blank body and caps it at 100 000 characters", () => {
  expect(issues(noteCreateSchema, { body: " \n\t", target: null })).toMatch(/body must not be blank/);
  expect(issues(noteCreateSchema, { body: "x".repeat(100_000), target: null })).toBe("ok");
  expect(issues(noteCreateSchema, { body: "x".repeat(100_001), target: null })).toMatch(/at most 100000 characters/);
});
it("needs the target key, and a target needs its packageId", () => {
  expect(issues(noteCreateSchema, { body: "a", target: { packageId: "demo", lessonId: null } })).toBe("ok");
  expect(issues(noteCreateSchema, { body: "a", target: { packageId: "demo", lessonId: "intro" } })).toBe("ok");
  for (const bad of [{ body: "a" }, { body: "a", target: { packageId: "demo" } }, { body: "a", target: { lessonId: "intro" } }])
    expect(issues(noteCreateSchema, bad)).not.toBe("ok");
});
it("rejects unknown keys on every schema", () => {
  expect(issues(noteCreateSchema, { body: "a", target: null, title: "t" })).toMatch(/Unrecognized key/);
  expect(issues(noteCreateSchema, { body: "a", target: { packageId: "demo", lessonId: null, x: 1 } })).toMatch(/Unrecognized key/);
  expect(issues(notePatchSchema, { body: "a", pinned: true })).toMatch(/Unrecognized key/);
  expect(issues(explanationCreateSchema, { packageId: "demo", lessonId: "intro", body: "a", confidence: 2, revisit: true })).toMatch(/Unrecognized key/);
  expect(issues(explanationPatchSchema, { lessonId: "intro", confidence: 3 })).toMatch(/Unrecognized key/);
});
it("a patch must change something; an absent target stays absent, null detaches", () => {
  expect(issues(notePatchSchema, {})).toMatch(/patch must change body or target/);
  expect(issues(explanationPatchSchema, {})).toMatch(/patch must change body or confidence/);
  expect(notePatchSchema.parse({ target: null })).toEqual({ target: null });
  expect(notePatchSchema.parse({ body: "b" })).toEqual({ body: "b" });
});
it("confidence is a whole number from 1 to 5, and 1-2 is low", () => {
  for (const c of [0, 6, 2.5, "3"]) expect(issues(confidenceSchema, c)).toMatch(/confidence must be a whole number from 1 to 5/);
  for (const c of CONFIDENCE_LEVELS) expect(issues(confidenceSchema, c)).toBe("ok");
  expect([1, 2, 3, 5].map(isLowConfidence)).toEqual([true, true, false, false]);
  expect(LOW_CONFIDENCE_MAX).toBe(2);
});
```
`shared/test/maintenance.test.ts`, with `const ZERO = { cardState: 0, reviewLog: 0, attempts: 0, lessonProgress: 0, notes: 0, explanations: 0 };`:
```ts
it("always purges progress and purges writing only when asked", () => {
  expect(purgedKinds(false)).toEqual(["cardState", "reviewLog", "attempts", "lessonProgress"]);
  expect(purgedKinds(true)).toEqual([...ORPHAN_KINDS]);
  expect(WRITING_KINDS).toEqual(["notes", "explanations"]);
});
it("counts are strict non-negative integers", () => {
  expect(issues(orphanCountsSchema, ZERO)).toBe("ok");
  for (const bad of [{ ...ZERO, cardState: -1 }, { ...ZERO, notes: 1.5 }, { ...ZERO, extra: 0 }, { cardState: 0 }])
    expect(issues(orphanCountsSchema, bad)).not.toBe("ok");
});
it("a purge request carries back the counts the user saw", () => {
  expect(issues(purgeOrphansRequestSchema, { packageId: "demo", includeWriting: true, expected: ZERO })).toBe("ok");
  expect(issues(purgeOrphansRequestSchema, { packageId: "demo", includeWriting: false })).not.toBe("ok");
  expect(issues(purgeOrphansRequestSchema, { packageId: "no spaces", includeWriting: false, expected: ZERO })).toMatch(/id must match/);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run shared/test/notes.test.ts shared/test/maintenance.test.ts`
Expected: FAIL. Every test throws a TypeError (`Cannot read properties of undefined (reading 'safeParse')`, `purgedKinds is not a function`), because nothing is exported yet.

- [ ] **Step 3: Implement `shared/src/notes.ts` and `shared/src/maintenance.ts`**

Pinned definitions. Every export gets a Google-style JSDoc (Args/Returns), as at shared/src/lessonBody.ts:18-31. UI labels stay in web.
- Private `bodySchema = z.string().max(BODY_MAX, "body must be at most 100000 characters").refine((s) => s.trim().length > 0, { message: "body must not be blank" })`.
- `noteTargetSchema = z.object({ packageId: idSchema, lessonId: idSchema.nullable() }).strict()`. A null lessonId means the whole package.
- `noteCreateSchema = z.object({ body: bodySchema, target: noteTargetSchema.nullable() }).strict()`. The target key is required, and null means standalone.
- `notePatchSchema = z.object({ body: bodySchema.optional(), target: noteTargetSchema.nullable().optional() }).strict().refine((p) => p.body !== undefined || p.target !== undefined, { message: "patch must change body or target" })`.
- `confidenceSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)], { errorMap: () => ({ message: "confidence must be a whole number from 1 to 5" }) })`. The literal union types `Confidence` as `1 | 2 | 3 | 4 | 5`, so `Record<Confidence, string>` lookups need no `!` under noUncheckedIndexedAccess. `z.number().int()` would infer `number`.
- `explanationCreateSchema = z.object({ packageId: idSchema, lessonId: idSchema, body: bodySchema, confidence: confidenceSchema }).strict()`.
- `explanationPatchSchema = z.object({ body: bodySchema.optional(), confidence: confidenceSchema.optional() }).strict().refine(…, { message: "patch must change body or confidence" })`. The lesson link cannot change.
- `isLowConfidence(c)` returns `c <= LOW_CONFIDENCE_MAX`.
- `orphanCountsSchema` is `z.object` with one `z.number().int().nonnegative()` per ORPHAN_KINDS key, `.strict()`.
- `purgeOrphansRequestSchema = z.object({ packageId: idSchema, includeWriting: z.boolean(), expected: orphanCountsSchema }).strict()`.
- `purgedKinds` returns ORPHAN_KINDS in order, leaving out WRITING_KINDS when `includeWriting` is false.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run shared/test/notes.test.ts shared/test/maintenance.test.ts`, then `npm test` and `npm run typecheck`
Expected: 8 tests PASS, the full suite PASSES, and typecheck exits 0.

- [ ] **Step 5: Commit**
```bash
git add shared/src/notes.ts shared/src/maintenance.ts shared/src/index.ts shared/test/notes.test.ts shared/test/maintenance.test.ts
git commit -m "feat: add shared note, explanation and orphan-purge contracts"
```

---

### Task 2: User-state tables and the orphan rules

**Files:**
- Modify: `server/src/schema.sql` (append after its last statement, which is Stage 2's `attempts_history` index)
- Create: `server/src/orphans.ts`
- Modify: `server/test/helpers.ts` (add `V2_FILES`, `seedUserState` and three count constants)
- Modify: `server/test/db.test.ts` (:35-36 expected tables; one new test)
- Test: `server/test/orphans.test.ts` (new)

**Interfaces:**
- Consumes:
  - from Task 1: `ORPHAN_KINDS`, `OrphanKind`, `OrphanCounts`, `OrphanGroup`, `PurgeOrphansRequest`, `purgedKinds`;
  - `Db` and `openDb` (server/src/db.ts:6, :46);
  - `importPackage(db: Db, zipBuf: Buffer): ImportResult` (server/src/importer.ts:7);
  - `createApp(db: Db)` (server/src/app.ts:10);
  - `freshDb`, `makeZip`, `GOOD_FILES` (server/test/helpers.ts:7, :9, :17-32);
  - Stage 2's `PLAY_FILES` (package `demo`, lesson `intro`, card1 with reverse:true, quizzes quiz-all and quiz-plain, games g-match, g-small, g-speed and g-order).
- Produces:
  - `CONTENT_TABLES = ["packages", "lessons", "items", "quizzes", "games", "assets"] as const`
  - `ORPHAN_TABLE: Record<OrphanKind, string>` = `{ cardState: "card_state", reviewLog: "review_log", attempts: "attempts", lessonProgress: "lesson_progress", notes: "notes", explanations: "explanations" }`
  - `LIVE: Record<OrphanKind, (t: string) => string>`: a SQL condition on table name or alias `t`. A row is orphaned exactly when it is NOT live.
  - `orphanReport(db: Db): OrphanGroup[]`
  - `countOrphans(db: Db, packageId: string): OrphanCounts`
  - `purgeOrphans(db: Db, req: PurgeOrphansRequest): { ok: true; purged: OrphanCounts } | { ok: false; current: OrphanCounts }`
  - Test helpers, used again in Tasks 5 and 6:
    - `V2_FILES`: GOOD_FILES with `id: intro` replaced by `id: intro2` in `lessons/01-intro.md`, and `items.json` = [GOOD's mc1, `{ id: "card2", type: "flashcard", front: "adios", back: "goodbye" }`]. This drops card1 and adds a card with no reverse. GOOD_FILES itself is never mutated.
    - `seedUserState(db: Db): void`. It inserts these rows for `demo`, all stamped `2026-10-01T00:00:00.000Z`:
      - card_state card1/front and card1/back (interval 1, ease 2.5, reps 1, lapses 0);
      - review_log card1/front and card1/back, both rated good;
      - one attempts row: exercise, item mc1, correct 1, score 1;
      - lesson_progress intro, in-progress;
      - three notes: `(NULL, NULL)` "standalone", `(demo, NULL)` "package note" and `(demo, intro)` "lesson note";
      - one explanation `(demo, intro)` "my words", confidence 2.
    - `NO_ORPHANS`: all six counts 0.
    - `ORPHANS_AFTER_V2 = { cardState: 2, reviewLog: 2, attempts: 0, lessonProgress: 1, notes: 1, explanations: 1 }`
    - `ORPHANS_AFTER_DELETE = { cardState: 2, reviewLog: 2, attempts: 1, lessonProgress: 1, notes: 2, explanations: 1 }`

- [ ] **Step 1: Write the failing tests**

First add `V2_FILES`, `seedUserState` and the three count constants to `server/test/helpers.ts`, exactly as listed under Produces. They are test fixtures, so they are written in this step, before the tests that use them. Until Step 3 adds the tables, `seedUserState` fails only when it runs.

`server/test/db.test.ts`: add `"notes", "explanations"` to the list at :35-36, and add one test in the legacy-DB style of :59-83:
```ts
it("adds the Stage 3 tables to an existing database and enforces their checks")
  // raw better-sqlite3 DB holding only `packages` plus one row ('demo'), closed; then openDb(dir):
  // table names include "notes" and "explanations"; indexes notes_target and explanations_lesson exist; SELECT id FROM packages → [{ id: "demo" }]
  // INSERT notes (package_id NULL, lesson_id 'intro') → toThrow(/CHECK constraint failed/)
  // INSERT explanations with confidence 0, 6, 2.5 → toThrow(/CHECK constraint failed/); confidence 2 → inserts
  // db.close(); openDb(dir).close() does not throw (the second open is idempotent)
```
`server/test/orphans.test.ts`. Each test builds `const db = freshDb()` and loads zips with `importPackage(db, makeZip(…))`. Local fixtures:
- `NO_REVERSE`: GOOD_FILES with card1 `reverse: false`;
- `OTHER_FILES`: GOOD_FILES with manifest id `other` and title `Other`;
- `PLAY_DROPPED`: PLAY_FILES without quiz `quiz-all` and without game `g-match`.

```ts
it("classifies every table as content or user state", () => {   // AUTOINCREMENT (schema.sql:57,65) adds sqlite_sequence
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  expect(names).toEqual([...CONTENT_TABLES, ...Object.values(ORPHAN_TABLE)].sort());
});
it("counts nothing while every row is live")         // GOOD + seed → countOrphans(db, "demo") = NO_ORPHANS; orphanReport(db) = []
it("a re-import that drops card1 and renames intro orphans exactly their rows")
  // + V2_FILES → countOrphans = ORPHANS_AFTER_V2; orphanReport = [{ packageId: "demo", packageTitle: "Demo", inLibrary: true, counts: ORPHANS_AFTER_V2 }]
it("reverse:false orphans only the back direction")   // + NO_REVERSE → { ...NO_ORPHANS, cardState: 1, reviewLog: 1 }
it("a quiz or game run is orphaned only when its ref_id is gone")
  // PLAY_FILES; attempts rows (SQL): quiz quiz-all, quiz quiz-plain, game g-match, game g-speed, exercise mc1, exercise "retired"
  // countOrphans(...).attempts: 1 → after PLAY_DROPPED: 3 → after PLAY_FILES again: 1
it("a deleted package orphans everything but standalone notes")
  // GOOD + seed, DELETE FROM packages WHERE id = 'demo' → ORPHANS_AFTER_DELETE;
  // orphanReport = [{ packageId: "demo", packageTitle: null, inLibrary: false, counts: ORPHANS_AFTER_DELETE }]
it("LIVE.cardState keeps exactly the states free study shows")
  // GOOD; card_state card1/front, card1/back, mc1/front, gone/front; import NO_REVERSE
  // SELECT item_id, direction FROM card_state c WHERE ${LIVE.cardState("c")}  → [["card1", "front"]]
  // GET /api/review/free-study?packageId=demo, cards with state !== null → [["card1", "front"]]; countOrphans cardState 3
it("a stale count deletes nothing and returns the current counts")
  // GOOD + seed + V2: purgeOrphans(db, { packageId: "demo", includeWriting: false, expected: { ...ORPHANS_AFTER_V2, cardState: 1 } })
  //   → { ok: false, current: ORPHANS_AFTER_V2 }; COUNT(*) over the six ORPHAN_TABLE tables stays 10
  // then expected { ...ORPHANS_AFTER_V2, notes: 0 } with includeWriting false → ok: true (a spared kind is never compared)
it("purges writing only when asked; live rows and other packages survive")
  // GOOD + seed; import OTHER_FILES; card_state ('other', 'gone', 'front'); import V2; card_state ('demo', 'card2', 'front')
  // orphanReport ids → ["demo", "other"]
  // includeWriting false, expected ORPHANS_AFTER_V2 → { ok: true, purged: { cardState: 2, reviewLog: 2, attempts: 0, lessonProgress: 1, notes: 0, explanations: 0 } }
  // countOrphans(db, "demo") → { ...NO_ORPHANS, notes: 1, explanations: 1 }; includeWriting true with that → purged the same
  // card_state rows → [["demo", "card2", "front"], ["other", "gone", "front"]]; note bodies → ["package note", "standalone"]; attempts COUNT 1
  // orphanReport → [{ packageId: "other", packageTitle: "Other", inLibrary: true, counts: { ...NO_ORPHANS, cardState: 1 } }]
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/test/orphans.test.ts server/test/db.test.ts`
Expected: FAIL. orphans.test.ts cannot load `../src/orphans.js`, and db.test.ts reports `expected [ …the table names… ] to include 'notes'`.

- [ ] **Step 3: Implement the DDL and `server/src/orphans.ts`**

Append to `server/src/schema.sql`. No db.ts change is needed, because openDb runs schema.sql on every open (db.ts:51-52). Neither table gets a foreign key (schema.sql:44). The check uses `IN`, not `BETWEEN`, because `BETWEEN` lets 2.5 in as REAL.
```sql
-- user state (Stage 3): no FK to content, like the tables above
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, package_id TEXT, lesson_id TEXT,
  body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (lesson_id IS NULL OR package_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS notes_target ON notes(package_id, lesson_id);
CREATE TABLE IF NOT EXISTS explanations (id INTEGER PRIMARY KEY AUTOINCREMENT, package_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL, body TEXT NOT NULL, confidence INTEGER NOT NULL CHECK (confidence IN (1, 2, 3, 4, 5)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS explanations_lesson ON explanations(package_id, lesson_id, id);
```
The `LIVE` fragments are the single definition of "live". Inner aliases start with `x`, so they never shadow a caller's alias. `t` is always a table name or alias written in code, never user input.
```ts
const lessonLive = (t: string) =>
  `EXISTS (SELECT 1 FROM lessons xl WHERE xl.package_id = ${t}.package_id AND xl.id = ${t}.lesson_id)`;
const cardLive = (t: string) =>
  `EXISTS (SELECT 1 FROM items xi WHERE xi.package_id = ${t}.package_id AND xi.id = ${t}.item_id AND xi.type = 'flashcard'
     AND (${t}.direction = 'front' OR json_extract(xi.data, '$.reverse') = 1))`;
LIVE = { cardState: cardLive, reviewLog: cardLive, lessonProgress: lessonLive, explanations: lessonLive,
  attempts: (t) => `CASE ${t}.kind
    WHEN 'exercise' THEN EXISTS (SELECT 1 FROM items xi WHERE xi.package_id = ${t}.package_id AND xi.id = ${t}.item_id)
    WHEN 'quiz' THEN EXISTS (SELECT 1 FROM quizzes xq WHERE xq.package_id = ${t}.package_id AND xq.id = ${t}.ref_id)
    WHEN 'game' THEN EXISTS (SELECT 1 FROM games xg WHERE xg.package_id = ${t}.package_id AND xg.id = ${t}.ref_id) END`,
  notes: (t) => `(${t}.package_id IS NULL OR CASE WHEN ${t}.lesson_id IS NULL
    THEN EXISTS (SELECT 1 FROM packages xp WHERE xp.id = ${t}.package_id) ELSE ${lessonLive(t)} END)` };
```
- **`orphanReport`.** Runs, for each kind k: `SELECT package_id, COUNT(*) AS n FROM <ORPHAN_TABLE[k]> WHERE package_id IS NOT NULL AND NOT (<LIVE[k](table name)>) GROUP BY package_id`.
  - Merges the results per package, starting from zero counts.
  - Reads `json_extract(manifest, '$.title')` from `packages`. `inLibrary` is true when that row exists, and `packageTitle` is null when it does not.
  - Returns the groups sorted by packageId in code-point order.
- **`countOrphans`.** Runs the same count with `package_id = ?`.
- **`purgeOrphans`.** Runs inside one `db.transaction(…)()`:
  1. Recount.
  2. Compare `expected` only for `purgedKinds(req.includeWriting)`. On any mismatch, return `{ ok: false, current }` and delete nothing.
  3. Otherwise, for each purged kind, run `DELETE FROM <table> WHERE package_id = ? AND NOT (<LIVE(table name)>)`. Unaliased, so it never relies on `DELETE … AS`. `purged[k]` is that statement's `changes`, and every other kind is 0.
- Count rows use typed casts (`as { package_id: string; n: number }[]`), with no `as any`. Every export gets a Google-style JSDoc.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run server/test/orphans.test.ts server/test/db.test.ts`, then `npm test` and `npm run typecheck`
Expected: all PASS, Stage 2's suites included. Typecheck exits 0.

- [ ] **Step 5: Commit**
```bash
git add server/src/schema.sql server/src/orphans.ts server/test/helpers.ts server/test/db.test.ts server/test/orphans.test.ts
git commit -m "feat: add notes and explanations tables and the orphan rules"
```

---

### Task 3: Notes API

**Files:**
- Create: `server/src/routes/notes.ts`
- Modify: `server/src/app.ts` (import `noteRoutes`; add `app.route("/api/notes", noteRoutes())` after Stage 2's `/api/games` mount, which follows today's app.ts:23)
- Test: `server/test/api.notes.test.ts` (new)

**Interfaces:**
- Consumes:
  - Stage 2's `server/src/http.ts`: `parseJsonBody(c, schema, invalidMessage): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }>` and `apiError(c, status, code, message): Response`. Notes need only 400 and 404, so this task does not widen it.
  - Task 1: `noteCreateSchema`, `notePatchSchema`, `Note`, `NoteTargetView`.
  - Task 2: `LIVE.notes`.
  - `AppEnv` (server/src/app.ts:8).
- Produces: `noteRoutes(): Hono<AppEnv>`, mounted at `/api/notes`. Task 7's client relies on these shapes:
  - `GET /` → 200 `{ notes: Note[] }`: live and orphaned notes, ordered `updated_at DESC, id DESC`, with no query params.
  - `GET /:id` → 200 `{ note }`, or 404 "unknown note".
  - `POST /` → 201 `{ note }`, or 400, or 404 "unknown package" / "unknown lesson".
  - `PATCH /:id` → 200 `{ note }`, or 400, or 404 "unknown note" / "unknown package" / "unknown lesson". A missing note always reports "unknown note", even when the body also names a missing target; Task 9's editor relies on that message.
  - `DELETE /:id` → 204, or 404 "unknown note".

- [ ] **Step 1: Write the failing tests**

Setup as at server/test/api.review.test.ts:9-15: a fresh DB, `createApp`, and an import of GOOD_FILES. `beforeEach` also calls `vi.useFakeTimers({ toFake: ["Date"] })`, and `afterEach` calls `vi.useRealTimers()`. Helpers:
```ts
const send = (method: string, path: string, body?: unknown) => app.request(path, { method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const LESSON = { packageId: "demo", lessonId: "intro" };
```
Tests (`T0 = "2026-10-01T10:00:00.000Z"`):
```ts
it("creates standalone, package and lesson notes with titles")
  // at(T0); POST { body: "Area is $a^2$", target: null } → 201, note toEqual
  //   { id: 1, body: "Area is $a^2$", target: null, orphaned: false, createdAt: T0, updatedAt: T0 }
  // target { packageId: "demo", lessonId: null } → { packageId: "demo", lessonId: null, packageTitle: "Demo", lessonTitle: null }
  // target LESSON → { ...LESSON, packageTitle: "Demo", lessonTitle: "Intro" }
it("refuses a missing package or lesson and writes nothing")
  // {nope, null} and {nope, intro} → 404 { code: "not_found", message: "unknown package" }; {demo, nope} → "unknown lesson"; COUNT(*) notes 0
it("rejects malformed and invalid bodies with 400 invalid_request")
  // "{" → message "request body must be valid JSON"
  // null, { body: "  ", target: null }, { body: "x".repeat(100_001), target: null }, { body: "a", target: null, title: "t" },
  // { body: "a", target: { lessonId: "intro" } }, { body: "a" } → { code: "invalid_request", message: "request body is not a valid note" }; COUNT 0
it("lists the newest change first, and PATCH keeps createdAt")
  // at 10:00 A = POST "a"; at 10:01 B = POST "b"; at 10:02 PATCH A { body: "a2" } → 200
  //   note { body: "a2", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:02:00.000Z" }; GET /api/notes ids → [A, B]
it("reads one note; unknown and malformed ids are 404")
  // one POST, then GET /api/notes/1 → 200 { note: { id: 1, … } }; /999 → 404 "unknown note"
  // /abc, /0, /01 → 404 { code: "not_found", message: "no such route or resource" } (app.ts:19)
it("PATCH detaches with null and refuses a missing target without changing the row")
  // lesson note; PATCH { target: null } → target null; PATCH { target: { packageId: "demo", lessonId: "nope" } } → 404 "unknown lesson",
  // row still package_id NULL, lesson_id NULL; GET /api/notes/1 → 200, target null; PATCH {} → 400 "request body is not a valid note update"
  // PATCH /999 { body: "x" } → 404 "unknown note"; PATCH /999 { target: { packageId: "nope", lessonId: null } } → 404 "unknown note" (the note lookup comes first)
it("a note on removed content is orphaned, still editable and deletable, and re-attaches on re-import")
  // notes 1 = LESSON, 2 = { demo, null }, 3 = standalone; DELETE /api/packages/demo
  // list orphaned by id → { 1: true, 2: true, 3: false }; note 1 target { ...LESSON, packageTitle: null, lessonTitle: null }
  // GET /api/notes/1 → 200, orphaned true; PATCH 1 { body: "still mine" } → 200; PATCH 1 { target: LESSON } (unchanged) → 200
  // DELETE /api/notes/2 → 204 (an orphaned note can still be deleted by id); GET /api/notes/2 → 404 "unknown note"
  // re-import GOOD_FILES → GET /api/notes/1 { orphaned: false, target.lessonTitle: "Intro" }
it("DELETE removes a note once")   // → 204; GET → 404; DELETE again → 404 "unknown note"
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/test/api.notes.test.ts`
Expected: FAIL, all 8. `/api/notes` is not mounted, so every request reaches app.notFound (`expected 404 to be 201`, or the message "no such route or resource" where a test expects "unknown package").

- [ ] **Step 3: Implement `noteRoutes(): Hono<AppEnv>` in `server/src/routes/notes.ts`**

- **Path ids.** Use `"/:id{[1-9][0-9]*}"` with `Number(c.req.param("id"))`, following the regex-param precedent at packages.ts:65. Any other id falls through to app.notFound.
- **Handler order** (as in attempts.ts:10-33):
  1. `parseJsonBody`, with `"request body is not a valid note"` or `"request body is not a valid note update"`.
  2. The 404 lookups. On PATCH, the note row is looked up first. With no row, return 404 "unknown note" before any target check. The stored `(package_id, lesson_id)` from that row feeds the "differs" comparison below. Then, for a target: a missing packages row reports "unknown package" and is checked first, and a missing lessons row reports "unknown lesson".
  3. A single write statement.
- **PATCH target checks.** Run the target checks only when `target` is present, non-null, and differs from the stored `(package_id, lesson_id)`. So a body-only PATCH, or one that resends the same target, succeeds on an orphaned note. One UPDATE sets:
  - `body`, if given;
  - `package_id` and `lesson_id`, if `target` is given (null clears both);
  - `updated_at`.
- **Timestamps.** Use `new Date().toISOString()`. `created_at` is written once.
- **Reads share one SELECT:**
  - `FROM notes n LEFT JOIN packages p ON p.id = n.package_id LEFT JOIN lessons l ON l.package_id = n.package_id AND l.id = n.lesson_id`;
  - selecting `json_extract(p.manifest, '$.title') AS package_title`, `json_extract(l.frontmatter, '$.title') AS lesson_title` and `NOT (${LIVE.notes("n")}) AS orphaned`.
- **Typed rows.** `interface NoteRow { id: number; package_id: string | null; lesson_id: string | null; body: string; created_at: string; updated_at: string; package_title: string | null; lesson_title: string | null; orphaned: 0 | 1 }`. A module-private `toNote(row: NoteRow): Note` returns `target: null` when package_id is null. No `as any`. Add a Google-style JSDoc on `noteRoutes`.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run server/test/api.notes.test.ts`, then `npm test` and `npm run typecheck`
Expected: 8 tests PASS, the full suite PASSES, and typecheck exits 0.

- [ ] **Step 5: Commit**
```bash
git add server/src/routes/notes.ts server/src/app.ts server/test/api.notes.test.ts
git commit -m "feat: add the notes API"
```

---

### Task 4: Explanations API and the revisit rule

**Files:**
- Create: `server/src/routes/explanations.ts`
- Modify: `server/src/app.ts` (mount `/api/explanations` after `/api/notes`)
- Test: `server/test/api.explanations.test.ts` (new)

**Interfaces:**
- Consumes:
  - Stage 2's `parseJsonBody`, the synchronous `parseQuery<S extends z.ZodTypeAny>(c: Context<AppEnv>, schema: S, invalidMessage: string): Parsed<z.output<S>>` and `apiError` (server/src/http.ts);
  - Task 1: `explanationCreateSchema`, `explanationPatchSchema`, `Explanation`, `Confidence`, `LOW_CONFIDENCE_MAX`;
  - Task 2: `LIVE.explanations`.
- Produces:
  - `revisitSql(e: string): string`.
  - `explanationRoutes(): Hono<AppEnv>`, mounted at `/api/explanations`. Tasks 7 and 12 rely on these shapes:
    - `GET /` → `{ explanations: Explanation[] }`, all rows ordered `id DESC`.
    - `GET /?revisit=1` → only the revisit prompts, ordered `confidence ASC, id ASC`. Any other query → 400 "revisit must be 1".
    - `GET /:id` → `{ explanation }`, or 404 "unknown explanation".
    - `POST /` → 201 `{ explanation }`, or 404 "unknown lesson".
    - `PATCH /:id` → 200 `{ explanation }`, or 404 "unknown explanation".
    - There is no DELETE route.

- [ ] **Step 1: Write the failing tests**

The same setup, fake Date, and file-local `send` and `at` helpers as in Task 3. `beforeEach` imports `TWO_LESSONS = { ...GOOD_FILES, "lessons/02-more.md": "---\nid: more\ntitle: More\n---\n\nMore.\n" }`. Helpers:
```ts
const explain = async (lessonId: string, confidence: number) => (await (await send("POST", "/api/explanations",
  { packageId: "demo", lessonId, body: "In my words", confidence })).json()).explanation.id as number;
const prompts = async () =>
  ((await (await app.request("/api/explanations?revisit=1")).json()).explanations as { id: number }[]).map((e) => e.id);
const patch = (id: number, body: unknown) => send("PATCH", `/api/explanations/${id}`, body);
```
```ts
it("creates an explanation with titles and flags")   // at(T0); intro, 2 → 201, explanation toEqual { id: 1, packageId: "demo",
  // lessonId: "intro", packageTitle: "Demo", lessonTitle: "Intro", body: "In my words", confidence: 2, revisit: true, orphaned: false, createdAt: T0, updatedAt: T0 }
it("refuses a lesson that isn't in the library and writes nothing")  // lessonId "nope", or packageId "nope" → 404 "unknown lesson"; COUNT 0
it("rejects invalid bodies")   // confidence 6, 2.5, "3" or missing, a blank body, an extra key → 400 "request body is not a valid explanation";
  // "{" → "request body must be valid JSON"; COUNT 0
it("lists newest first with revisit and orphaned flags")   // a = (intro, 2), b = (more, 4) → [id, revisit, orphaned] = [[b, false, false], [a, true, false]]
it("a 2 prompts and a 3 does not")                         // a = (intro, 2); (more, 3) → prompts() = [a]
it("a newer explanation rated 3 or more clears the prompt")   // (intro, 2); (intro, 4) → []
it("raising the latest rating to 3 clears it")             // a = (intro, 1); patch(a, { confidence: 3 }) → 200; → []
it("a newer low explanation moves the prompt to it")       // a = (intro, 2); b = (intro, 1) → [b]; a.revisit false in the list
it("re-rating an older row or editing only the body changes nothing")
  // a = (intro, 1); b = (intro, 2) → [b]; patch(a, { confidence: 5 }); patch(b, { body: "Reworded" }) → [b]
  // x = (more, 2); (more, 4); patch(x, { confidence: 1 }) → still [b]
it("orders prompts by confidence, then id")                // a = (intro, 2); b = (more, 1) → [b, a]; patch(b, { confidence: 2 }) → [a, b]
it("a removed lesson hides its prompt but keeps the row; re-import restores it")
  // a = (intro, 2); DELETE /api/packages/demo → prompts() []; GET /api/explanations/a → 200
  //   toMatchObject { orphaned: true, revisit: false, packageTitle: null, lessonTitle: null }; patch(a, { body: "Kept" }) → 200
  // re-import TWO_LESSONS → [a]
it("PATCH keeps id and createdAt, bumps updatedAt, and refuses anything else")
  // at 10:00 a = (intro, 2); at 10:05 res = patch(a, { confidence: 3 }) → 200, and (await res.json()).explanation toMatchObject
  //   { id: a, confidence: 3, createdAt: "…T10:00:00.000Z", updatedAt: "…T10:05:00.000Z" } (the `{ explanation }` wrapper is pinned here)
  // patch(a, {}) and patch(a, { lessonId: "more", confidence: 3 }) → 400 "request body is not a valid explanation update"
  // patch(999, { confidence: 3 }) → 404 "unknown explanation"
it("reads by id, rejects other revisit values, and has no DELETE")
  // GET /999 → 404 "unknown explanation"; GET /abc → 404 not_found
  // ?revisit=true, ?revisit=0, ?other=1 → 400 { code: "invalid_request", message: "revisit must be 1" }
  // after one POST: DELETE /api/explanations/1 → 404 not_found; COUNT still 1
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/test/api.explanations.test.ts`
Expected: FAIL with `expected 404 to be 201` and similar, because the route is not mounted.

- [ ] **Step 3: Implement `explanationRoutes(): Hono<AppEnv>` and `revisitSql(e: string): string` in `server/src/routes/explanations.ts`**

This one fragment defines a revisit prompt. It feeds both the per-row `revisit` flag and the `?revisit=1` filter. "Latest" means MAX(id), never created_at, because AUTOINCREMENT ids ignore clock changes.
```ts
export const revisitSql = (e: string): string =>
  `${LIVE.explanations(e)} AND ${e}.confidence <= ${LOW_CONFIDENCE_MAX} AND ${e}.id = (SELECT MAX(x.id) FROM explanations x
     WHERE x.package_id = ${e}.package_id AND x.lesson_id = ${e}.lesson_id)`;
```
- **Query.** A module-private `listQuerySchema = z.object({ revisit: z.literal("1").optional() }).strict()`, run through `const q = parseQuery(c, listQuerySchema, "revisit must be 1")`; when `!q.ok`, return `q.response`. A mistyped value therefore never returns the whole list as prompts.
- **Reads.** These use the notes-style SELECT on `explanations e`, adding `NOT (${LIVE.explanations("e")}) AS orphaned` and `(${revisitSql("e")}) AS revisit`.
  - The plain list is `ORDER BY e.id DESC`.
  - The revisit list is `WHERE ${revisitSql("e")} ORDER BY e.confidence ASC, e.id ASC`.
- **Writes.**
  - POST: parse with `"request body is not a valid explanation"`. With no lessons row, return 404 "unknown lesson"; an unknown package gets the same message. Otherwise INSERT with `created_at = updated_at = now` and return 201.
  - PATCH: parse with `"request body is not a valid explanation update"`, then return 404 "unknown explanation" if there is no row. Otherwise one UPDATE of body and/or confidence plus `updated_at`. PATCH is allowed on orphaned rows. It never changes `id`, `created_at`, `package_id` or `lesson_id`.
  - Register no `r.delete`.
- **Typed rows.** `interface ExplanationRow { id: number; package_id: string; lesson_id: string; body: string; confidence: Confidence; created_at: string; updated_at: string; package_title: string | null; lesson_title: string | null; orphaned: 0 | 1; revisit: 0 | 1 }`. `confidence` can be typed as `Confidence` because the DB CHECK guarantees 1–5. Map rows through a module-private `toExplanation`. Add Google-style JSDoc on both exports.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run server/test/api.explanations.test.ts`, then `npm test` and `npm run typecheck`
Expected: 13 tests PASS, the full suite PASSES, and typecheck exits 0.

- [ ] **Step 5: Commit**
```bash
git add server/src/routes/explanations.ts server/src/app.ts server/test/api.explanations.test.ts
git commit -m "feat: add the explanations API with revisit prompts"
```

---

### Task 5: Maintenance API: orphan report and guarded purge

**Files:**
- Modify: `server/src/http.ts` (Stage 2's `apiError`: status union becomes `400 | 404 | 409 | 422`, and the code union gains `"orphans_changed"`)
- Create: `server/src/routes/maintenance.ts`
- Modify: `server/src/app.ts` (mount `/api/maintenance` after `/api/explanations`)
- Test: `server/test/api.maintenance.test.ts` (new)

**Interfaces:**
- Consumes:
  - Stage 2's `parseJsonBody` and `apiError`;
  - Task 1: `purgeOrphansRequestSchema`, `OrphanCounts`, `OrphanGroup`;
  - Task 2: `orphanReport`, `purgeOrphans`, `seedUserState`, `V2_FILES`, `NO_ORPHANS`, `ORPHANS_AFTER_V2`, `ORPHANS_AFTER_DELETE`.
- Produces:
  - `apiError(c, status: 400 | 404 | 409 | 422, code: "invalid_request" | "not_found" | "not_checkable" | "orphans_changed", message: string): Response`.
  - `maintenanceRoutes(): Hono<AppEnv>`, with these routes. Task 7's `getOrphans` and `purgeOrphans` client calls and Task 13's 409 handling rely on them:
    - `GET /api/maintenance/orphans` → 200 `{ packages: OrphanGroup[] }`.
    - `POST /api/maintenance/orphans/purge`, with a `PurgeOrphansRequest` body → 200 `{ purged: OrphanCounts }`, or 409 `orphans_changed`, or 400 `invalid_request`.

- [ ] **Step 1: Write the failing tests**

Setup: a fresh DB, `createApp`, an import of GOOD_FILES, then `seedUserState(db)`. The file defines its own `send`, the same as Task 3's (test helpers are file-local). Helpers:
- `purge = (body: unknown) => send("POST", "/api/maintenance/orphans/purge", body)`;
- `groups()` returns the `packages` array of `GET /api/maintenance/orphans`;
- `total()` sums `COUNT(*)` over the six user-state tables.
```ts
it("reports nothing while everything is live")    // GET → 200 { packages: [] }
it("a deleted package is one group outside the library")
  // DELETE /api/packages/demo → [{ packageId: "demo", packageTitle: null, inLibrary: false, counts: ORPHANS_AFTER_DELETE }]
it("a re-import that drops content keeps the title")
  // import V2_FILES → [{ packageId: "demo", packageTitle: "Demo", inLibrary: true, counts: ORPHANS_AFTER_V2 }]
it("purges progress, and writing only when asked")
  // V2; purge({ packageId: "demo", includeWriting: false, expected: ORPHANS_AFTER_V2 }) → 200
  //   { purged: { cardState: 2, reviewLog: 2, attempts: 0, lessonProgress: 1, notes: 0, explanations: 0 } }
  // groups()[0].counts → { ...NO_ORPHANS, notes: 1, explanations: 1 }; purge(includeWriting: true, expected: that) → 200 { purged: that }
  // groups() → []; COUNT(*) notes → 2
it("a change between preview and purge is a 409 that deletes nothing")
  // V2; INSERT card_state ('demo', 'gone', 'front'); before = total(); purge({ …, includeWriting: true, expected: ORPHANS_AFTER_V2 }) → 409
  // body toEqual { error: { code: "orphans_changed", message: "leftover progress changed since it was counted; review it and confirm again" } }
  // total() === before
it("an unknown package with zero counts is a no-op")   // { packageId: "nope", includeWriting: true, expected: NO_ORPHANS } → 200 { purged: NO_ORPHANS }
it("rejects bad purge bodies")   // valid = { packageId: "demo", includeWriting: false, expected: NO_ORPHANS }
  // "{" → 400 "request body must be valid JSON"; { ...valid, extra: 1 }, { ...valid, expected: { ...NO_ORPHANS, cardState: -1 } },
  // { packageId: "demo", includeWriting: false } → 400 { code: "invalid_request", message: "request body is not a valid purge request" }; total() unchanged
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/test/api.maintenance.test.ts`
Expected: FAIL with `expected 404 to be 200`, because the route is not mounted.

- [ ] **Step 3: Widen `apiError` and implement `maintenanceRoutes(): Hono<AppEnv>` in `server/src/routes/maintenance.ts`**

- **http.ts.** Change only the two unions. Stage 2's callers compile unchanged.
- **GET /orphans.** Returns `c.json({ packages: orphanReport(db) })`.
- **POST /orphans/purge.**
  1. `parseJsonBody(c, purgeOrphansRequestSchema, "request body is not a valid purge request")`.
  2. `purgeOrphans(db, data)`. It already owns the transaction, so the recount and the deletes are atomic with respect to imports.
  3. On ok, return `c.json({ purged })`. Otherwise return `apiError(c, 409, "orphans_changed", "leftover progress changed since it was counted; review it and confirm again")`.
- Add a Google-style JSDoc on `maintenanceRoutes`.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run server/test/api.maintenance.test.ts`, then `npm test` and `npm run typecheck`
Expected: 7 tests PASS, the full suite PASSES, and typecheck exits 0.

- [ ] **Step 5: Commit**
```bash
git add server/src/http.ts server/src/routes/maintenance.ts server/src/app.ts server/test/api.maintenance.test.ts
git commit -m "feat: add the orphan report and guarded purge API"
```

---

### Task 6: Read paths share the orphan predicates

**Files:**
- Modify: `server/src/attemptLog.ts`
  - Delete the module-private `VISIBLE_ATTEMPT`.
  - Add `import { LIVE } from "./orphans.js"`.
  - `listAttempts` filters with `WHERE ${LIVE.attempts("a")}` plus only the filters given.
- Modify: `server/src/routes/packages.ts`
  - The lessons query (today :20) also selects `lp.updated_at`.
  - The lesson row type gains `updated_at: string | null`.
  - The lesson summary (today :27) adds `updatedAt: l.updated_at ?? undefined`.
  - Stage 2 Task 18 retypes these rows, so find them by `COALESCE(lp.status, 'not-started')`.
- Modify: `web/src/pages/Lesson.tsx:27` (`d.progress === "not-started"` becomes `d.progress !== "completed"`)
- Test: `server/test/orphans.test.ts`, `server/test/api.review.test.ts`, `server/test/api.packages.test.ts`, `server/test/roundtrip.test.ts`, and Stage 2's `server/test/api.play.test.ts` (add a new `describe`; change no existing test)
- Test: `e2e/smoke.spec.ts` (add a second top-level test after test 1; test 1 unchanged)

**Interfaces:**
- Consumes:
  - Task 2: `LIVE`, `countOrphans`, `V2_FILES`, `seedUserState`;
  - Stage 2: `PLAY_FILES`, `GET /api/attempts` and `listAttempts(db, query: AttemptsQuery): AttemptRecord[]`;
  - the progress upsert at server/src/routes/lessons.ts:44-50, which refreshes `updated_at` until a lesson is completed.
- Produces:
  - `GET /api/packages` lesson summaries gain `updatedAt?: string`. It holds the time of the last in-progress or completion write and is absent for not-started lessons. Task 7 adds it to web's `LessonSummary`, Task 7's `lessonsInProgress` sorts on it, and Task 12's Home lists the result.
  - Opening any lesson that isn't completed now writes in-progress, so `updatedAt` means "last opened".

- [ ] **Step 1: Write the failing tests**

`server/test/orphans.test.ts`. This guard makes the refactor test-first, in the same style as Stage 2's `web/test/serverChecking.test.ts`:
```ts
it("the attempts history filters through LIVE.attempts", () => {
  const src = readFileSync(new URL("../src/attemptLog.ts", import.meta.url), "utf8");
  expect(src).toMatch(/LIVE\.attempts\(/);
  expect(src).not.toContain("VISIBLE_ATTEMPT");
});
```
`server/test/api.packages.test.ts` (fake Date and `at` as in Task 3; `progress(status)` POSTs to `/api/lessons/demo/intro/progress`; `lesson()` reads `packages[0].lessons[0]`):
```ts
it("started lessons carry updatedAt; not-started lessons don't", async () => {
  await importGood();
  expect("updatedAt" in (await lesson())).toBe(false);
  at("2026-10-01T09:00:00.000Z"); await progress("in-progress");
  expect(await lesson()).toMatchObject({ id: "intro", status: "in-progress", updatedAt: "2026-10-01T09:00:00.000Z" });
  at("2026-10-01T10:00:00.000Z"); await progress("in-progress");
  expect((await lesson()).updatedAt).toBe("2026-10-01T10:00:00.000Z");          // reopening moves it
  at("2026-10-01T11:00:00.000Z"); await progress("completed");
  at("2026-10-01T12:00:00.000Z"); await progress("in-progress");
  expect(await lesson()).toMatchObject({ status: "completed", updatedAt: "2026-10-01T11:00:00.000Z" });
});
it("progress on a lesson a re-import dropped never appears")
  // importGood(); progress("in-progress"); import V2_FILES → lessons toHaveLength(1); lessons[0] toMatchObject { id: "intro2", status: "not-started" };
  // "updatedAt" in lessons[0] → false; COUNT(*) lesson_progress → 1
```
`server/test/api.review.test.ts` (add `V2_FILES` to the `./helpers.js` import; uses the `grade` helper at :17-22):
```ts
it("orphaned card state never reaches the due queue or free study")
  // grade("front", "good"); grade("back", "good"); import V2_FILES
  // /due cards [itemId, direction, isNew] → [["card2", "front", true]]; /free-study?packageId=demo [itemId, direction] → [["card2", "front"]]
  // COUNT(*) card_state → 2 (kept, hidden)
it("a deleted package leaves nothing due, and re-import brings its state back")
  // grade("front", "good"); DELETE /api/packages/demo → /due cards [] and /free-study?packageId=demo cards []
  // re-import GOOD_FILES → /due directions ["back"]; the free-study front card's state toMatchObject { intervalDays: 1, reps: 1 }
```
`server/test/api.play.test.ts`: a new `describe("attempts history agrees with the orphan count")` that builds its own `freshDb()` and `createApp`, so the file's existing setup stays untouched. `WITHOUT_QUIZ_ALL` is PLAY_FILES without quiz `quiz-all`.
```ts
it("visible runs plus orphaned runs are all runs, through a drop, a delete and a restore")
  // import PLAY_FILES; POST /api/attempts three times, each → 200:
  //   1 { kind: "quiz", packageId: "demo", quizId: "quiz-all", elapsedSeconds: 5,
  //       answers: ["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"].map((itemId) => ({ itemId, answer: null })) }
  //   2 { kind: "quiz", packageId: "demo", quizId: "quiz-plain", elapsedSeconds: 5, answers: [{ itemId: "mc1", answer: { type: "multiple-choice", optionId: "a" } }] }
  //   3 { packageId: "demo", itemId: "mc1", answer: { type: "multiple-choice", optionId: "a" } }
  // check(ids, n): GET /api/attempts ids toEqual ids, and countOrphans(db, "demo").attempts toBe n
  // check([3, 2, 1], 0) → import WITHOUT_QUIZ_ALL → check([3, 2], 1) → DELETE /api/packages/demo → check([], 3)
  // → import PLAY_FILES → check([3, 2, 1], 0)
```
`server/test/roundtrip.test.ts` (import `AdmZip` and `seedUserState`; uses `FILES` at :15-21). Compare entry names and parsed content, not bytes, because zip headers carry timestamps:
```ts
it("exports the same package when notes and explanations exist", () => {
  // openDb(temp); importPackage(db, makeZip(FILES)); before = exportPackage(db, "demo")!; seedUserState(db); after = exportPackage(db, "demo")!
  const names = (zip: Buffer) => new AdmZip(zip).getEntries().map((e) => e.entryName).sort();
  expect(names(after)).toEqual(names(before));
  expect(readPackageZip(after).pkg).toEqual(readPackageZip(before).pkg);
});
```
`e2e/smoke.spec.ts`, test 2. It pins the Lesson.tsx:27 change, which no unit test can reach:
```ts
// e2e/smoke.spec.ts — test 2. Uses active-recall, never Spaced Repetition, and never completes a lesson.
test("reopening an unfinished lesson moves its last-opened time", async ({ page, request }) => {
  const PKG = "learning-how-to-learn", LESSON = "active-recall";
  const opened = async () => ((await (await request.get("/api/packages")).json()).packages
    .find((p: { id: string }) => p.id === PKG).lessons
    .find((l: { id: string }) => l.id === LESSON));
  expect((await request.post(`/api/lessons/${PKG}/${LESSON}/progress`, { data: { status: "in-progress" } })).status()).toBe(200);
  const before = (await opened()).updatedAt as string;
  expect(before).toBeTruthy();
  const write = page.waitForResponse((r) => r.url().endsWith(`/api/lessons/${PKG}/${LESSON}/progress`)
    && r.request().method() === "POST" && r.request().postDataJSON().status === "in-progress", { timeout: 5_000 });
  await page.goto(`/lesson/${PKG}/${LESSON}`);
  expect((await write).status()).toBe(200);
  const after = await opened();
  expect(after.status).toBe("in-progress");
  expect(after.updatedAt > before).toBe(true);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/test/orphans.test.ts server/test/api.packages.test.ts server/test/api.review.test.ts server/test/api.play.test.ts server/test/roundtrip.test.ts`
Expected: two tests FAIL:
- the guard, because attemptLog.ts still contains `VISIBLE_ATTEMPT`;
- "started lessons carry updatedAt", which fails its first `toMatchObject`, because the lesson has no `updatedAt` key.

The due and free-study, dropped-lesson, attempts-parity and roundtrip tests already PASS. They pin today's behaviour before the refactor.

Then run `npm run build -w web && npx playwright test -c e2e smoke.spec.ts`. Expected: test 2 FAILS, and test 1 passes. Either of two failures is acceptable red:
- `waitForResponse` times out, because Lesson.tsx:27 fires only for not-started lessons;
- `expect(before).toBeTruthy()` fails first, because `updatedAt` is missing until the packages.ts edit is in.

- [ ] **Step 3: Make the three edits listed under Files**

`listAttempts` keeps its other filters, its order and its mapping. Only the visibility clause changes, and Stage 2's `GET /api/attempts` tests must pass unchanged. The Lesson.tsx edit has no web unit test, because the web tests run in node with no DOM (vitest.config.ts). `e2e/smoke.spec.ts` test 2 pins it. It opens an in-progress lesson and requires a fresh in-progress POST and a later `updatedAt`. The server test "started lessons carry updatedAt" pins the upsert behind it. Task 7's `web/test/home.test.ts` pins the "last opened first" ordering.

- [ ] **Step 4: Run tests and confirm they pass**

Run, in order:
1. The Step 2 `npx vitest run …` command.
2. `npm test` and `npm run typecheck`.
3. `npm run e2e`. Smoke's progress route fails only the first completed write (e2e/smoke.spec.ts:39-43), so the extra in-progress writes do not affect it.
4. `grep -rn VISIBLE_ATTEMPT server/src`.

Expected:
- every test PASSES, including Stage 2's attempts tests, unchanged;
- typecheck exits 0;
- smoke.spec.ts (2 tests) and play.spec.ts pass;
- the grep prints nothing.

- [ ] **Step 5: Commit**
```bash
git add server/src/attemptLog.ts server/src/routes/packages.ts web/src/pages/Lesson.tsx server/test/orphans.test.ts server/test/api.review.test.ts server/test/api.packages.test.ts server/test/api.play.test.ts server/test/roundtrip.test.ts e2e/smoke.spec.ts
git commit -m "feat: share the orphan predicates across read paths"
```

---

### Task 7: Web data layer and pure helpers

**Files:**
- Modify: `web/src/api.ts`. The type import at api.ts:1 gains `Note, NoteCreate, NotePatch, Explanation, ExplanationCreate, ExplanationPatch, OrphanGroup, OrphanCounts, PurgeOrphansRequest`. `LessonSummary` (api.ts:3) gains `updatedAt?: string`. `const json = (body: unknown): RequestInit` (api.ts:35-39) gains a method parameter. The eleven client functions below are added after Stage 2's functions. Stage 2 edits `api.ts` first, so the quoted code is the anchor (Global Constraints, Line citations).
- Modify: `web/src/format.ts` (Stage 2 Task 21 creates it). Add `formatDay`.
- Create: `web/src/text.ts`, `web/src/drafts.ts`, `web/src/listFilter.ts`, `web/src/home.ts`
- Test: `web/test/api.test.ts` (Stage 2's; add cases), `web/test/text.test.ts` (new), `web/test/format.test.ts` (Stage 2's; add cases), `web/test/drafts.test.ts` (new), `web/test/listFilter.test.ts` (new), `web/test/home.test.ts` (new)

**Interfaces:**
- Consumes:
  - From Task 1's Interfaces: `Note`, `NoteTarget`, `NoteCreate`, `NotePatch`, `Explanation`, `ExplanationCreate`, `ExplanationPatch`, `OrphanCounts`, `OrphanGroup`, `PurgeOrphansRequest`, `ORPHAN_KINDS` and `purgedKinds(includeWriting: boolean): OrphanKind[]`.
  - From Tasks 3–5: the response wrappers `{ notes }`, `{ note }`, `{ explanations }`, `{ explanation }`, `{ packages }` and `{ purged }`, plus 204 on `DELETE /api/notes/:id`.
  - From Task 6: `updatedAt` on the lessons of `GET /api/packages`.
  - From shared: `stripMath(text: string): string` (shared/src/mathSource.ts:154).
  - From Stage 2: `PackageSummary` with `quizzes` and `games`, and `req<T>` / `ApiError` (api.ts:22-34).
- Produces:
  - In `api.ts`:
    - `json(body: unknown, method: "POST" | "PATCH" = "POST"): RequestInit` (private)
    - `LessonSummary.updatedAt?: string`
    - `listNotes(): Promise<Note[]>`
    - `getNote(id: number): Promise<Note>`
    - `createNote(input: NoteCreate): Promise<Note>`
    - `updateNote(id: number, patch: NotePatch): Promise<Note>`
    - `deleteNote(id: number): Promise<void>`
    - `listExplanations(opts: { revisit?: boolean } = {}): Promise<Explanation[]>`
    - `getExplanation(id: number): Promise<Explanation>`
    - `createExplanation(input: ExplanationCreate): Promise<Explanation>`
    - `updateExplanation(id: number, patch: ExplanationPatch): Promise<Explanation>`
    - `getOrphans(): Promise<OrphanGroup[]>`
    - `purgeOrphans(request: PurgeOrphansRequest): Promise<OrphanCounts>`
  - In `text.ts`:
    - `headline(body: string, max = 80): string`
    - `message(e: unknown): string`
    - `plural(n: number, word: string): string`
    - `describeCounts(c: OrphanCounts): string`
    - `purgeTotal(c: OrphanCounts, includeWriting: boolean): number`
  - In `format.ts`: `formatDay(iso: string): string`.
  - In `drafts.ts`:
    - `interface DraftStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`
    - `browserDraftStore(): DraftStore`
    - `draftKey(kind: "note" | "explanation", id: number | "new"): string`
    - `readDraft(store: DraftStore, key: string): { body: string; at: string } | null`
    - `writeDraft(store: DraftStore, key: string, body: string, now: Date): void`
    - `clearDraft(store: DraftStore, key: string): void`
    - `useDraft(key: string, savedBody: string | null): { offer: { body: string; at: string } | null; write(body: string): void; clear(): void; dismiss(): void }`
  - In `listFilter.ts`:
    - `type ListFilter = { kind: "all" } | { kind: "standalone" } | { kind: "orphaned"; packageId?: string } | { kind: "package"; packageId: string; lessonId?: string }`
    - `parseListFilter(params: URLSearchParams): ListFilter`
    - `filterSearch(filter: ListFilter, extra?: Record<string, string>): string`
    - `filterNotes(notes: Note[], f: ListFilter): Note[]`
    - `filterExplanations(list: Explanation[], f: ListFilter, revisitOnly: boolean): Explanation[]`
  - In `home.ts`:
    - `interface InProgressLesson { packageId: string; packageTitle: string; lessonId: string; title: string; updatedAt?: string }`
    - `lessonsInProgress(packages: PackageSummary[], limit = 5): { lessons: InProgressLesson[]; more: number }`

- [ ] **Step 1: Write the failing tests.** The tests build typed `Note`, `Explanation` and `PackageSummary` values through small helpers in each file. web/test is typechecked since Stage 2. The new `api.test.ts` cases go in their own `describe`, beside Stage 2's `isStale` test. They stub `fetch` with `vi.stubGlobal` and record `[url, init]`; `afterEach(vi.unstubAllGlobals)`.

```ts
// web/test/api.test.ts (added to Stage 2's file)
it("asks for revisit prompts only when told to")
  // listExplanations(); listExplanations({ revisit: false }); listExplanations({ revisit: true })
  expect(urls).toEqual(["/api/explanations", "/api/explanations", "/api/explanations?revisit=1"]);
it("sends a note update as PATCH JSON")             // updateNote(3, { body: "x" })
  expect(url).toBe("/api/notes/3"); expect(init.method).toBe("PATCH");
  expect(init.headers).toEqual({ "content-type": "application/json" }); expect(init.body).toBe('{"body":"x"}');
it("still POSTs when no method is given")           // createNote({ body: "x", target: null }); setProgress("p", "l", "completed")
  expect(methods).toEqual(["POST", "POST"]);
it("resolves a 204 delete to undefined")            // new Response(null, { status: 204 })
  await expect(deleteNote(3)).resolves.toBeUndefined(); expect(init.method).toBe("DELETE");
it("surfaces a stale purge as orphans_changed")      // 409 { error: { code: "orphans_changed", message: "m" } }
  await expect(purgeOrphans(req)).rejects.toBeInstanceOf(ApiError);
  await expect(purgeOrphans(req)).rejects.toMatchObject({ code: "orphans_changed" });

// web/test/text.test.ts
it("headline takes the first real line without markdown markers or math")
  expect(headline("# Title\n\nBody")).toBe("Title");
  expect(headline("\n\n> - nested")).toBe("nested");
  expect(headline("1. first")).toBe("first"); expect(headline("2) second")).toBe("second");
  expect(headline("```js\ncode line\n```")).toBe("code line");
  expect(headline("#\n\nReal title")).toBe("Real title");
  expect(headline("#hashtag")).toBe("#hashtag");
  expect(headline("Area is $a^2$")).toBe("Area is a^2");
  expect(headline("a   b\t c")).toBe("a b c");
it("headline truncates with an ellipsis and falls back")
  expect(headline("x".repeat(100))).toBe("x".repeat(79) + "…");
  expect(headline("")).toBe("Untitled note"); expect(headline("  \n\n")).toBe("Untitled note");
  expect(headline("```\n```")).toBe("Untitled note");
it("message and plural")
  expect(message(new Error("boom"))).toBe("boom"); expect(message("x")).toBe("x");
  expect(plural(1, "note")).toBe("1 note"); expect(plural(0, "note")).toBe("0 notes"); expect(plural(2, "note")).toBe("2 notes");
it("describeCounts omits zeros and pluralises")      // c = { cardState: 3, reviewLog: 12, attempts: 2, lessonProgress: 1, notes: 2, explanations: 1 }
  expect(describeCounts(c)).toBe("3 card schedules · 12 reviews · 2 results · 1 lesson mark · 2 notes · 1 explanation");
  expect(describeCounts({ ...zero, reviewLog: 1 })).toBe("1 review"); expect(describeCounts(zero)).toBe("");
it("purgeTotal counts writing only when included")
  expect(purgeTotal(c, false)).toBe(18); expect(purgeTotal(c, true)).toBe(21);

// web/test/format.test.ts (added to Stage 2's file)
it("formatDay prints a local calendar day")
  expect(formatDay(new Date(2026, 9, 22, 12).toISOString())).toBe("22 Oct 2026");
  expect(formatDay("not a date")).toBe("");

// web/test/drafts.test.ts — mem() is a Map-backed DraftStore; broken() throws from every method
it("draftKey format")
  expect(draftKey("note", "new")).toBe("study.draft.note.new"); expect(draftKey("explanation", 7)).toBe("study.draft.explanation.7");
it("round-trips and clears a draft")
  writeDraft(s, k, "body", new Date("2026-10-22T10:00:00.000Z"));
  expect(readDraft(s, k)).toEqual({ body: "body", at: "2026-10-22T10:00:00.000Z" });
  clearDraft(s, k); expect(readDraft(s, k)).toBeNull();
it("treats corrupt or foreign values as no draft")   // "{not json", '{"body":1,"at":"x"}', '"text"'
  expect(readDraft(s, k)).toBeNull();                  // for each of the three
it("never throws on a broken store")
  expect(readDraft(broken(), k)).toBeNull();
  expect(() => writeDraft(broken(), k, "b", new Date())).not.toThrow(); expect(() => clearDraft(broken(), k)).not.toThrow();
  expect(() => { const s = browserDraftStore(); s.setItem(k, "b"); s.getItem(k); s.removeItem(k); }).not.toThrow(); // node has no window, so the probe throws

// web/test/listFilter.test.ts — notes: 1 standalone; 2 package p; 3 lesson p/l1; 4 lesson p/l2; 5 orphaned q/x; 6 orphaned p/gone
//                                explanations: 1 p/l1 revisit; 2 p/l1; 3 p/l2 revisit; 4 orphaned q/x
//                                ALL_FILTER_SHAPES = [{ kind: "all" }, { kind: "standalone" }, { kind: "orphaned" }, { kind: "orphaned", packageId: "p" },
//                                  { kind: "package", packageId: "p" }, { kind: "package", packageId: "p", lessonId: "l" }]
it("parses with orphaned first, then standalone, then package")
  expect(parse("orphaned=1&standalone=1&packageId=p")).toEqual({ kind: "orphaned", packageId: "p" });
  expect(parse("orphaned=1")).toEqual({ kind: "orphaned" });
  expect(parse("standalone=1&packageId=p")).toEqual({ kind: "standalone" });
  expect(parse("packageId=p&lessonId=l")).toEqual({ kind: "package", packageId: "p", lessonId: "l" });
  expect(parse("packageId=p")).toEqual({ kind: "package", packageId: "p" });
  expect(parse("lessonId=l")).toEqual({ kind: "all" }); expect(parse("orphaned=true")).toEqual({ kind: "all" });
it("filterSearch puts extra keys first and round-trips")
  expect(filterSearch({ kind: "all" })).toBe(""); expect(filterSearch({ kind: "standalone" })).toBe("?standalone=1");
  expect(filterSearch({ kind: "orphaned", packageId: "p" }, { tab: "explanations" })).toBe("?tab=explanations&orphaned=1&packageId=p");
  expect(filterSearch({ kind: "all" }, { tab: "explanations", revisit: "1" })).toBe("?tab=explanations&revisit=1");
  for (const f of ALL_FILTER_SHAPES) expect(parseListFilter(new URLSearchParams(filterSearch(f)))).toEqual(f);
it("filters notes")                                  // ids of the result
  all → [1, 2, 3, 4]; standalone → [1]; package p → [2, 3, 4]; package p/l1 → [3];
  orphaned → [5, 6]; orphaned q → [5]; package q → []
it("filters explanations")
  (all, false) → [1, 2, 3]; (all, true) → [1, 3]; (package p/l2, true) → [3];
  (orphaned, false) → [4]; (orphaned, true) → []; (standalone, false) → []

// web/test/home.test.ts — Alpha: a1 in-progress @10-20, a2 completed, a3 in-progress (no updatedAt), a4 not-started;
//                         Beta: b1 in-progress @10-21, b2 in-progress @10-19, b3 in-progress (no updatedAt)
it("keeps in-progress lessons, newest first, missing last in library order")
  expect(ids(lessonsInProgress(pkgs).lessons)).toEqual(["b1", "a1", "b2", "a3", "b3"]);
  expect(lessonsInProgress(pkgs).more).toBe(0);
  expect(lessonsInProgress(pkgs).lessons[0]).toEqual({ packageId: "beta", packageTitle: "Beta", lessonId: "b1", title: "B one", updatedAt: "2026-10-21T00:00:00.000Z" });
it("limits and counts the rest")
  expect(lessonsInProgress(pkgs, 2)).toMatchObject({ more: 3 }); expect(lessonsInProgress([])).toEqual({ lessons: [], more: 0 });
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run web/test`. Expected: FAIL. The new modules (`../src/text.js`, `../src/drafts.js`, `../src/listFilter.js`, `../src/home.js`) cannot be resolved. The new `api.test.ts` cases fail on the missing exports, while Stage 2's `isStale` test stays green. `formatDay` is not exported.
- [ ] **Step 3: Implement the six modules.**
  - **api.ts.** One line per function over `req<T>`. Unwrap the wrapper with `.then((r) => r.note)` and so on. `listExplanations` appends `?revisit=1` only when `opts.revisit === true`.
  - **headline.**
    - Split the body on `/\r?\n/`.
    - Skip blank lines, fence lines (trimmed start matches `` /^(```|~~~)/ ``), and lines that are empty once the markers are stripped. The marker pattern is `/^(?:#{1,6}(?:\s+|$)|>\s?|[-*+]\s+|\d+[.)]\s+)+/`, applied after `trimStart`.
    - Apply `stripMath`, then collapse `/\s+/g` to one space, then trim.
    - When the result is longer than `max`, cut it to `s.slice(0, max - 1).trimEnd() + "…"`.
    - When no line is left, return `"Untitled note"`.
  - **describeCounts.**
    - The words follow `ORPHAN_KINDS` order: `{ cardState: "card schedule", reviewLog: "review", attempts: "result", lessonProgress: "lesson mark", notes: "note", explanations: "explanation" }`.
    - Pluralise each count with `plural`, drop the zeros, and join with `" · "`.
  - **purgeTotal.** Sum the kinds in `purgedKinds(includeWriting)`.
  - **formatDay.** Return `` `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` `` in local time. `MONTHS` is `Jan`…`Dec`. An invalid date returns `""`.
  - **drafts.**
    - A stored value is `JSON.stringify({ body, at: now.toISOString() })`.
    - `readDraft` returns null unless the parsed value has a string `body` and a string `at`.
    - The write and clear functions swallow errors.
    - `browserDraftStore()` returns `window.localStorage` after a probing `getItem`. When that access throws, it returns a no-op store.
    - `useDraft` reads the store once per mount, when `savedBody` first becomes non-null. It offers the draft when the draft's body differs from `savedBody`.
    - In `useDraft`, a later `key` change only redirects `write` and `clear`. It never re-offers, so the key switch after a create cannot show a prompt. `dismiss` hides the offer and keeps the draft.
  - **listFilter.**
    - Only the value `"1"` sets `orphaned` or `standalone`.
    - `filterSearch` writes the `extra` entries first, then the filter's own keys: `orphaned=1` and optionally `packageId`; `standalone=1`; or `packageId` and optionally `lessonId`. It returns `""` when there are no keys, otherwise `"?" + params`.
    - In `filterNotes` and `filterExplanations`, every kind except `orphaned` excludes orphaned rows.
    - Explanations are never standalone, so the `standalone` kind matches none of them.
    - `revisitOnly` keeps only rows with `e.revisit === true`.
  - **lessonsInProgress.** Keep `status === "in-progress"`, then run a stable sort by `updatedAt` descending, with missing values last.
- [ ] **Step 4: Run tests and confirm they pass.** Run `npx vitest run web/test`, then `npm test`, `npm run typecheck` and `npm run e2e`. Expected: PASS, with no type errors. smoke and play stay green on the generalised `json` helper, which `setProgress`, `submitAnswer`, `gradeCard` and Stage 2's submits still call with the default POST.
- [ ] **Step 5: Commit.**

```bash
git add web/src/api.ts web/src/format.ts web/src/text.ts web/src/drafts.ts web/src/listFilter.ts web/src/home.ts web/test/api.test.ts web/test/text.test.ts web/test/format.test.ts web/test/drafts.test.ts web/test/listFilter.test.ts web/test/home.test.ts
git commit -m "feat: web client and pure helpers for notes, explanations and Home"
```

---

### Task 8: Editor components

**Files:**
- Modify: `web/src/components/Markdown.tsx`.
  - `assetUrls` (Markdown.tsx:29-30) takes `packageId?: string`. It rewrites `assets/…` only when `packageId` is set; otherwise every URL goes through `defaultUrlTransform`.
  - `Markdown`'s prop (Markdown.tsx:37) becomes `packageId?: string`.
  - `LessonMarkdown` (Markdown.tsx:105-126) keeps `packageId: string`.
- Modify: `web/src/components/Icon.tsx`. `PATHS` (Icon.tsx:3-17, plus Stage 2's `quiz` and `game`) gains:
  - `home: "M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z"`
  - `note: "M6 3.5h8.5L19 8v12.5H6zM14 3.5V8h5M9 12.5h7M9 16h5"`
- Create: `web/src/components/MarkdownEditor.tsx`, `web/src/components/ConfidencePicker.tsx`, `web/src/components/TargetSelect.tsx`
- Modify: `web/src/styles/components.css`. Add a new `/* ---- Notes ---- */` section immediately before the `@media (max-width: 30rem)` block (components.css:803 today).
- Test: `web/test/rendering.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `BODY_MAX`, `Confidence`, `CONFIDENCE_LEVELS` and `NoteTarget`.
  - The per-instance `useId` pattern (ActivityView.tsx:253).
  - The `.segmented` radiogroup markup (Study.tsx:157-166).
  - The `.opt`/`.opts` styles (components.css:373-418).
- Produces:
  - `Markdown({ packageId, className = "prose", children }: { packageId?: string; className?: string; children: string })`
  - `IconName` gains `"home" | "note"`.
  - default `MarkdownEditor({ label, value, onChange, packageId, disabled = false, onSave }: { label: string; value: string; onChange: (value: string) => void; packageId?: string; disabled?: boolean; onSave?: () => void })`
  - `CONFIDENCE_LABEL: Record<Confidence, string>`
  - default `ConfidencePicker({ value, onChange, disabled = false }: { value: Confidence | null; onChange: (c: Confidence) => void; disabled?: boolean })`
  - `ConfidenceChip({ confidence }: { confidence: Confidence })`
  - `type TargetPackage = { id: string; title: string; lessons: { id: string; title: string }[] }` (`PackageSummary` satisfies it)
  - `encodeTarget(t: NoteTarget | null): string`
  - `decodeTarget(v: string): NoteTarget | null`
  - default `TargetSelect({ label, packages, value, onChange, lessonsOnly = false, currentOnly = false, disabled = false }: { label: string; packages: TargetPackage[]; value: NoteTarget | null; onChange: (t: NoteTarget | null) => void; lessonsOnly?: boolean; currentOnly?: boolean; disabled?: boolean })`

- [ ] **Step 1: Write the failing tests** (new `describe` blocks in `web/test/rendering.test.tsx`; `render = renderToStaticMarkup`).

```ts
it("Markdown rewrites package assets only when a packageId is given")
  expect(render(<Markdown>{"![x](assets/x.png)"}</Markdown>)).toContain('src="assets/x.png"');
  expect(render(<Markdown packageId="p">{"![x](assets/x.png)"}</Markdown>)).toContain('src="/api/packages/p/assets/x.png"');
it("Markdown strips javascript: links in user text")
  expect(render(<Markdown>{"[a](javascript:alert(1))"}</Markdown>)).not.toContain("javascript:");
it("Markdown renders broken TeX as an error instead of throwing")
  expect(render(<Markdown>{"$\\frac{$"}</Markdown>)).toContain("katex-error");
it("Icon has home and note")
  expect(render(<Icon name="home" />)).toContain("M4 10.5 12 4"); expect(render(<Icon name="note" />)).toContain("M6 3.5h8.5");
it("MarkdownEditor ties its label to the textarea, starts on Write and has no length cap")
  const html = render(<MarkdownEditor label="Note" value="Hi" onChange={() => {}} />);
  const id = html.match(/<label for="([^"]+)"/)![1]; expect(html).toMatch(new RegExp(`<textarea[^>]*id="${id}"`));
  expect(html).not.toContain("maxlength"); expect(html).not.toMatch(/<textarea[^>]*hidden/); expect(html).not.toContain("editor-preview");
  expect(html).toContain("Write</label>"); expect(html).toContain("Preview</label>");
  expect(html).toContain("Markdown and $math$ work — write \\$ for a dollar sign.");
it("MarkdownEditor gives two editors distinct mode groups")
  names = radio names across two editors; expect(names).toHaveLength(4); expect(new Set(names).size).toBe(2);
it("MarkdownEditor shows the count only above 90% of the cap")
  expect(render(editor("x".repeat(90_000)))).not.toContain("editor-count");
  expect(render(editor("x".repeat(90_001)))).toContain("90,001 / 100,000");
it("ConfidencePicker renders a legend and five unchecked radios")
  expect(html).toContain("<legend>How well could you explain it?</legend>"); expect(html.match(/type="radio"/g)).toHaveLength(5);
  for (const t of ["1 · Lost", "2 · Shaky", "3 · Getting there", "4 · Solid", "5 · Could teach it"]) expect(html).toContain(t);
  expect(html).not.toContain("checked");
it("ConfidencePicker checks the given value and keeps groups apart")
  value={2}: const on = html.match(/<input[^>]*checked=""[^>]*>/g)!; expect(on).toHaveLength(1); expect(on[0]).toContain('value="2"');
  two pickers → 2 distinct radio names
it("ConfidenceChip marks low and high")
  expect(render(<ConfidenceChip confidence={2} />)).toContain("conf-chip is-low"); …toContain("2 · Shaky");
  expect(render(<ConfidenceChip confidence={3} />)).not.toMatch(/is-low|is-high/);
  expect(render(<ConfidenceChip confidence={4} />)).toContain("conf-chip is-high");
// pkgs = [{ id: "p", title: "Alpha", lessons: [{ id: "l1", title: "One" }] }, { id: "q", title: "Beta", lessons: [] }]
it("TargetSelect groups lessons by package and selects the value")
  html = render(<TargetSelect label="Attach to" packages={pkgs} value={{ packageId: "p", lessonId: "l1" }} onChange={() => {}} />);
  expect(html).toContain('<optgroup label="Alpha">'); expect(html).toContain('value="">Standalone</option>');
  expect(html).toContain('value="p/">Whole package</option>'); expect(html).toMatch(/<option[^>]*value="p\/l1"[^>]*selected=""[^>]*>One<\/option>/);
  label for= equals the select's id
it("TargetSelect lessonsOnly drops Standalone and Whole package")
  value null: expect(html).not.toMatch(/Standalone|Whole package/); expect(html).toMatch(/<option[^>]*disabled=""[^>]*>Pick a lesson…<\/option>/);
it("TargetSelect keeps a target that is no longer in the library")
  { packageId: "gone", lessonId: "x" } → expect(html).toMatch(/<option[^>]*selected=""[^>]*>gone\/x \(no longer in your library\)<\/option>/);
  { packageId: "gone", lessonId: null } → expect(html).toContain("gone (no longer in your library)");
it("TargetSelect currentOnly offers only Standalone and the given target")
  one = [{ id: "p", title: "Alpha", lessons: [{ id: "l1", title: "One" }] }], value { packageId: "p", lessonId: "l1" }:
    expect(html.match(/<option/g)).toHaveLength(2); expect(html).not.toMatch(/<optgroup|Whole package|no longer in your library/);
    expect(html).toMatch(/<option[^>]*value="p\/l1"[^>]*selected=""[^>]*>Alpha › One<\/option>/);
  one, value null → expect(html).toMatch(/<option[^>]*value=""[^>]*selected=""[^>]*>Standalone<\/option>/); expect(html).toContain('value="p/l1"');
  [{ id: "p", title: "p", lessons: [] }], value { packageId: "p", lessonId: null } → expect(html).toMatch(/<option[^>]*value="p\/"[^>]*selected=""[^>]*>p<\/option>/);
it("encodeTarget and decodeTarget round-trip")
  expect(encodeTarget(null)).toBe(""); expect(encodeTarget({ packageId: "p", lessonId: null })).toBe("p/");
  expect(encodeTarget({ packageId: "p", lessonId: "l1" })).toBe("p/l1");
  for (const t of [null, { packageId: "p", lessonId: null }, { packageId: "p", lessonId: "l1" }]) expect(decodeTarget(encodeTarget(t))).toEqual(t);
  expect(decodeTarget("nonsense")).toBeNull();
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run web/test/rendering.test.tsx`. Expected: FAIL. `MarkdownEditor.js`, `ConfidencePicker.js` and `TargetSelect.js` cannot be resolved. Optional `packageId` and the new icon names are type errors.
- [ ] **Step 3: Implement the three components, the Markdown change, the icons and the CSS.**
  - **Static-markup rule** (applies in every later UI task). `renderToStaticMarkup` puts `<!-- -->` between adjacent JSX text expressions, so build every copy line that mixes values and words as one template literal, e.g. `` {`${n} · ${CONFIDENCE_LABEL[n]}`} ``.
  - **MarkdownEditor layout.**
    - The root is a `div.editor`. Inside it, `div.editor-bar` holds a visible `<label htmlFor={id}>` and a `.segmented` `role="radiogroup"` `aria-label="Editor mode"` with radios `Write` and `Preview`. The radio name comes from its own `useId`.
    - Below the bar is `<textarea id className="field editor-text" spellCheck>`. It is always mounted and gets `hidden` in Preview. `disabled` applies to the textarea only.
    - The preview renders only in Preview. A non-blank value renders `<Markdown packageId={packageId} className="prose editor-preview">`. A blank value renders `<p className="editor-preview note">Nothing to preview yet.</p>`.
  - **MarkdownEditor behaviour.**
    - Hint: `<p className="note">` with the copy in the test.
    - Count: when `value.length > BODY_MAX * 0.9`, render `<p className="editor-count">` with `` `${value.length.toLocaleString("en-US")} / ${BODY_MAX.toLocaleString("en-US")}` ``.
    - Keyboard: on `keydown`, `(ctrlKey || metaKey)` together with `Enter` or `s`/`S` calls `preventDefault()` and then `onSave?.()`.
    - There is no `maxLength` attribute.
  - **ConfidencePicker.**
    - The root is `fieldset.confidence`, holding a `<legend>` and a `div.opts` of five `label.opt` elements, each with an `<input type="radio" name={useId()} value={n}>`.
    - The picker has no default value and no global keys.
    - `ConfidenceChip` renders a `span` with className `` `chip chip-plain conf-chip${c <= 2 ? " is-low" : c >= 4 ? " is-high" : ""}` ``.
  - **TargetSelect.**
    - `<label htmlFor>` plus `<select className="field">` with `value={encodeTarget(value)}`.
    - Unless `lessonsOnly`, the first option is `""` Standalone, and each `<optgroup label={title}>` starts with a `pkg/` Whole package option.
    - With `lessonsOnly`, a leading `<option value="" disabled>Pick a lesson…</option>` takes their place.
    - With `currentOnly` (the note editor's fallback when the library failed to load), there are no optgroups and no Whole package option. The options are `""` Standalone, then one `p/l` option per lesson in `packages`, labelled `` `${title} › ${lesson.title}` ``, and one `p/` option labelled `title` for each package with no lessons.
    - A value missing from `packages` appends a selected option labelled `` `${pkg}/${lesson} (no longer in your library)` `` (or `` `${pkg} (no longer in your library)` `` for a package target).
    - `decodeTarget` splits at the first `/`. It returns null for `""` or for a value with no `/`, and maps an empty lesson part to `null`.
  - **CSS** (tokens only, no new tokens).
    - `.editor`: `display: grid; gap: var(--s3)`.
    - `.editor-bar`: flex, wrap, `align-items: center`, `justify-content: space-between`, `gap: var(--s3)`.
    - `.editor-text`: `width: 100%; min-height: 16rem; resize: vertical; padding: var(--s3); font-family: var(--font-prose); line-height: 1.6`. Its border and focus copy `.field` (components.css:446-457).
    - `.editor-preview`: `min-height: 16rem; border: 1px solid var(--rule); border-radius: var(--r); padding: var(--s4)`.
    - `.editor-count`: `font-family: var(--font-mono); font-size: var(--t-micro); color: var(--ink-3)`.
    - `.notes-list`: `list-style: none; padding: 0; display: grid; gap: var(--s2)`.
    - `.notes-row`: the `.lesson-row` look (components.css:202-236) on its own class. Never use `.note`, which is the small-type paragraph at components.css:156.
    - `.confidence`: `border: 0; padding: 0; margin: 0; display: grid; gap: var(--s3)`.
    - `.conf-chip.is-low`: `color: var(--pen-red); background: var(--pen-red-soft); border-color: var(--pen-red)`.
    - `.conf-chip.is-high`: `background: var(--marker-wash); color: var(--on-wash)`.
- [ ] **Step 4: Run tests and confirm they pass.** Run `npx vitest run web/test/rendering.test.tsx` (the Stage 1 and Stage 2 cases stay green), then `npm test`, `npm run typecheck` and `npm run e2e`. Expected: PASS. smoke's lesson still shows its asset images, because `LessonMarkdown` keeps its required `packageId`.
- [ ] **Step 5: Commit.**

```bash
git add web/src/components/Markdown.tsx web/src/components/Icon.tsx web/src/components/MarkdownEditor.tsx web/src/components/ConfidencePicker.tsx web/src/components/TargetSelect.tsx web/src/styles/components.css web/test/rendering.test.tsx
git commit -m "feat: Markdown editor, confidence picker and lesson target select"
```

---

### Task 9: Notes pages and the notes e2e

**Files:**
- Create: `web/src/pages/Notes.tsx`, `web/src/pages/NoteEditor.tsx`, `e2e/notes.spec.ts`
- Modify: `web/src/App.tsx`.
  - Import `useLocation`, `Notes` and `NoteEditor`.
  - Add `NoteRoute` beside `LessonRoute` (App.tsx:17-20).
  - Add the routes `/notes` → `<Notes />`, `/notes/new` and `/notes/:noteId` → `<NoteRoute />` inside `<Routes>` (App.tsx:70-74).
  - Add the Notes NavLink last in `.nav` (App.tsx:46-61): `to="/notes"`, no `end`, `<Icon name="note" />` and `<span className="nav-label">Notes</span>`.
- Test: `web/test/rendering.test.tsx`
- `e2e/playwright.config.ts` does not change: Stage 2 set `workers: 1` and the temp-dir teardown.

**Interfaces:**
- Consumes:
  - From Task 7: `listNotes`, `getNote`, `createNote`, `updateNote` and `deleteNote`; `headline`, `message` and `plural`; `formatDay`; `draftKey`, `useDraft`, `browserDraftStore`, `writeDraft` and `clearDraft`; `ListFilter`, `parseListFilter`, `filterSearch` and `filterNotes`.
  - Existing: `listPackages` and `ApiError` (api.ts:41, :22-26).
  - From Task 8: `MarkdownEditor`, `TargetSelect` (with `currentOnly`), `TargetPackage`, `encodeTarget`, `decodeTarget` and the `note` icon.
  - From Task 1: `BODY_MAX`, `Note`, `NoteTarget`, `NoteTargetView` and `NotePatch`.
- Produces:
  - `NotesListView({ notes, packages, filter, onFilterChange }: { notes: Note[]; packages: TargetPackage[]; filter: ListFilter; onFilterChange: (f: ListFilter) => void })` (named export of Notes.tsx).
  - default `Notes()`.
  - default `NoteEditor({ editorKey }: { editorKey: string })`.
  - In App.tsx, `NoteRoute()` computes ``k = (location.state as { editorKey?: string } | null)?.editorKey ?? noteId ?? `new:${location.key}` `` and renders `<NoteEditor key={k} editorKey={k} />`. The `location.key` suffix makes every "New note" visit a fresh editor. After a create, the editor calls ``navigate(`/notes/${id}`, { replace: true, state: { editorKey } })``, so the same instance survives.

- [ ] **Step 1: Write the failing tests.** Fixtures:
  - n1: standalone, body `"# Shopping\n\nmilk"`.
  - n2: package `p` (title Alpha), body `"Package thoughts"`.
  - n3: `p/l1` (Alpha › One).
  - n4 and n5: orphaned `gone/x` with null titles.
  - `pkgs = [{ id: "p", title: "Alpha", lessons: [{ id: "l1", title: "One" }] }]`.
  - Static renders are wrapped in `MemoryRouter`.

```ts
it("NotesListView hides removed-content notes behind a notice")       // filter { kind: "all" }
  expect(html).toContain("Shopping"); expect(html).toContain("2 notes belong to content that’s no longer in your library.");
  expect(html).toContain('href="/notes?orphaned=1"'); expect(html).toContain("From removed content (2)");
  expect(html).not.toContain("Removed: gone/x");
it("NotesListView labels each target")
  expect(html).toContain('<span class="lesson-row-sum">Standalone</span>');
  expect(html).toContain('<span class="lesson-row-sum">Alpha</span>'); expect(html).toContain('<span class="lesson-row-sum">Alpha › One</span>');
it("NotesListView shows only removed-content notes in that view")      // { kind: "orphaned" }
  expect(html).toContain("Removed: gone/x"); expect(html).not.toContain("Shopping"); expect(html).not.toContain("belong to content");
it("NotesListView has empty states")
  notes [] → toContain("No notes yet"); { kind: "package", packageId: "zzz" } → toContain("Nothing here yet.");
it("NotesListView carries the filter into New note and offers the package's lessons")
  { kind: "package", packageId: "p", lessonId: "l1" } → toContain('href="/notes/new?packageId=p&amp;lessonId=l1"'),
    toContain('aria-label="Lesson"'), toContain(">Whole package<");
  { kind: "all" } → toContain('href="/notes/new"'), toContain('href="/notes/3"'), toContain('value="pkg:p"');
```

`e2e/notes.spec.ts` (new). It opens with `test.describe.configure({ mode: "serial" })` and constants `PKG = "learning-how-to-learn"` and `LESSON = "active-recall"`. No test grades a card or completes Spaced Repetition (smoke.spec.ts:44-49, :78). Route counters count only their method and `route.continue()` everything else.

Test 1, "a note saves once, keeps its editor and can be deleted". It uses `({ page, request })`.
1. ``goto(`/notes/new?packageId=${PKG}&lessonId=${LESSON}`)``, then ``expect(getByLabel("Attach to")).toHaveValue(`${PKG}/${LESSON}`)``.
2. `editor = getByLabel("Note", { exact: true })` and `save = getByRole("button", { name: "Save", exact: true })`. Expect `save` toBeDisabled (blank body). Fill `editor` with `"x".repeat(100_001)`, then expect `save` toBeDisabled, `locator(".editor-count")` toHaveText("100,001 / 100,000"), and `editor.evaluate((el) => (el as HTMLTextAreaElement).value.length)` to resolve to `100_001` (nothing truncated). Fill it with `Area is $a^2$` and expect `save` toBeEnabled. Run `editor.evaluate((el) => el.setAttribute("data-probe", "kept"))`. `getByLabel("Preview").check()`, then expect `.editor-preview .katex` toBeVisible and `editor` toBeHidden. Then `getByLabel("Write").check()` and expect `editor` toHaveAttribute("data-probe", "kept"): Preview hid the textarea without unmounting it.
3. Route `**/api/notes`. POST #1 is fulfilled with `{ status: 500, body: "{}" }`. POST #2 is held on a promise (the Stage 2 `held`/`release` pattern, under its own names because step 6 declares `held` and `release`): `let releasePost!: () => void; const postHeld = new Promise<void>((r) => (releasePost = r))`, and POST #2 does `await postHeld` before it continues. Later POSTs continue at once. Count note GETs with `let noteGets = 0; page.on("request", (r) => { if (r.method() === "GET" && /\/api\/notes\/\d+$/.test(new URL(r.url()).pathname)) noteGets++; })`. Use a listener rather than a route, so step 6's `**/api/notes/*` route does not shadow it.
4. Click Save. Expect `getByRole("alert")` toBeVisible, and expect `editor` toHaveValue(`Area is $a^2$`).
5. Double-click Save in one tick via `evaluate` (smoke.spec.ts:52-55). While POST #2 is held, expect `getByRole("alert")` toHaveCount(0): the alert clears when the retry starts, not when it succeeds. Then `releasePost()` and expect:
   - `toHaveURL(/\/notes\/\d+$/)`;
   - `posts` toBe(2);
   - `editor` toHaveAttribute("data-probe", "kept"). This proves there was no remount after the first save.
6. Hold the first PATCH on a promise, not a timer (the Stage 2 `held`/`release` pattern): `let release!: () => void; const held = new Promise<void>((r) => (release = r))`. Route `**/api/notes/*`: count PATCHes, make the first one `await held` before it continues, and continue later PATCHes at once. `editor.click()`, `keyboard.press("End")`, `keyboard.type(" and more")`. Set `responded = page.waitForResponse((r) => r.request().method() === "PATCH")`. Double-click `save` in one tick via `evaluate` (as in step 5; a programmatic `click()` leaves focus in the textarea). Type `!` while the PATCH is held, then `release()` and `await responded`. Expect:
   - `getByRole("status")` toHaveText("Unsaved changes"), because the `!` arrived after the snapshot;
   - `patches` toBe(1): the second click of the double click sent nothing;
   - the draft kept the late text. With `id = page.url().match(/\d+$/)![0]`, ``page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).body, `study.draft.note.${id}`)`` resolves to `"Area is $a^2$ and more!"`.

   Press `Control+s`. Then expect:
   - `getByRole("status")` toHaveText("Saved");
   - `editor` toBeFocused;
   - `patches` toBe(2);
   - `noteGets` toBe(0). This proves the editor did not refetch the note after the replace-navigate to `/notes/<id>`.
7. Delete the note behind the editor's back: `first = page.url()`, then ``request.delete(`/api/notes/${first.match(/\d+$/)![0]}`)`` returns status 204. `keyboard.type("?")` (the textarea still has focus) and press `Control+s`. Expect:
   - `getByRole("alert")` toHaveText("This note was deleted elsewhere — Save will create it again.");
   - `editor` toHaveValue(`Area is $a^2$ and more!?`);
   - `patches` toBe(3).

   Click Save. Then expect:
   - `page` not.toHaveURL(first), then `toHaveURL(/\/notes\/\d+$/)`;
   - `getByRole("alert")` toHaveCount(0);
   - `getByRole("status")` toHaveText("Saved");
   - `posts` toBe(3);
   - `editor` toHaveAttribute("data-probe", "kept"), and `noteGets` is still 0.
8. ``goto(`/notes?packageId=${PKG}&lessonId=${LESSON}`)``. `row = getByRole("link", { name: /Area is a\^2 and more/ })` is visible. Click it. Click `getByRole("button", { name: "Delete" })`, then `locator(".confirm").getByRole("button", { name: "Delete" })`. Then expect `toHaveURL(/\/notes$/)` and `getByText("No notes yet")` toBeVisible. This waits for the list to load: the re-created note was the only note stored at this point (step 7 deleted the first one through the API). Then expect `row` toHaveCount(0).

Test 2, "a draft survives leaving through the nav":
1. `goto("/notes/new")` and fill `Note` with `Draft that must survive`.
2. `nav = getByRole("navigation", { name: "Main" })`. Click `nav.getByRole("link", { name: "Library" })`, then expect heading `Library` (level 1).
3. Click `nav.getByRole("link", { name: "Notes" })`, then link `New note`. Expect `toHaveURL(/\/notes\/new$/)` and `nav.getByRole("link", { name: "Notes", exact: true })` toHaveAttribute("aria-current", "page"): the Notes NavLink has no `end`, so it stays current below `/notes`.
4. Expect `getByText(/Restore unsaved text from/)` to be visible. Click `Restore`, then expect `Note` toHaveValue(`Draft that must survive`).
5. A save that resolves after the editor is gone keeps the late text. Hold the next note POST: `let release!: () => void; const held = new Promise<void>((r) => (release = r))`, and route `**/api/notes` so a POST does `await held` and then continues, while every other method continues at once. Set `created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/notes")`.
6. Fill `Note` with `Late draft base` and click `getByRole("button", { name: "Save", exact: true })`. While the POST is held, `getByLabel("Note", { exact: true }).click()`, `keyboard.press("End")` and `keyboard.type(" tail")`. Click `nav.getByRole("link", { name: "Library" })` and expect heading `Library` (level 1). Then `release()` and `await created`. Then `await expect.poll(() => page.evaluate(() => localStorage.getItem("study.draft.note.new"))).toBeNull()`: only the settle removes the `new` key, so this waits for it before the `goto`.
7. `goto("/notes")`. Click `getByRole("link", { name: /Late draft base/ })`. Expect `getByText(/Restore unsaved text from/)` to be visible. Click `Restore`, then expect `Note` toHaveValue(`Late draft base tail`).
8. Delete the note so the serial tests stay isolated: click `getByRole("button", { name: "Delete" })`, then `locator(".confirm").getByRole("button", { name: "Delete" })`. Expect `toHaveURL(/\/notes$/)` and `getByText("No notes yet")` toBeVisible.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run web/test/rendering.test.tsx`. Expected: FAIL, because `../src/pages/Notes.js` cannot be resolved. Then run `npm run build -w web && npx playwright test -c e2e notes.spec.ts`. Expected: test 1 FAILS, timing out on `getByLabel("Attach to")` because `/notes/new` has no route; test 2 is skipped (serial mode).
- [ ] **Step 3: Implement `Notes`, `NotesListView`, `NoteEditor` and the routes.**
  - **Notes container.**
    - It shows `p.eyebrow` and `h1.page-title`.
    - It loads `Promise.allSettled([listNotes(), listPackages()])` once, under a session ref (Study.tsx:41-42, 62-76).
    - When the notes request fails, it shows the Library error block (Library.tsx:73-91) with its own copy. When only the packages request fails, it uses `packages = []`.
    - It reads `filter = parseListFilter(searchParams)`. `onFilterChange(f)` calls `navigate({ search: filterSearch(f) })`.
  - **NotesListView.**
    - It renders the `Show` select and, when `filter.kind === "package"`, the `Lesson` select.
    - `Show` option values are `all`, `standalone`, `pkg:<id>` and `orphaned`. The orphaned option appears only when the orphan count is > 0, and the select reads `orphaned` for both orphaned shapes.
    - `Lesson` option values are `""` (Whole package) and the lesson ids.
    - Then come the notice (only in `all`), the `New note` link (`/notes/new` plus the package/lesson filter as `?packageId&lessonId`) and the rows. Each row is `li > Link.notes-row` to `/notes/:id`, containing `span.lesson-row-text > (span.lesson-row-title {headline(body)}, span.lesson-row-sum {target label})` and `span.meta {formatDay(updatedAt)}`.
    - Target label: an orphaned note shows `` `Removed: ${packageId}${lessonId ? `/${lessonId}` : ""}` ``. Otherwise a null target shows `Standalone`, a package-level target shows `packageTitle ?? packageId`, and a lesson-level target shows `` `${pkg} › ${lessonTitle ?? lessonId}` ``.
  - **NoteEditor state and loading.**
    - State is `{ body, target }` fields, `saved`, `id`, `pending` and `error`, plus a synchronous `inFlight` ref (ActivityView.tsx:28-45). `target` (in both the fields and `saved`) is a plain `NoteTarget | null`. On load it is normalised from `note.target` to `note.target && { packageId: note.target.packageId, lessonId: note.target.lessonId }`, so the title keys never reach a request: `noteTargetSchema` is strict, and a `NoteTargetView` would be rejected with 400 "request body is not a valid note". The loaded `NoteTargetView` (with its titles) is kept separately, and is used only for display and for the library-failed `TargetPackage` fallback. `dirty` compares bodies directly and targets with `encodeTarget`.
    - A non-matching `noteId` (`!/^[1-9][0-9]*$/`) shows not-found without fetching.
    - It loads `getNote` (unless new) and `listPackages()` with `allSettled`, once per mount under a session ref. A 404 (`ApiError` code `not_found`) shows not-found.
    - When the library fails, it shows the library note and passes `TargetSelect` `currentOnly` with a `packages` list built from the target the editor opened with, not from the current field, so picking Standalone can be undone:
      - for a loaded note, one `TargetPackage` from its `NoteTargetView`: `title: packageTitle ?? packageId`, plus, for a lesson target, one lesson titled `lessonTitle ?? lessonId`;
      - on `/notes/new`, one `TargetPackage` from the decoded `?packageId&lessonId` prefill, with the ids as titles;
      - `[]` when that target is standalone.

      The select then offers only that target and Standalone, and never labels a target "(no longer in your library)" just because the library failed to load.
    - `/notes/new` prefills the target from `?packageId&lessonId`: `null` (standalone) when `packageId` is absent or empty, otherwise `` decodeTarget(`${packageId}/${lessonId ?? ""}`) `` (`lessonId` null when absent). A bare `/notes/new` therefore never sends an empty `packageId`, which `noteTargetSchema` rejects.
  - **NoteEditor save.**
    - `save()` runs on the Save button, or from `MarkdownEditor.onSave` when Save is enabled.
    - It returns early when `inFlight` is set. Otherwise it snapshots the fields, then sends POST, or a PATCH with only the changed `body` and/or `target`. `createNote` gets `{ body, target }`, and a PATCH `target` gets only `{ packageId, lessonId }` (or null). This includes the POST after a `not_found` PATCH, which re-creates the note with its loaded target. On success it sets `saved` to the snapshot.
    - The textarea stays editable while a save is pending: `MarkdownEditor`'s `disabled` is never tied to `pending`, and only the Save button is disabled.
    - After a create, it clears the `new` draft and replace-navigates as in Produces. Text typed during the request stays dirty and is written under the id key.
    - A `mounted` ref is set true by an effect and false by that effect's cleanup. A `latestBody` ref mirrors the body field: it is set when the note loads, on every edit and on Restore. When any save resolves, the draft is settled against `latestBody.current`, never against state captured in the save closure, whether the editor is mounted or not. If `latestBody.current === sent.body`, clear the draft for that id. Otherwise call `writeDraft` with `latestBody.current` under `draftKey("note", id)`. For a create, `id` is the new id, and the `new` key is always removed. Settling calls `clearDraft` and `writeDraft` on `browserDraftStore()` with explicit keys, because `useDraft`'s `write` and `clear` still point at the `new` key until the next render. After unmount the save neither navigates nor sets state, so a late response never pulls the user back into the editor. Text typed after Save and before a nav click is kept under the new id, and opening that note offers Restore.
    - On failure, it keeps the fields and shows the alert, which clears at the next attempt.
    - A PATCH that fails with `ApiError` code `not_found` and message `"unknown note"` keeps the text, sets `id = null` and shows the deleted-elsewhere alert. Any other PATCH failure, including a target 404 (`"unknown package"` / `"unknown lesson"` from an Attach-to list that went stale after the package was deleted or re-imported in another tab), keeps `id`, keeps every field and shows the normal `Your note wasn’t saved (${message(e)}).` alert.
  - **NoteEditor drafts, unload and delete.**
    - Drafts use `draftKey("note", id ?? "new")`. A draft is written on each edit while dirty. After a save (POST or PATCH, mounted or not) it is settled against the `latestBody` ref: cleared when it equals the sent body, and otherwise rewritten under the saved id's key (a create also removes the `new` key). It is also cleared on delete and on Discard.
    - Restore sets the body from the offer and then calls `dismiss()`.
    - A `beforeunload` listener is attached only while dirty.
    - Delete uses the inline `.confirm` (Library.tsx:188-203), then `deleteNote`, then `clear()`, then `navigate("/notes")`.
    - A delete that fails with `ApiError` code `not_found` counts as success (the note is already gone): `clear()`, then `navigate("/notes")`. Any other failure closes the confirm, keeps every field and the id, and shows the delete-failure alert.
    - Save is disabled when the body is blank, when it is over `BODY_MAX`, when nothing changed, or while pending.
  - **Exact copy** (Notes and NoteEditor):

```text
Notes page   eyebrow "In your own words" · h1 "Notes" · Link.btn.btn-primary "New note"
             select aria-label "Show": "All notes" | "Standalone" | <package titles> | `From removed content (${n})`
             select aria-label "Lesson": "Whole package" | <lesson titles>
             notice p.note `${plural(n, "note")} ${n === 1 ? "belongs" : "belong"} to content that’s no longer in your library.` + Link "Show them" → /notes?orphaned=1
             .empty: p.empty-title "No notes yet" + p.note "Write one here or from any lesson." | filtered: p.empty-title "Nothing here yet."
             load error: div.errors role=alert <strong>Your notes couldn’t be loaded.</strong> <p>{message}</p> + button "Try again"
NoteEditor   Link.back-link (Icon left) "Notes" → /notes · eyebrow "Note" · h1 "New note" | headline(saved.body)
             TargetSelect label "Attach to" · library failed: p.note "Couldn’t load your library — you can still edit the text."
             orphaned banner p.note "Its lesson is no longer in your library — attach it somewhere else, keep it standalone, or leave it for a re-import."
             MarkdownEditor label "Note" (packageId = target?.packageId) · button.btn.btn-primary "Save" · button.btn.btn-danger.push "Delete" (only with an id)
             p.meta role=status: "Saving…" (pending) | "Unsaved changes" (dirty) | "Saved" (has id) | "" (new, clean)
             p.errors role=alert `Your note wasn’t saved (${message(e)}).` | "This note was deleted elsewhere — Save will create it again." | `This note wasn’t deleted (${message(e)}).`
             span.confirm "Delete this note? This can’t be undone." + "Cancel" (btn-quiet) + "Delete" (btn-danger)
             draft offer: p.note `Restore unsaved text from ${new Date(at).toLocaleString()}?` + "Restore" + "Discard" (btn-quiet)
             not found: .empty > p.empty-title "This note doesn’t exist — it may have been deleted." + Link.btn "Back to notes" → /notes
             load error: p.errors role=alert `This note didn’t load (${message(e)}).` + Link "Back to notes"
             footer p.note "Notes live in data/study.db on this machine. Package exports don’t include them; npm run backup -w server does."
```

- [ ] **Step 4: Run tests and confirm they pass.** Run `npx vitest run web/test`, then `npm test`, `npm run typecheck` and `npm run e2e`. Expected: PASS, with `notes.spec.ts` (2), `play.spec.ts` and `smoke.spec.ts` green.
- [ ] **Step 5: Commit.**

```bash
git add web/src/pages/Notes.tsx web/src/pages/NoteEditor.tsx web/src/App.tsx web/test/rendering.test.tsx e2e/notes.spec.ts
git commit -m "feat: Notes page and note editor with drafts and a double-save guard"
```

---

### Task 10: Explain-back

**Files:**
- Create: `web/src/pages/ExplanationEditor.tsx`
- Modify: `web/src/pages/Notes.tsx`.
  - Add the `.segmented` `role="radiogroup"` `aria-label="Notes view"` switch, with radios `Notes` and `Explain-back`, bound to `?tab=explanations`. Switching tabs drops every filter parameter.
  - Add `ExplanationsListView`.
  - The container now loads `listExplanations()` in the same `allSettled`.
  - On the Explain-back tab, the container reads `revisitOnly = searchParams.get("revisit") === "1"` and passes `ExplanationsListView` these callbacks (the Notes tab keeps Task 9's `filterSearch(f)`):
    - `onFilterChange(f)` calls `navigate({ search: filterSearch(f, { tab: "explanations", ...(revisitOnly ? { revisit: "1" } : {}) }) })`;
    - `onRevisitChange(v)` calls `navigate({ search: filterSearch(filter, { tab: "explanations", ...(v ? { revisit: "1" } : {}) }) })`.
- Modify: `web/src/App.tsx`. Add `ExplanationRoute`, the same as `NoteRoute` but with `explanationId` and `<ExplanationEditor key={k} editorKey={k} />`. Add the routes `/notes/explain/new` and `/notes/explain/:explanationId`.
- Test: `web/test/rendering.test.tsx`, `e2e/notes.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 7: `listExplanations`, `getExplanation`, `createExplanation` and `updateExplanation`; `ListFilter`, `filterSearch` and `filterExplanations`; `draftKey("explanation", …)`, `useDraft`, `browserDraftStore`, `writeDraft` and `clearDraft`; `headline`, `message` and `plural`; `formatDay`.
  - From Task 8: `ConfidencePicker`, `ConfidenceChip`, `CONFIDENCE_LABEL`, `TargetSelect` (with `lessonsOnly`), `TargetPackage`, `MarkdownEditor` and `Markdown`.
  - From Task 1: `BODY_MAX`, `isLowConfidence`, `Confidence`, `Explanation` and `ExplanationPatch`.
  - From Task 9: the `NoteRoute` keying rule, the Notes container and its `parseListFilter` wiring.
- Produces:
  - `ExplanationsListView({ explanations, packages, filter, revisitOnly, onFilterChange, onRevisitChange }: { explanations: Explanation[]; packages: TargetPackage[]; filter: ListFilter; revisitOnly: boolean; onFilterChange: (f: ListFilter) => void; onRevisitChange: (v: boolean) => void })` (named export of Notes.tsx).
  - default `ExplanationEditor({ editorKey }: { editorKey: string })`.
  - The routes above.

- [ ] **Step 1: Write the failing tests.** Fixtures:
  - e1: `p/l1` (One), confidence 2, `revisit: true`, body `"Because retrieval…"`.
  - e2: `p/l2` (Two), confidence 4.
  - e3: orphaned `gone/x`, null titles, confidence 1.

```ts
it("ExplanationsListView flags revisits and hides removed content")    // all, revisitOnly false
  expect(html).toContain("One"); expect(html).toContain("Two"); expect(html.match(/>revisit</g)).toHaveLength(1);
  expect(html).toContain("conf-chip is-low"); expect(html).toContain('href="/notes/explain/1"');
  expect(html).toContain('href="/notes/explain/new"'); expect(html).toContain("Needs revisit");
  expect(html).toContain("1 explanation belongs to content that’s no longer in your library.");
  expect(html).toContain('href="/notes?tab=explanations&amp;orphaned=1"'); expect(html).not.toContain("gone/x");
  expect(html.match(/<input[^>]*checkbox[^>]*>/)![0]).not.toContain("checked");
it("ExplanationsListView narrows to revisit prompts")                   // revisitOnly true
  expect(html).toContain("One"); expect(html).not.toContain("Two");
  expect(html.match(/<input[^>]*checkbox[^>]*>/)![0]).toContain('checked=""');
it("ExplanationsListView shows the removed-content view")               // { kind: "orphaned" }
  expect(html).toContain("gone/x"); expect(html).not.toContain(">One<");
it("ExplanationsListView empty state")  [] → toContain("No explanations yet")
```

Add test 3 to `e2e/notes.spec.ts`, "explain-back saves once and edits the rating":
1. ``goto(`/notes/explain/new?packageId=${PKG}&lessonId=${LESSON}`)``, then ``expect(getByLabel("Lesson", { exact: true })).toHaveValue(`${PKG}/${LESSON}`)``.
2. Fill `getByLabel("Your explanation")` with `Testing yourself beats rereading because retrieval strengthens memory.` Expect button `Save` toBeDisabled, and `getByText("Rate your confidence to save.")` visible. Expect `getByRole("button", { name: "Save", exact: true })` toHaveAccessibleDescription("Rate your confidence to save."), so the hint is tied to Save.
3. `getByLabel("2 · Shaky").check()`. Expect the same Save button toHaveAccessibleDescription(""): nothing is missing, so there is no hint.
4. Route `**/api/explanations` to count POSTs with a 300 ms delay. Route `**/api/explanations/*` to count PATCHes.
5. Double-click Save in one tick. Then expect:
   - `toHaveURL(/\/notes\/explain\/\d+$/)`;
   - `getByRole("status")` toContainText("come back on Home");
   - `posts` toBe(1).
6. `getByLabel("3 · Getting there").check()` and click Save. Expect status toHaveText(`Saved. Rated 3 · Getting there.`) and `patches` toBe(1).
7. `goto("/notes?tab=explanations")`, then expect `getByRole("link", { name: /Testing yourself beats rereading/ })` to be visible.
8. ``getByLabel("Show", { exact: true }).selectOption(`pkg:${PKG}`)``. Expect ``toHaveURL(new RegExp(`/notes\\?tab=explanations&packageId=${PKG}$`))`` and the same link still visible: the filter change stayed on the Explain-back tab. Check `getByLabel("Needs revisit")`. Expect ``toHaveURL(new RegExp(`/notes\\?tab=explanations&revisit=1&packageId=${PKG}$`))``, then expect that link toHaveCount(0), because step 6 re-rated the explanation to 3, so it is no longer a revisit prompt.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run web/test/rendering.test.tsx`. Expected: FAIL, because `ExplanationsListView` is not exported. Then run `npm run build -w web && npx playwright test -c e2e notes.spec.ts`. Expected: test 3 FAILS waiting for `getByLabel("Lesson")`.
- [ ] **Step 3: Implement `ExplanationsListView`, `ExplanationEditor` and the routes.**
  - **List view.**
    - It renders the `Show` select (`All explanations`, packages, orphaned; option values `all`, `pkg:<id>` and `orphaned`, as in Task 9), the `Needs revisit` checkbox and the `Explain a lesson` link. The checkbox calls `onRevisitChange(checked)`, and the Show select calls `onFilterChange`. Both keep `tab=explanations`: the Show select keeps the current `revisit=1`, and unchecking the box removes it (see the container bullet under Files).
    - It runs `filterExplanations(…, revisitOnly)`.
    - The notice and the "Show them" link use `filterSearch({ kind: "orphaned" }, { tab: "explanations" })`.
    - Each row is a `Link.notes-row` to `/notes/explain/:id`. The title is ``lessonTitle ?? `${packageId}/${lessonId}` ``. After it come `ConfidenceChip`, a `span.chip` reading `revisit` when `e.revisit`, `span.meta` `` `explained ${formatDay(createdAt)}` `` and `lesson-row-sum` `headline(body)`.
  - **Editor state, saving and drafts** (as in Task 9, with these differences):
    - The fields are `{ body, confidence, target }`.
    - The draft holds the body only.
    - PATCH sends only the changed `body` and/or `confidence`.
    - A PATCH `not_found` switches to create mode with the row's lesson as the target.
  - **Create mode** (`/notes/explain/new?packageId&lessonId`).
    - It loads `listPackages()` and `listExplanations()`.
    - `TargetSelect` is in `lessonsOnly` mode. A prefill that is not a live lesson falls back to the placeholder and shows the note.
    - Save is disabled until a lesson, a non-blank body of at most `BODY_MAX` characters, and a confidence are all set. The first missing item sets the hint (`aria-describedby` on Save), checked in the order lesson, blank body, over cap, confidence.
    - After a POST it replace-navigates to `/notes/explain/:id` with `state: { editorKey }`. A POST or PATCH that resolves after the editor unmounted settles the draft as in Task 9, against the `latestBody` ref. If the latest body equals the sent body, the draft is cleared. Otherwise the latest body is written under `draftKey("explanation", id)`, where a create uses the new id. A create also removes the `new` key. The save neither navigates nor sets state.
  - **Edit mode** (`/notes/explain/:id`).
    - It loads `getExplanation(id)` and `listExplanations()`.
    - The lesson is fixed text. The page shows `Reread the lesson` (omitted when orphaned, with the banner shown instead) and `Explain it again`.
  - **Earlier explanations.** Both modes show `<details>` (closed). Its rows are the other explanations of the same lesson from `listExplanations()`, newest first. Each row shows `ConfidenceChip`, `formatDay(createdAt)` and `<Markdown packageId>` of the body. The section is hidden while no lesson is chosen, and when only `listExplanations()` failed.
  - **Load errors.**
    - In edit mode, a `getExplanation` failure other than a 404 shows the load-error copy below instead of the editor.
    - In the Notes container, each tab owns its own request. A rejected `listExplanations()` makes the Explain-back tab show the Library-style error block (Library.tsx:73-91) with the copy below, and its `Try again` reruns the container's load. It never falls back to `[]`, which would read as "No explanations yet". The Notes tab keeps working. Likewise, a rejected `listNotes()` now blocks only the Notes tab.
  - **Exact copy:**

```text
Notes tabs   segmented aria-label "Notes view": "Notes" | "Explain-back"
Explain tab  Link.btn.btn-primary "Explain a lesson" → /notes/explain/new · select "Show": "All explanations" | <packages> | `From removed content (${n})`
             label + checkbox "Needs revisit" · notice `${plural(n, "explanation")} ${n === 1 ? "belongs" : "belong"} to content that’s no longer in your library.` + "Show them"
             .empty: "No explanations yet" + p.note "Pick a lesson and explain it from memory." | filtered "Nothing here yet."
             load error: div.errors role=alert <strong>Your explanations couldn’t be loaded.</strong> <p>{message}</p> + button "Try again"
Editor       Link.back-link "Notes" → /notes?tab=explanations · eyebrow "Explain-back" · h1 "Explain a lesson" | lessonTitle ?? `${packageId}/${lessonId}`
             TargetSelect label "Lesson" (lessonsOnly) · stale prefill p.note "That lesson isn’t in your library anymore."
             prompt p.note "Explain it in your own words, as if to a friend — no peeking."
             MarkdownEditor label "Your explanation" · ConfidencePicker · button.btn.btn-primary "Save"
             hint p.note: "Pick a lesson to save." | "Write your explanation to save." | "Shorten it to 100,000 characters to save." | "Rate your confidence to save."
             p.meta role=status: "Saving…" | "Unsaved changes" | low: `Saved. Rated ${c} · ${CONFIDENCE_LABEL[c]} — it’ll come back on Home until you explain it with more confidence.`
                                 | else: `Saved. Rated ${c} · ${CONFIDENCE_LABEL[c]}.` | "" before the first save in this mount
             edit: Link "Reread the lesson" → /lesson/p/l · orphaned banner p.note "This lesson isn’t in your library anymore." · Link "Explain it again" → /notes/explain/new?packageId=p&lessonId=l
             <details><summary>`Earlier explanations (${n})`</summary>
             p.errors role=alert `Your explanation wasn’t saved (${message(e)}).` | "This explanation was removed elsewhere — Save will create it again."
             library failed (create): p.errors role=alert "Your library couldn’t be loaded, so there’s no lesson to pick." + button "Try again"
             not found: p.empty-title "This explanation doesn’t exist." + Link.btn "Back to explain-back" → /notes?tab=explanations
             load error (edit): p.errors role=alert `This explanation didn’t load (${message(e)}).` + Link "Back to explain-back" → /notes?tab=explanations
```

- [ ] **Step 4: Run tests and confirm they pass.** Run `npx vitest run web/test`, then `npm test`, `npm run typecheck` and `npm run e2e`. Expected: PASS, with all three notes tests, play and smoke green.
- [ ] **Step 5: Commit.**

```bash
git add web/src/pages/ExplanationEditor.tsx web/src/pages/Notes.tsx web/src/App.tsx web/test/rendering.test.tsx e2e/notes.spec.ts
git commit -m "feat: explain-back editor with confidence rating and the Explain-back tab"
```

---

### Task 11: Lesson companion

**Files:**
- Create: `web/src/components/LessonCompanion.tsx`
- Modify: `web/src/pages/Lesson.tsx`. Import the companion and render `<LessonCompanion packageId={packageId} lessonId={lessonId} />` right after the `.finish` div's closing `</div>` (Lesson.tsx:107 at HEAD), inside `.page`, outside both `.finish` and `.work`. Two Lesson.tsx changes stay out of this task:
  - The in-progress condition at :27 belongs to Task 6.
  - The back links at :41 and :59 move in Task 12, together with the `/library` route, so no commit links to a route that does not exist.
- Modify: `web/src/styles/components.css`. In the Notes section, add `.lesson-companion { margin-top: var(--s5); }`.
- Modify: `e2e/notes.spec.ts`. Change the entry points of tests 1 and 3.
- Test: `web/test/rendering.test.tsx`

**Interfaces:**
- Consumes: `filterSearch` (Task 7).
- Produces: default `LessonCompanion({ packageId, lessonId }: { packageId: string; lessonId: string })`. It is links only, with no fetch, inside `<nav className="actions lesson-companion" aria-label="After this lesson">`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("LessonCompanion links the lesson to explain-back, a new note and its notes")
  const html = render(<MemoryRouter><LessonCompanion packageId="p" lessonId="l" /></MemoryRouter>);
  expect(html).toContain('aria-label="After this lesson"');
  expect(html).toMatch(/href="\/notes\/explain\/new\?packageId=p&amp;lessonId=l"[^>]*>Explain it back</);
  expect(html).toMatch(/href="\/notes\/new\?packageId=p&amp;lessonId=l"[^>]*>Write a note</);
  expect(html).toMatch(/href="\/notes\?packageId=p&amp;lessonId=l"[^>]*>Your notes on this lesson</);
```

E2E entry points:
- Test 1, step 1: ``goto(`/lesson/${PKG}/${LESSON}`)``, click link `Write a note`, then `toHaveURL(/\/notes\/new\?packageId=learning-how-to-learn&lessonId=active-recall$/)`. Then the `Attach to` check.
- Test 1, step 8: ``goto(`/lesson/${PKG}/${LESSON}`)``, then click `Your notes on this lesson`. Only the way to the list changes; the rest of step 8, from the `row` locator to the post-delete checks, stays as written.
- Test 3, step 1: ``goto(`/lesson/${PKG}/${LESSON}`)``, click `Explain it back`, then `toHaveURL(/\/notes\/explain\/new\?packageId=learning-how-to-learn&lessonId=active-recall$/)`.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run web/test/rendering.test.tsx`. Expected: FAIL, because `LessonCompanion.js` cannot be resolved. Then run `npm run build -w web && npx playwright test -c e2e notes.spec.ts`. Expected: test 1 FAILS waiting for link `Write a note`; tests 2–3 are skipped (serial mode). Test 3 would fail on link `Explain it back` if it ran.
- [ ] **Step 3: Implement the companion.** Its three links:
  - `Link.btn` `Explain it back` → `/notes/explain/new` + query.
  - `Link.btn` `Write a note` → `/notes/new` + query.
  - `Link.link-btn` `Your notes on this lesson` → `/notes` + `filterSearch({ kind: "package", packageId, lessonId })`.

  The query is `?packageId=…&lessonId=…`. The names avoid every smoke locator substring ("Check", "Study", "Export", "Reveal", "Good"; smoke.spec.ts:50, 61, 69-77, 84), and the companion adds no alert inside `.finish` or `.work`.
- [ ] **Step 4: Run tests and confirm they pass.** Run `npx vitest run web/test`, then `npm test`, `npm run typecheck` and `npm run e2e`. Expected: PASS. `smoke.spec.ts` stays green unchanged.
- [ ] **Step 5: Commit.**

```bash
git add web/src/components/LessonCompanion.tsx web/src/pages/Lesson.tsx web/src/styles/components.css web/test/rendering.test.tsx e2e/notes.spec.ts
git commit -m "feat: link notes and explain-back from the end of each lesson"
```

---

### Task 12: Home at `/`, Library at `/library`

**Files:**
- Create: `web/src/pages/Home.tsx`
- Modify: `web/src/App.tsx`.
  - Route `/` → `<Home />`, replacing `<Route path="/" element={<Library />} />` (App.tsx:71).
  - Add `<Route path="/library" element={<Library />} />`.
  - Add a Home NavLink first: `to="/" end`, `<Icon name="home" />`, `<span className="nav-label">Home</span>`.
  - The Library NavLink (App.tsx:47-50, `to="/" end`) becomes `to="/library"` without `end`.
  - Beside the mount effect (App.tsx:31-33), add `document.addEventListener("visibilitychange", …)`. The listener calls `refreshDue()` when `document.visibilityState === "visible"` and is removed on cleanup. It must sit on `document`: test 4 dispatches a non-bubbling event there, so a `window` listener would miss it.
  - `refreshDue` (App.tsx:25-29) returns its promise, typed `() => Promise<void>`. It resolves after `setDue` and never rejects. The `DueContext` type (App.tsx:10-13) follows, with the default `refreshDue: () => Promise.resolve()`. The callers in Library.tsx and Study.tsx ignore the result and compile unchanged.
- Modify: `web/src/pages/Lesson.tsx` at HEAD :41 (`<Link to="/">Back to the library</Link>`) and HEAD :59 (`<Link className="back-link" to="/">`). Stage 2's `lessonExtras` and Task 11's import move them, so find them by the quoted code. Both become `to="/library"`.
- Modify: `web/src/pages/Study.tsx`.
  - At :232-234 the link keeps `to="/"` and its text becomes `Back home`.
  - The local `message` at :26 becomes `import { message } from "../text.js"`.
- Modify: Stage 2's `web/src/pages/Quiz.tsx` and `web/src/pages/Game.tsx`. Each not-found state's `Link` "Back to the library" goes from `to="/"` to `to="/library"`; only these links change. The "All quizzes" link in `Quiz.tsx` and the "All games" link in `Game.tsx` already go to `/quizzes` and `/games`. Stage 2's `Quizzes.tsx` and `Games.tsx` need no change: they link back only through "All packages" (to `/quizzes` or `/games`). The grep in Step 3 confirms that no other `to="/"` remains.
- Modify: `web/src/styles/layout.css`.
  - After Stage 2's `@media (max-width: 39.99rem)` block, add `@media (max-width: 59.99rem) { .rail { min-width: 0; } .nav { overflow-x: auto; scrollbar-width: none; } .nav-item { flex: none; } }`. This covers the whole top-bar range: six labelled items need more than 640 px. `.rail { min-width: 0 }` is needed because otherwise the shell's `1fr` column (layout.css:5) grows to the rail's min-content width, the page scrolls sideways and `.nav` never scrolls.
  - Inside the 39.99rem block (the `.nav-label` collapse), add `.nav-item { padding: var(--s2); }`.
- Modify: `web/src/styles/components.css`. Add a `/* ---- Home ---- */` section after Notes with `.home-figure { font-family: var(--font-display); font-size: var(--t-2xl); font-weight: 800; }`.
- Modify: `e2e/smoke.spec.ts:6` and `:82`: `page.goto("/")` → `page.goto("/library")`.
- Modify: `e2e/play.spec.ts`: every `page.goto("/")` → `page.goto("/library")`.
- Modify: `e2e/notes.spec.ts` (test 4).
- Test: `web/test/rendering.test.tsx`

**Interfaces:**
- Consumes:
  - `useDue()` (App.tsx:15), whose `refreshDue` this task changes from `() => void` to `() => Promise<void>` (see Files).
  - From Task 7: `listExplanations({ revisit: true })`, `lessonsInProgress` and `formatDay`; the existing `listPackages` and `PackageSummary` (api.ts:41, :4-7, with Stage 2's `quizzes` and `games`).
  - From Task 1: `Explanation`.
  - From Task 8: `ConfidenceChip` and the `home` icon.
  - From Task 7: `LessonSummary.updatedAt?: string`, which carries Task 6's server field ("last opened").
- Produces:
  - `HomeView({ today, due, dueLoading, packages, revisit, failed, onRetry }: { today: Date; due: number | null; dueLoading: boolean; packages: PackageSummary[] | null; revisit: Explanation[] | null; failed: boolean; onRetry: () => void })` (named export).
  - `DueContext`'s value becomes `{ due: number | null; refreshDue: () => Promise<void> }`.
  - default `Home()`.
  - The final route table: `/`, `/library`, `/lesson/:packageId/:lessonId`, `/study`, Stage 2's `/quizzes…` and `/games…`, `/notes`, `/notes/new`, `/notes/:noteId`, `/notes/explain/new`, `/notes/explain/:explanationId`.
  - Nav order: Home, Library, Study, Quizzes, Games, Notes.

- [ ] **Step 1: Write the failing tests.** `HomeView` renders inside `MemoryRouter` with `today = new Date(2026, 9, 22)`. The populated fixture has 7 in-progress lessons and 7 revisit rows (`p/l1`…`p/l7`, confidence 2). Every render passes `dueLoading: false` unless its comment says otherwise.

```ts
it("HomeView points an empty library at the Library")
  packages [] → toContain("Your library is empty"); toContain('href="/library"');
it("HomeView says when nothing is due and nothing needs revisiting")             // due 0, revisit []
  expect(html).toContain("Nothing due — cards come back as their intervals expire.");
  expect(html).toContain("Explain a lesson in your own words — anything you rate 1 or 2 comes back here.");
  expect(html).toContain('href="/notes/explain/new"'); expect(html).not.toContain("Start review");
it("HomeView shows the due figure, five lessons and five prompts with overflow") // due 4
  expect(html).toContain("<h1 class=\"page-title\">Today</h1>"); expect(html).toContain('<p class="home-figure">4</p>');
  expect(html).toContain("cards waiting"); expect(html).toMatch(/href="\/study"[^>]*>Start review</);
  expect(html.match(/class="lesson-row"/g)).toHaveLength(5); expect(html).toContain("+2 more in the Library");
  expect(html.match(/>Explain again</g)).toHaveLength(5);
  expect(html).toMatch(/href="\/notes\?tab=explanations&amp;revisit=1"[^>]*>\+2 more</);
  due 1 → toContain("card waiting");
it("HomeView links each prompt to explain again and reread")                   // revisit [p/l1]
  expect(html).toContain('href="/notes/explain/new?packageId=p&amp;lessonId=l1"'); expect(html).toContain('href="/lesson/p/l1"');
  expect(html).toContain("2 · Shaky");
it("HomeView keeps what loaded when a request failed")                         // failed, due null, packages null, revisit []
  expect(html).toContain('role="alert"'); expect(html).toContain("Some of today’s plan couldn’t be loaded.");
  expect(html).toContain(">Try again<"); expect(html).toContain("Couldn’t count your cards.");
  expect(html).toContain("Couldn’t load your lessons."); expect(html).toContain("Explain a lesson in your own words");
it("HomeView shows Loading… for the due count until it first settles")      // due null, dueLoading true, failed false, packages [], revisit []
  expect(html).toContain("Loading…"); expect(html).not.toContain("Couldn’t count your cards.");
```

Add test 4 to `e2e/notes.spec.ts`, "Home shows today’s plan and clears a revisit prompt". It uses `({ page, request })`.
1. `due = (await (await request.get("/api/review/due")).json()).cards.length`.
2. POST `/api/explanations` with `{ packageId: PKG, lessonId: LESSON, body: "Recall beats rereading, I think.", confidence: 2 }`, and expect status `201`.
3. Route `**/api/review/due` to count GETs. Then `goto("/")` and expect heading `Today` (level 1). With `nav = getByRole("navigation", { name: "Main" })`, expect `nav.getByRole("link", { name: "Home", exact: true })` toHaveAttribute("aria-current", "page") and `nav.getByRole("link", { name: "Library", exact: true })` not.toHaveAttribute("aria-current", "page").
4. Check the due figure:
   - when `due > 0`: `region "Cards due"` `.home-figure` toHaveText(String(due)), and `nav.locator(".due-badge")` toContainText(String(due));
   - otherwise: `region "Cards due"` toContainText("Nothing due").
5. Let `before = gets`. Run `page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))`, then `expect.poll(() => gets).toBeGreaterThan(before)`.
6. `revisit = getByRole("region", { name: "Revisit" })`; it toContainText("Active Recall"). Click `revisit.getByRole("listitem").filter({ hasText: "Active Recall" }).getByRole("link", { name: "Explain again" })`.
7. Expect `toHaveURL(/\/notes\/explain\/new\?packageId=learning-how-to-learn&lessonId=active-recall$/)`, `nav.getByRole("link", { name: "Notes", exact: true })` toHaveAttribute("aria-current", "page"), and the Home link not.toHaveAttribute("aria-current", "page"). Fill `Your explanation` with `Retrieval practice strengthens memory more than rereading.` Check `4 · Solid`, click Save, and expect status toHaveText(`Saved. Rated 4 · Solid.`).
8. Click nav link `Home`. Expect `revisit` toContainText("anything you rate 1 or 2 comes back here"). This waits for the Revisit section to load, and the empty copy is the only possible settled state, because test 3 re-rated its explanation to 3 and step 7 added a newer 4. Then expect `revisit` not.toContainText("Active Recall").
9. `await page.setViewportSize({ width: 640, height: 740 })`, `goto("/library")`, then expect `nav.getByRole("link", { name: "Notes", exact: true })` toBeAttached(). Then `expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640)`. At 640 px (40rem) the labels show again, so this is the narrowest labelled top bar: the six items scroll inside `.nav` and the page does not scroll sideways.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run web/test/rendering.test.tsx`. Expected: FAIL, because `../src/pages/Home.js` cannot be resolved. Then run `npm run build -w web && npx playwright test -c e2e notes.spec.ts`. Expected: test 4 FAILS, because there is no `Today` heading at `/`.
- [ ] **Step 3: Implement `Home`, `HomeView` and the route move.**
  - **Container.**
    - It holds `dueLoading`, which starts true. On mount, under the session ref, it runs `refreshDue().then(() => setDueLoading(false))`, so Home and the badge show one number and a count still in flight never reads as a failure.
    - `load()` runs `Promise.allSettled([listPackages(), listExplanations({ revisit: true })])` under a session ref. It sets each part from its own result (`null` when rejected), and sets `failed` when either request was rejected.
    - `onRetry` calls `load()` and `refreshDue()`.
  - **View structure.**
    - The eyebrow is `today.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })`, followed by `h1.page-title`.
    - There are three `section.sheet` elements, each with `aria-labelledby` pointing at its `h2` (`home-due`, `home-reading`, `home-revisit`).
  - **Continue reading rows.** Each row is `Link.lesson-row` → `/lesson/p/l`, containing `span.dot.dot-progress`, `span.lesson-row-text > span.lesson-row-title` and `span.meta` (the package title).
  - **Revisit rows.**
    - The list is `ul.notes-list`, showing the first 5 rows in server order.
    - Each row shows the title (`lessonTitle ?? lessonId`), `ConfidenceChip` and `span.meta` `` `explained ${formatDay(createdAt)}` ``.
    - Its actions are `Link.btn.btn-primary` `Explain again` → `/notes/explain/new?packageId=…&lessonId=…` and `Link.link-btn` `Reread` → `/lesson/p/l`.
  - **Null states.**
    - A null `packages` or `revisit` shows `Loading…` (`p.loading`) while `!failed`, and its failure line once `failed`.
    - A null `due` shows `Loading…` while `dueLoading`, and "Couldn’t count your cards." once the first count has settled. `failed` does not cover the due count, which App owns.
  - **Exact copy:**

```text
alert (failed)  div.errors role=alert "Some of today’s plan couldn’t be loaded." + button.btn "Try again"
Cards due       h2 "Cards due" · due > 0: p.home-figure {due} + p.note (due === 1 ? "card waiting" : "cards waiting") + Link.btn.btn-primary "Start review" → /study
                due 0: p.note "Nothing due — cards come back as their intervals expire." · null, settled: p.note "Couldn’t count your cards."
Continue        h2 "Continue reading" · empty library: .empty > p.empty-title "Your library is empty" + Link.btn "Open the Library" → /library
                none in progress: p.note "No lessons in progress — pick one from the Library." (Library → /library) · more: Link `+${more} more in the Library` → /library
                failed: p.note "Couldn’t load your lessons."
Revisit         h2 "Revisit" · more: Link `+${more} more` → /notes?tab=explanations&revisit=1
                empty: p.note "Explain a lesson in your own words — anything you rate 1 or 2 comes back here." + Link "Explain a lesson" → /notes/explain/new
                failed: p.note "Couldn’t load your revisit prompts."
```

  - **Link check.** Afterwards, `grep -rnE "to=[\"']/[\"']" web/src` prints exactly two lines: App.tsx's Home NavLink and Study.tsx's empty-state `<Link className="btn" to="/">`. That link's text sits on the next line (Study.tsx:233 at HEAD), so this grep cannot see it; Step 4 checks the copy.
- [ ] **Step 4: Run tests and confirm they pass.** Run `npx vitest run web/test`, then `npm test`, `npm run typecheck` and `npm run e2e`. Expected: PASS. smoke's one-shot 500 on `**/api/packages` now hits the Library at `/library`. play.spec starts at `/library`. Then run `grep -n 'goto("/")' e2e/smoke.spec.ts e2e/play.spec.ts`. Expected: no output. (notes.spec.ts test 4 opens Home with `goto("/")` on purpose, so this grep leaves it out; `grep -c 'goto("/")' e2e/notes.spec.ts` prints 1.) Then run `grep -c "Back home" web/src/pages/Study.tsx` and `grep -c "Back to library" web/src/pages/Study.tsx`. Expected: `1`, then `0`.
- [ ] **Step 5: Commit.**

```bash
git add web/src/pages/Home.tsx web/src/App.tsx web/src/pages/Lesson.tsx web/src/pages/Study.tsx web/src/pages/Quiz.tsx web/src/pages/Game.tsx web/src/styles/layout.css web/src/styles/components.css web/test/rendering.test.tsx e2e/smoke.spec.ts e2e/play.spec.ts e2e/notes.spec.ts
git commit -m "feat: Home dashboard at / and the Library at /library"
```

---

### Task 13: Leftover progress UI

**Files:**
- Create: `web/src/components/LeftoverProgress.tsx`
- Modify: `web/src/pages/Library.tsx`.
  - Delete the local `message` (:14) and `plural` (:16), and add `import { message, plural } from "../text.js"`.
  - Add `const [leftoverKey, setLeftoverKey] = useState(0)`. Bump it after a successful import (after `refreshDue()` at :48) and after a delete (after :63).
  - Render `<LeftoverProgress refreshKey={leftoverKey} />` after the `packages.map(…)` block (which closes at :206), inside `.stack`.
  - The confirm copy at :190 becomes `Delete it? Your progress and notes are kept.`
- Modify: `web/src/styles/components.css`. In the Notes section, add:
  - `.leftover-row` (`display: grid; gap: var(--s2); padding: var(--s4) var(--s5); border-top: 1px solid var(--rule)`);
  - `.leftover-name` (`font-weight: 600`);
  - `.leftover-counts` (`font-size: var(--t-sm); color: var(--ink-2)`);
  - `.leftover .confirm` (`flex-wrap: wrap; margin-left: 0`).
- Modify: `e2e/notes.spec.ts` (test 5).
- Test: `web/test/rendering.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 7: `getOrphans` and `purgeOrphans`; `describeCounts`, `purgeTotal`, `plural`, `message` and `filterSearch`. The existing `ApiError` (api.ts:22-26).
  - From Task 1: `OrphanGroup` and `OrphanCounts`.
  - From Task 5: the 409 `orphans_changed` contract.
- Produces:
  - default `LeftoverProgress({ refreshKey }: { refreshKey: number })`.
  - `LeftoverProgressView({ groups, confirming, includeWriting, pending, error, status, onAsk, onCancel, onToggleWriting, onPurge }: { groups: OrphanGroup[]; confirming: string | null; includeWriting: boolean; pending: boolean; error: string | null; status: string | null; onAsk: (packageId: string) => void; onCancel: () => void; onToggleWriting: (v: boolean) => void; onPurge: (group: OrphanGroup) => void })` (named export).

- [ ] **Step 1: Write the failing tests.** Fixture `g = { packageId: "gone", packageTitle: null, inLibrary: false, counts: { cardState: 3, reviewLog: 12, attempts: 2, lessonProgress: 1, notes: 2, explanations: 1 } }`. `box(html)` returns `html.match(/<input[^>]*checkbox[^>]*>/)?.[0]`, and `purgeBtn(html)` returns `html.match(/<button[^>]*>Delete for good<\/button>/)![0]`.

```ts
it("LeftoverProgressView renders nothing without groups or a status")
  expect(view({ groups: [] })).toBe(""); expect(view({ groups: [], status: "Removed 3 records." })).toContain("Removed 3 records.");
it("LeftoverProgressView lists a deleted package with its counts and reading links")
  expect(html).toContain("Leftover progress"); expect(html).toContain("gone"); expect(html).toContain("package deleted");
  expect(html).toContain("3 card schedules · 12 reviews · 2 results · 1 lesson mark · 2 notes · 1 explanation");
  expect(html).toMatch(/href="\/notes\?orphaned=1&amp;packageId=gone"[^>]*>Read the notes</);
  expect(html).toMatch(/href="\/notes\?tab=explanations&amp;orphaned=1&amp;packageId=gone"[^>]*>Read the explanations</);
  expect(html).toContain(">Clear…<"); expect(box(html)).toBeUndefined();
  { ...g, inLibrary: true, packageTitle: "Alpha" } → toContain("Alpha"), toContain("some lessons or cards were removed by an import")
it("LeftoverProgressView confirm spares writing until ticked")        // confirming "gone"
  includeWriting false: expect(html).toContain("Delete 18 records for good? Re-importing won’t bring them back.");
    expect(html).toContain("Also delete 2 notes and 1 explanation"); expect(box(html)).not.toContain("checked");
    expect(purgeBtn(html)).not.toContain("disabled");
  includeWriting true: expect(html).toContain("Delete 21 records for good?"); expect(box(html)).toContain('checked=""');
it("LeftoverProgressView hides the writing box when there is no writing")   // notes 0, explanations 0
  expect(box(html)).toBeUndefined();
it("LeftoverProgressView disables the purge when nothing would go, or while pending")
  writing-only counts, includeWriting false → expect(purgeBtn(html)).toContain('disabled=""');
  pending true → expect(purgeBtn(html)).toContain('disabled=""');
it("LeftoverProgressView reports errors and results")
  error "x" → toContain('role="alert"'); status "Removed 3 records." → toContain('role="status"');
```

Add test 5 to `e2e/notes.spec.ts`, "Leftover progress clears progress, spares writing, and a re-import restores it". It uses `({ page, request })` and `let zip: Buffer | null = null`, and runs inside `try { … } finally { … }`.
1. Through `request`, POST:
   - `/api/notes` with `{ body: "Leftover note survives", target: { packageId: PKG, lessonId: LESSON } }` → 201;
   - `/api/explanations` with `{ packageId: PKG, lessonId: LESSON, body: "Leftover explanation", confidence: 2 }` → 201;
   - `/api/lessons/${PKG}/${LESSON}/progress` with `{ status: "in-progress" }` → 200.
2. `goto("/library")`. Wait for the `download` event, click link `Export`, then `zip = readFileSync(await download.path())`.
3. Click `getByRole("button", { name: "Delete", exact: true })`, then `locator(".confirm").getByRole("button", { name: "Delete", exact: true })`.
4. `panel = locator(".leftover")`; it toContainText(PKG) and toContainText("package deleted").
5. Route `**/api/maintenance/orphans/purge`: count POSTs in `purges`, fulfil the first with `{ status: 409, json: { error: { code: "orphans_changed", message: "x" } } }`, and continue the rest. Click `panel.getByRole("button", { name: "Clear…" })`. Expect `panel.getByLabel(/Also delete/)` not.toBeChecked. Click `Delete for good`. Expect `panel.getByRole("alert")` toHaveText("That changed while you were looking — check the new counts and confirm again."), and `panel.getByRole("button", { name: "Delete for good" })` toBeEnabled: the confirm stayed open. Then double-click `Delete for good` in one tick via `evaluate` (smoke.spec.ts:52-55).
6. Expect `panel.getByRole("status")` toHaveText(/^Removed \d+ records?\.$/), `panel.getByRole("alert")` toHaveCount(0), `purges` toBe(2) (the fulfilled 409 plus exactly one real purge), and `panel.locator(".leftover-counts")` toHaveText(/^\d+ notes? · \d+ explanations?$/).
7. Run ``locator('input[type="file"]').setInputFiles({ name: `${PKG}.zip`, mimeType: "application/zip", buffer: zip })``. Expect heading `Learning How to Learn` visible and `panel` toHaveCount(0).
8. ``goto(`/notes?packageId=${PKG}&lessonId=${LESSON}`)``, then expect link `/Leftover note survives/` visible.
9. `finally`: if `zip` is set and `GET /api/packages` lists no `PKG`, run `request.post("/api/packages/import", { data: zip })`. smoke then passes in either file order.
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run web/test/rendering.test.tsx`. Expected: FAIL, because `LeftoverProgress.js` cannot be resolved. Then run `npm run build -w web && npx playwright test -c e2e notes.spec.ts`. Expected: test 5 FAILS waiting for `.leftover`. The `finally` block restores the sample.
- [ ] **Step 3: Implement `LeftoverProgress`, `LeftoverProgressView` and the Library changes.**
  - **View.**
    - It renders nothing when `groups` is empty and `status` is null.
    - Otherwise it renders a `section.sheet.leftover` with `h2` `Leftover progress`, the intro `p.note`, and one `div.leftover-row` per group. Group names are plain text, never headings, so smoke's heading locator stays unique.
    - Each row holds `p.leftover-name` (`packageTitle ?? packageId`), a `p.meta` status line, `p.leftover-counts` (`describeCounts`), the reading links (each only when its count is > 0, hrefs built with `filterSearch(…, { tab: "explanations" })` for the second) and `button.btn.btn-danger` `Clear…`.
    - The row whose `packageId === confirming` replaces `Clear…` with the confirm.
  - **Container.**
    - It calls `getOrphans()` on mount and on every `refreshKey` change, ignoring load errors as App.tsx:28 does. A `refreshKey` change also clears `status` and `error`, so a re-import can hide the panel.
    - Each `getOrphans()` call bumps a `session` ref and applies its result only if the ref is unchanged (the Study.tsx:41-42 pattern). This covers every refetch: after a `refreshKey` change, after a purge and after a 409. A delete followed at once by a re-import therefore never leaves a stale "package deleted" group on screen.
    - `onAsk` opens the confirm with `includeWriting = false`.
    - `onPurge` is guarded by a synchronous `inFlight` ref plus `pending`, clears `error` at the start of each attempt, and sends `{ packageId, includeWriting, expected: group.counts }`.
      - Success: it closes the confirm, sets `` `Removed ${plural(sum(purged), "record")}.` `` and refetches.
      - `ApiError` code `orphans_changed`: it refetches, keeps the confirm open and shows the changed alert.
      - Any other error: it shows `message(e)`.
  - **Exact copy:**

```text
h2 "Leftover progress" · p.note "Progress from content that’s no longer in your library. It’s hidden everywhere else and comes back if you re-import the same lessons and cards."
p.meta: !inLibrary "package deleted" | else "some lessons or cards were removed by an import"
links: Link.link-btn "Read the notes" → /notes?orphaned=1&packageId=<id> · Link.link-btn "Read the explanations" → /notes?tab=explanations&orphaned=1&packageId=<id>
confirm span.confirm: `Delete ${plural(purgeTotal(counts, includeWriting), "record")} for good? Re-importing won’t bring them back.`
         label + checkbox (only when notes + explanations > 0): `Also delete ${[notes && plural(notes, "note"), explanations && plural(explanations, "explanation")].filter(Boolean).join(" and ")}`
         button.btn.btn-quiet "Cancel" · button.btn.btn-danger "Delete for good" (disabled when the total is 0 or pending)
p.errors role=alert "That changed while you were looking — check the new counts and confirm again." · p.meta role=status `Removed ${plural(n, "record")}.`
```

- [ ] **Step 4: Run tests and confirm they pass.** Run `npx vitest run web/test`, then `npm test`, `npm run typecheck` and `npm run e2e`. Expected: PASS. All five notes tests pass, and smoke still sees `All caught up — 4 reviewed` and `Mark lesson complete`.
- [ ] **Step 5: Commit.**

```bash
git add web/src/components/LeftoverProgress.tsx web/src/pages/Library.tsx web/src/styles/components.css web/test/rendering.test.tsx e2e/notes.spec.ts
git commit -m "feat: Leftover progress cleanup on the Library page"
```

---

### Task 14: Docs: the spec and README record Stage 3

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-study-app-design.md`. Stage 2 Task 26 first edits the status line, §2.4, §2.5, §2.6, §5 and §8, so every spec line below is a HEAD cite that has shifted; find each place by its quoted text.
  - The status line (spec:4).
  - §3's content-table list (spec:237-239, "**Content tables** — replaced wholesale on re-import").
  - §3's last paragraph (spec:252-253, "If a re-import drops an item…").
  - §4's Explain-back and Home bullets (spec:273-277).
  - §5's notes and explanations lines (spec:289-290), Stage 2's "`GET /packages` also lists…" and "Errors:" lines, and the Pages line (spec:295-296).
  - §6's re-import bullet (spec:305-306).
  - §8 item 3 (spec:324-325).
- Modify: `README.md`. Stage 2 Task 26 rewrote the status (README.md:3-7) and the Tests line and added an `## API` section after Packages, so find each place by its text:
  - the status lines Stage 2 wrote (they say Stages 1–2 are complete);
  - the delete note (README.md:28-29 at HEAD, "Deleting a package keeps your progress;");
  - Stage 2's `## API` list;
  - the Tests line (README.md:40 at HEAD), which Stage 2 left as `npm run e2e     # Playwright smoke + play specs (builds web first)`.

**Interfaces:**
- Consumes: the routes and rules of Tasks 1–13.
- Produces: none (docs only).

- [ ] **Step 1: Write the failing check.**
```bash
grep -c "maintenance/orphans/purge" docs/superpowers/specs/2026-08-03-study-app-design.md README.md
grep -c "Stages 1–3" docs/superpowers/specs/2026-08-03-study-app-design.md README.md
grep -c -e "(purge only)" -e "smoke + play + notes specs" docs/superpowers/specs/2026-08-03-study-app-design.md README.md
grep -c -e "at most 100 000 characters" -e "carries \`updatedAt\`" -e "\`games\`, \`assets\`" docs/superpowers/specs/2026-08-03-study-app-design.md
```
- [ ] **Step 2: Run it and confirm it fails.** Expected: every count is `0`.
- [ ] **Step 3: Write the amendments.**
  - **Status line:** `**Status:** Approved; Stages 1–3 implemented`.
  - **§8 item 3:** mark it done the same way Stage 2 marked item 2.
  - **§5:** the `GET /lessons/:packageId/:lessonId` drift is already fixed by Stage 2. Do not touch it.
  - **§3 content tables:** end the list at spec:237-239 with `` `quizzes`, `games`, `assets` (the package's media files). `` instead of `` `quizzes`, `games`. ``, so the spec names the same six content tables as `CONTENT_TABLES` (Task 2).
  - **§3:** replace spec:252-253 with:

```markdown
Content removed by a re-import or a package delete leaves **orphaned** user state. A row
is live while what it points at exists:
- `card_state`, `review_log`: the flashcard item, and for direction `back` an item with `reverse: true`;
- `attempts`: the item (`exercise`), or the quiz / game named by `ref_id` (`quiz`, `game`);
- `lesson_progress`, `explanations`: the lesson;
- `notes`: nothing (standalone), the package (package note) or the lesson (lesson note).

Orphaned rows are kept but **hidden**: the app leaves them out of every default view
(the Notes and Explain-back lists, the due queue and badge, lesson status, Home, attempt
history). `GET /notes` and `GET /explanations` still return them, each flagged
`orphaned: true`; the app shows them only in the Notes page's "From removed content"
views or by id, and Library → **Leftover progress** counts them. They are live again
when the same ids are re-imported. They are never deleted silently: Leftover progress
purges one package's orphaned rows after a confirm, and deletes notes and explanations
only when "Also delete …" is ticked (it starts unticked).
```

  - **§4:** replace the Explain-back and Home bullets with:

```markdown
- **Explain-back** — pick a lesson, explain it in your own words in Markdown, and rate
  your confidence 1–5 (1 Lost, 2 Shaky, 3 Getting there, 4 Solid, 5 Could teach it; no
  default). A lesson in the library has one **revisit** prompt while its latest
  explanation (highest id) is rated 2 or lower. Explaining it again at 3+, raising the
  latest rating to 3+, or a Leftover progress purge that deletes it clears it; a newer
  low explanation replaces it. Rereading,
  completing the lesson or time passing does not. There is no dismiss.
- **Home screen** (`/`) — cards due (the nav badge's number, new cards included), up to 5
  lessons in progress ordered by when you last opened them, and up to 5 revisit prompts,
  lowest confidence first: one glance says what to work on.
```

  - **§5 routes:** replace the notes and explanations lines with:

```markdown
- `GET /notes` (every note, each with an `orphaned` flag), `POST /notes`,
  `GET/PATCH/DELETE /notes/:id`; bodies are Markdown, non-blank, at most 100 000 characters
- `GET /explanations` (every explanation, each with an `orphaned` flag; `?revisit=1`:
  revisit prompts only), `POST /explanations`, `GET/PATCH /explanations/:id` (no delete;
  see §3 for the purge); bodies are Markdown, non-blank, at most 100 000 characters
- `GET /maintenance/orphans`, `POST /maintenance/orphans/purge` (`packageId`,
  `includeWriting`, and the `expected` counts the user confirmed; a mismatch returns 409
  `orphans_changed` and deletes nothing)
```

  - **§5 packages line:** extend Stage 2's `` - `GET /packages` also lists each package's quizzes and games with `runs` and `best` `` with `` ; each lesson carries `updatedAt` (last opened) once started ``.
  - **§5 Errors line:** delete Stage 2's `- Errors: …` line, and put this line after the new `GET /maintenance/orphans` line, so it ends the route list:

```markdown
- Errors: 400 `invalid_request`, 404 `not_found`, 409 `orphans_changed` (purge only),
  422 `not_checkable` / `invalid_package`; a rejected request writes nothing.
```

  - **§5 Pages line** (Stage 2 does not edit it): annotate the existing entries: **Home** (`/`), **Library** (`/library`: packages → lessons, plus Leftover progress) and **Notes** (`/notes`, with explain-back at `/notes/explain/…`). Keep **Lesson**, **Study**, **Quiz** and **Games** as they are.
  - **§6 re-import bullet:** append "; purgeable from Library → Leftover progress".
  - **README.**
    - Status lines (the paragraph Stage 2 wrote, saying Stages 1–2 are complete and Stage 3 is next): "Stages 1–3 are complete: lessons with inline exercises, spaced-repetition flashcards, quizzes and games, notes and explain-back, and a Home dashboard at `/` (the Library is at `/library`)."
    - Replace the delete note (README.md:28-29 at HEAD, "Deleting a package keeps your progress; re-importing a package updates content in place.") with: "Deleting a package keeps your progress, notes and explanations, hidden until you re-import it; Library → Leftover progress deletes them for good. Re-importing a package updates content in place. Notes and explanations are never part of a package export; `npm run backup -w server` includes them."
    - Add the Stage 3 routes to Stage 2's API list.
    - The Tests line, as Stage 2 left it (`npm run e2e     # Playwright smoke + play specs (builds web first)`), becomes `npm run e2e     # Playwright smoke + play + notes specs (builds web first)`.
- [ ] **Step 4: Run the check and the full gates.** Run the four `grep -c` lines again. Expected: each file shows ≥ 1. Then run `npm test && npm run typecheck && npm run e2e && npm run validate:content -- content/web-app-reference content/matching-and-recommendation`. Expected: all green, with 0 content errors.
- [ ] **Step 5: Commit.**

```bash
git add docs/superpowers/specs/2026-08-03-study-app-design.md README.md
git commit -m "docs: record Stage 3 notes, explain-back, Home and orphan rules"
```

---

## Post-plan checklist

- [ ] The gates pass on the final commit:
  - `npm test`
  - `npm run typecheck` (web tests included)
  - `npm run e2e`, run twice, with `notes.spec.ts` (5), `play.spec.ts` (13) and `smoke.spec.ts` (2) all green each time (20 passed); `ls "$(node -p 'require("os").tmpdir()')" | grep -c '^study-e2e-'` prints the same number before and after (Stage 2's teardown removes each run's dir)
  - `npm run validate:content -- content/web-app-reference content/matching-and-recommendation`, with 0 errors
- [ ] These greps print nothing:
  - `grep -n 'goto("/")' e2e/smoke.spec.ts e2e/play.spec.ts`
  - `grep -rn "VISIBLE_ATTEMPT" server/src`
  - `grep -n "as any" server/src/orphans.ts server/src/routes/notes.ts server/src/routes/explanations.ts server/src/routes/maintenance.ts`
- [ ] `grep -rnE "to=[\"']/[\"']" web/src` prints only App.tsx's Home NavLink and Study.tsx's empty-state link, and `grep -c "Back home" web/src/pages/Study.tsx` prints 1.
- [ ] The Stage 2 guard `web/test/serverChecking.test.ts` is still green: no Stage 3 web file references `checkAnswer`, `scoreQuiz`, `scoreGame` or `checkGameMove`.
- [ ] Manual check at 375 px and at 640 px width:
  - the six nav icons fit or scroll sideways with labels hidden;
  - at 640 px the six labelled nav items scroll sideways inside the top bar, and the page has no horizontal scroll;
  - accessible names read "Home", "Study 4 cards due" and so on;
  - the editor's Write/Preview toggle and the five confidence options wrap inside the 16 px gutters.
- [ ] Still open after Stage 3, outside this plan:
  - `DELETE /api/packages/:id` returns 204 for an unknown id (server/src/routes/packages.ts:58-61);
  - adm-zip `getData()` sits outside the try (server/src/zip.ts:25, :81);
  - server Vitest temp dirs leak (server/test/helpers.ts:7 and others).
- [ ] Deferred by decision: revisit Dismiss, note search or pagination, and a "download my notes as Markdown" export.


## Self-review

The writing-plans self-review was run over the whole plan, Tasks 1–14, after the three drafted parts were joined:
- **Spec coverage.** Each spec item maps to a task:
  - the `notes` and `explanations` tables (spec:248-250) → Task 2;
  - kept-but-hidden, purgeable orphaned state (spec:252-253, spec:305-306) → Tasks 2, 5, 6 and 13;
  - the Notes editor with package, lesson or standalone notes (spec:272) → Tasks 8 and 9;
  - explain-back with self-rated confidence and revisit prompts (spec:273-275) → Tasks 4, 8 and 10;
  - the Home screen (spec:276-277) → Tasks 6, 7 and 12;
  - `GET/POST/PATCH/DELETE /notes` and `GET/POST/PATCH /explanations` (spec:289-290) → Tasks 3 and 4;
  - the Home and Notes pages (spec:295-296) → Tasks 9, 10 and 12;
  - content-only export, which the round-trip test keeps (spec:230) → Task 6;
  - §8 Stage 3 (spec:324-325) and every amendment under Decisions → Task 14.
- **Step scan.** No step says "TBD", "handle edge cases", "add appropriate validation" or "write tests for the above". Every test step names its assertions with exact values, every run step gives its command and the output that means pass or fail, and every commit step shows `git add` and `git commit`. Every task ends with `npm test` and `npm run typecheck`, and Tasks 6–14 also run `npm run e2e`. The Stage 2 hedges are gone: `parseQuery` is called synchronously, `PLAY_FILES` replaces `WITH_QUIZ`, `web/test/api.test.ts` is extended rather than created, the layout fallback covers everything below 60rem, and the padding change stays inside the `39.99rem` block, and only `Quiz.tsx` and `Game.tsx` change their "Back to the library" links.
- **Type consistency.** Each name has one signature, in its producing task's Interfaces block, and every Consumes line matches it:
  - shared (Task 1): the note, explanation and purge schemas, `Confidence`, `Note`, `Explanation`, `OrphanCounts`, `OrphanGroup` and `purgedKinds`;
  - server: `LIVE`, `orphanReport`, `countOrphans`, `purgeOrphans` and the test fixtures (Task 2); the `{ notes }`, `{ note }`, `{ explanations }`, `{ explanation }`, `{ packages }` and `{ purged }` wrappers (Tasks 3–5); `revisitSql` (Task 4); the widened `apiError` (Task 5); `updatedAt` on lesson summaries (Task 6);
  - web (Tasks 7–13): `json(body, method)`, `listExplanations(opts)`, `formatDay`, `useDraft`, `ListFilter` and `filterSearch` (extra keys first), `TargetPackage`, `TargetSelect` (with `lessonsOnly` and `currentOnly`), `MarkdownEditor`, `NoteEditor` and `ExplanationEditor` with `editorKey`, and the `NotesListView`, `ExplanationsListView`, `HomeView` and `LeftoverProgressView` props.
- **Review Focus.** There are exactly five lines, and each names the tasks whose steps hold its pinning test. Two pins were added while joining the parts. Task 9's test 1 now checks that Save is disabled for a blank body and for 100 001 characters, that the long body is kept whole, and that typing during an in-flight PATCH leaves "Unsaved changes". Task 12's test 4 now checks `aria-current` on Home at `/` and on Notes at `/notes/explain/new`. Review fixes added more: Task 6's smoke test 2 pins the Lesson.tsx in-progress write behind "last opened"; Task 9's test 1 also checks that the textarea survives Preview, that no note GET follows the first save, and that a note deleted elsewhere is re-created; Tasks 9 and 12 wait for a settled list or section before asserting that something is gone. A later review added: Task 9's test 1 checks that text typed during a save stays in the localStorage draft, and its test 2 checks `aria-current` on Notes at `/notes/new`; Task 10's test 3 ties the confidence hint to Save with `toHaveAccessibleDescription`, and changes the Show select and the Needs revisit box on the Explain-back tab to prove the URL keeps `tab=explanations`; Task 12 greps `Study.tsx` for the `Back home` copy. A further review added: Task 9's test 1 holds its first PATCH on a promise and sends it with a same-tick double click, and its test 2 restores text typed while a POST was held and the editor was left through the nav; Task 12's test 4 checks that the page does not scroll sideways at 640 px; Task 13's test 5 checks the purge's 409 alert and its double-click guard. The convergence pass added: Task 9's test 1 holds its retry POST on a promise and checks that the alert is gone before that POST resolves.
- **File Structure.** It lists exactly the files that the tasks' Files blocks and `git add` lines touch, with the tasks that touch each one.
- **Proportion.** No component or route body is written out. Code blocks hold only test assertions, the DDL, the `LIVE` and `revisitSql` fragments, the `headline` marker regex, exact UI copy and spec text.
