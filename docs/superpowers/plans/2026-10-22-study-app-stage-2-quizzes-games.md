# Study App — Stage 2 (Quizzes + games) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quiz runner with history and the three game templates (Matching, Timed round, Order it). Every verdict and every stored score is computed on the server. The Stage 1 follow-ups in the code these features touch are fixed along the way.

**Architecture:** Pure quiz and game logic goes in new `shared/` modules beside `checkAnswer`, and the request contracts go in `shared/src/requests.ts`. The pure logic is game-source resolution, dealing with an injected random, per-move checks and scoring. The server adds quiz and game read routes and a stateless per-move game check. The single `POST /api/attempts` now also stores one summary `attempts` row per quiz run or game play, with no migration, and `GET /api/attempts` reads those rows back with orphans hidden. The web app splits `ActivityView` into exported parts and deals game rounds on the client. It adds Quizzes, Quiz, Games and Game pages that use answer keys only to render and always take verdicts from server responses.

**Tech Stack:** (package-lock.json resolutions; package.json ranges in parentheses) Node ≥ 20 (`engines`, added in Task 1) · TypeScript 5.9.3 (`^5.6.0`; strict, `noUncheckedIndexedAccess`, `moduleResolution: Bundler`) · Zod 3.25.76 (`^3.23.0`) · Hono 4.13.0 (`^4.6.0`) + @hono/node-server 1.19.17 · better-sqlite3 11.10.0 (`^11.3.0`, WAL) · adm-zip 0.5.18 · tsx 4.23.5 · Vitest 2.1.9 (`^2.1.0`, node environment) · Vite 6.4.3 (`^6.0.0`) · React 18.3.1 · react-router-dom 7.18.2 (`BrowserRouter`) · react-markdown 9.1.0 + remark-math 6.0.0 + rehype-katex 7.0.1 + KaTeX 0.16.47 · @playwright/test 1.62.1 (`^1.48.0`; e2e only, `page.clock`).

**Spec:** `docs/superpowers/specs/2026-08-03-study-app-design.md` (the plan argues from the spec; executors read both). Stage 2 implements §4 Quizzes and Games (spec:267-271), §5 `POST /attempts` + `GET /attempts` (spec:288), the Quiz and Games pages (spec:295-296) and §8 stage 2 (spec:323).

## Global Constraints

- The spec wins on any conflict. Task 26 writes this plan's decisions back into the spec.
- The server listens on `127.0.0.1:4321` (`server/src/index.ts:21-24`; `PORT` overrides the port). Data lives under `STUDY_DATA_DIR` (`server/src/db.ts:46`), and every e2e run gets a fresh temp dir.
- IDs (package, lesson, item, quiz, game, option, step) match `/^[a-z0-9][a-z0-9_-]*$/i` with at most 64 characters (`idSchema`, `shared/src/ids.ts:3-7`). Every id field in a new request schema uses `idSchema`.
- Every Zod object schema is `.strict()`, so unknown keys are rejected. Deliberate extensions go in `meta`. Stage 2 adds no field to the package format.
- The error shape is always `{ error: { code, message, details? } }`. Codes: 400 `invalid_request` (it replaces every `bad_request`), 404 `not_found`, 422 `not_checkable` / `invalid_package`, 500 `internal`.
- Every JSON POST (`/api/attempts`, lesson progress, `/api/review/grade`, `/api/games/:p/:g/check`) runs its checks in this order: body via `parseJsonBody` (Task 10) → 400, lookup → 404, domain throw → 422, then a single write (the check writes none). A rejected request writes nothing.
- All verdicts and recorded scores are computed on the server by `shared/` functions (`checkAnswer`, `scoreQuiz`, `checkGameMove`, `scoreGame`). The client never imports a checker; `web/test/serverChecking.test.ts` (Task 21) enforces this.
- Content tables and user-state tables never mix (`server/src/schema.sql:44`). Stage 2 adds no table and no column, so there is no migration. A quiz run or a game play is one `attempts` row (`kind` `'quiz'`|`'game'`, `ref_id` = quiz/game id, `item_id` NULL; `schema.sql:64-74`). Orphaned rows are hidden on read and never deleted.
- No new runtime dependency. Task 1 only declares `zod` `^3.23.0` in `server/package.json`, because the server already imports it (`server/src/zip.ts:7`). Do not add jsdom or @testing-library.
- Use ESM with explicit `.js` import paths. Shared exports go only through the barrel `shared/src/index.ts`. Tests import `../src/index.js`, with `import type` on its own line.
- Every new exported function in `shared/` and `server/` gets a Google-style JSDoc (summary, `Args:`, `Returns:`, `Raises:`) like `shared/src/lessonBody.ts:18-31`.
- TDD for every task: write the failing test, run it and see the expected failure, implement, run it green, then commit.
- Web unit tests stay node-only (`renderToStaticMarkup` plus pure helpers; `vitest.config.ts:3-5` sets no environment). Behaviour that needs clicks is a Playwright test in `e2e/play.spec.ts`. `e2e/smoke.spec.ts` must pass unchanged.
- Never add a flashcard to `server/sample/`. Smoke expects `All caught up — 4 reviewed` (`e2e/smoke.spec.ts:78`).
- UI copy uses typographic punctuation (’ — · …) exactly as the tasks give it, because e2e locators match it. Quiz and game titles and descriptions render as plain text.
- Commit steps use conventional subjects (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Each shows the exact `git add <paths>` and `git commit -m "<subject>"`. No AI-attribution lines: no `Co-Authored-By`, no "Generated with".
- Verification, run from the repo root: `npm test`, `npm run typecheck`, `npm run e2e`, `npm run validate:content -- content/web-app-reference content/matching-and-recommendation`. Each task runs the ones its steps name. All four pass before the stage is done. If port 4321 is taken (by another checkout, or a dev server left running), run `PORT=<free port> npm run e2e`: the config reads `PORT` (`e2e/playwright.config.ts:6`) and never reuses a running server (:15).
- Line cites (`file:line`) refer to HEAD `645ee63`. In a file that an earlier task of this plan has already edited, a cite marks the code to look for: find it by its content, not by its line number.

## Review Focus

1. **Double submits, expiry and late responses:** same-tick double clicks on Submit quiz, Submit anyway, Submit again, a game Check or a tile; the clock expiring while a submit or check is in flight; a check still in flight when Play again starts a new round; StrictMode double effects (`web/src/main.tsx:10`). Expected: exactly one `POST /api/attempts` per run and at most one check in flight. `onExpire` fires once per start and submits without the unanswered-confirm; once a payload is frozen, expiry neither sends it again nor changes it. Forms stay locked through a failed submit, and Submit again (a game's Try again) resends the frozen payload unchanged. A check that resolves after the game ended, or after Play again, is dropped: it shows no verdict, adds nothing to any play, and neither locks nor unlocks the new board. Pinned in `e2e/play.spec.ts` with POST-only counters and the `e2e/smoke.spec.ts:28-58` pattern: Task 23 ("quiz: a failed submit locks the answers and one retry logs one run", "quiz: expiry submits once, without the unanswered prompt", "quiz: expiry during an in-flight submit logs one run", and "quiz: a submit held across expiry is sent once and resent unchanged", which also double-clicks Submit quiz and Submit anyway), Task 24 ("timed round: expiry submits once and drops a late check, even after Play again": the save fails first, the late check resolves, Try again resends a payload with `answers: []`, and a second check held past Play again lands while the new board's own check is out, which leaves that board locked and verdict-free; "order it: a retried check clears the error, a double click sends one check, and the score is logged") and Task 25 ("matching: one miss on three pairs scores 75%", a same-tick double tile click). `useClock`'s once-per-start rule is pinned by Task 21's `expiryDue` test. StrictMode itself is checked by hand in Task 24 Step 4, because the e2e runs a production build.
2. **Rejected requests write nothing.** 400 `invalid_request`: malformed JSON, JSON `null`, unknown keys, non-string ids or ids over 64 characters, answer text over 200 characters. 404 `not_found`: an unknown package, quiz, game or item, or a `'back'` grade on a card without `reverse`. 422 `not_checkable`: answers that do not cover `quizItemIds` exactly, a deal size other than `min(roundSize, units)`, a pick on an undealt or already-matched left, a right outside the pool's rights ∪ distractors, an answer for an undealt item or a second answer to one item, an unknown option id, a hazardous stored regex. In every case `COUNT(*)` of attempts, card_state, review_log and lesson_progress stays unchanged, and the legacy exercise body still returns a `CheckResult`. Pinned in Tasks 10, 11, 14, 15 (including a planted hazardous regex) and 16.
3. **Unanswered and partial quiz answers:** an untouched scrambled ordering, a matching question with a left unchosen, a fill-blank with every blank empty, a whitespace-only short answer. Each is sent as `null`, scores 0, still returns `expected`, and never reaches `checkAnswer`, which throws on incomplete ordering or matching answers (`shared/src/checking.ts:108-114, 123-129`). One filled blank, MS `partialCredit` and ordering fractions all count into the mean. 3 of 4 against `passThreshold` 0.75 passes. No threshold gives `passed: null` and `correct` NULL. A score of 0.7467 reads `74% · Not passed`. Pinned in Tasks 7, 15, 20, 21 and 23.
4. **Game pools and deals.** Tag sources match any tag, in items.json order. itemIds sources keep the listed order and drop duplicate, missing and incompatible ids. The deal size is `min(roundSize, units)`: sample game-speed deals both of its questions, game-match all 3 pairs, g-small 2 of 3. A repeated left keeps the first pair. Repeated right texts become separate index-keyed tiles, judged by text. A distractor equal to a dealt right is never dealt. `dealGame` and `scoreGame` agree on the round size, so a genuine play is never rejected; import refuses a quiz over 200 items, a `roundSize` over 200 and matching text over 2000 characters, so no genuine run or play exceeds a request cap. Matching scores `matched / (dealt + mistakes)` and never reads 0% after a cleared board. Pinned in Tasks 4, 6 (the import caps), 8, 9, 19 (the sample round sizes) and 25.
5. **Lesson exercises are unchanged after the ActivityView split.** Each keeps one Check button with today's enable rules (fill-blank and ordering always enabled), Enter-to-check only when `onSubmit` is passed, a Try again that keeps the draft, its own radio group (`web/test/rendering.test.tsx:48-67`), hints only in lessons, and the smoke selectors (`.work`, `Check`, `✓ Correct`, `.work [role=alert]`). Quiz mode renders no Check button, Enter submits nothing, and no hints show. An ordering never starts solved, and focus stays on the step that moved. Pinned in Task 4 (`scramble`), Task 20 (rendering tests, including "AnswerForm keeps today's Check enable rules on an empty form", and `answerRules` tests; the e2e tests "ordering keeps focus on the moved step and Try again keeps the order" and "a lesson short answer checks on Enter"; smoke green unchanged) and Task 23 (`QuizQuestion` renders no Check and no hints; Enter in the quiz e2e test submits nothing).

## Decisions this plan makes

These are the adopted defaults for the design's open questions. Change any of them here, before execution starts.

1. A matching or order-it game with no `settings.timeLimitSeconds` shows a stopwatch, not a countdown. Time is recorded and shown, but not scored (`GAME_DEFAULTS`, Task 4; `useClock`/`Clock`, Task 21; Game page, Task 24).
2. A matching board deals up to 2 of the dealt items' authored distractors (`MAX_MATCH_DISTRACTORS = 2`, Tasks 4 and 8).
3. A multi-select item in a timed round keeps its own `partialCredit` (`scoreGame`, Task 9).
4. Leaving a quiz mid-run triggers a `beforeunload` prompt only. In-app navigation abandons the run and logs nothing. There is no localStorage resume (Task 23, pinned by the e2e test "quiz: leaving a run asks first, and abandoning it in the app logs nothing").
5. Quiz and game payloads send full items, as lessons already do. All verdicts and all stored scores come from the server, and the guard test `web/test/serverChecking.test.ts` enforces this (Task 21).

Spec amendments written by Task 26:
- Status: Stages 1–2 implemented.
- §2.4: a short-answer `match: "regex"` pattern is at most 200 characters, uses no backreferences, and may not have nested repetition: a group followed by `*`, `+` or `{n,}` (lazy forms included) may not contain `*`, `+`, `{n,}`, `{n,m}` with m > 1, or an alternation, and a group followed by `{n}` with n > 1 or `{n,m}` with m > 1 may not contain `*`, `+` or `{n,}`; typed answers are capped at 200 characters; a matching item's pair texts and distractors are at most 2000 characters; lesson frontmatter `activities` may not list an item twice, while repeated `::activity` directives stay allowed.
- §2.5: quiz `shuffle` defaults to false; a quiz may not list the same item twice and lists at most 200 items; the score is the mean item score, with unanswered items counting 0; a run passes when score ≥ `passThreshold`; expiry submits automatically; each run is one `attempts` row of kind `quiz`.
- §2.6: the `GAME_DEFAULTS` table; `roundSize` units for each template, at most 200; a `tags` source takes items carrying any listed tag, in items.json order, and an `itemIds` source keeps its listed order; pairs are pooled and the first left wins; up to 2 distractors; one round per play; the scoring formulas; time is not scored; each play is one `attempts` row of kind `game`, with its stored time capped at the game's limit when it has one.
- §5: the real lesson routes (`/lessons/:packageId/:lessonId`); `POST /review/grade` with `direction: "back"` on a card without `reverse: true` returns 404 and writes nothing; `GET /quizzes/:packageId/:quizId`, `GET /games/:packageId/:gameId` and `POST /games/:packageId/:gameId/check`; the `POST /attempts` body variants and the `GET /attempts` filters; `GET /packages` carries each package's quiz and game summaries with `runs`/`best`; one Errors line (400 `invalid_request`, 404 `not_found`, 422 `not_checkable`/`invalid_package`; a rejected request writes nothing).
- §8: Stage 2 done.

## File Structure

**shared/**
- `shared/src/regexSafety.ts`: Create (T2). Holds `MAX_PATTERN_LENGTH = 200` and `regexHazard(pattern)`, the single-pass ReDoS scanner.
- `shared/src/items.ts`: Modify (T2, T3). The short-answer `superRefine` (:119-132) adds the `regexHazard` issue at `['accept', i]` once a pattern compiles. Exports `CheckableItem`.
- `shared/src/checking.ts`: Modify (T2, T3). Adds `MAX_ANSWER_TEXT = 200` on short-answer text and fill-blank values in `answerSchema` (:8-9). The regex branch (:100) throws `unsafe regular expression`. Adds `expectedAnswer(item)`, used by every branch.
- `shared/src/random.ts`: Create (T4). Holds `shuffle` (Fisher–Yates, injected random) and `scramble` (never returns the identity for length ≥ 2).
- `shared/src/games.ts`: Create (T4), extended in T8 and T9. Holds `GAME_COMPAT`, moved from `validatePackage.ts:25-29`, plus game settings, source resolution, pair pooling, round size, `dealGame`, `checkGameMove` and `scoreGame`.
- `shared/src/validatePackage.ts`: Modify (T4–T6). Uses the shared `GAME_COMPAT`/`resolveGameItems` for the zero-compatible check and keeps its missing-id loop and both messages (:88-98). Adds the duplicate frontmatter `activities` error (next to :51-53) and the duplicate quiz-item error (next to :77-81) in T5, and in T6 the size errors that keep content within the request caps (a quiz over 200 items, a `roundSize` over 200, matching text over 2000 characters).
- `shared/src/requests.ts`: Create (T6). Holds `MAX_ELAPSED_SECONDS = 86400`, `MAX_PLAY_ITEMS = 200`, `MAX_MATCH_TEXT = 2000`, every request schema (progress, grade, quiz submission, game move/play/submission, `attemptBodySchema`, `attemptsQuerySchema`), their `z.infer` types, and the `AttemptRecord` response type.
- `shared/src/quiz.ts`: Create (T7). Holds `quizItemIds`, `isPassing`, `QuizItemResult`, `QuizResult` and `scoreQuiz`.
- `shared/src/index.ts`: Modify (T2–T4, T6–T9). The barrel re-exports every new name.
- `shared/test/regexSafety.test.ts`: Create (T2). The safe/unsafe pattern table.
- `shared/test/items.test.ts`: Modify (T2). A hazardous regex is rejected at `accept.0`, and a non-compiling one still fails.
- `shared/test/checking.test.ts`: Modify (T2, T3). Answer caps, the unsafe stored regex, `expectedAnswer` parity, and the Stage 1 gaps: MS partial credit, short-answer exact mode, matching distractors.
- `shared/test/random.test.ts`: Create (T4). Permutation and never-identity properties.
- `shared/test/games.test.ts`: Create (T4), extended in T8 and T9. Resolution, settings, pairs, deals, move checks and scoring.
- `shared/test/validatePackage.test.ts`: Modify (T4–T6). Tag-sourced games, compatibility errors, a flashcard in a quiz, the duplicate-reference rules (T5), the size caps (T6).
- `shared/test/requests.test.ts`: Create (T6). Union parsing, strictness, the size and time caps, query coercion and the `refId` needs `kind` rule.
- `shared/test/quiz.test.ts`: Create (T7). Mean scoring, null answers, pass threshold, exact cover, time clamp.

**server/**
- `server/package.json`: Modify (T1). Declares `zod` `^3.23.0`.
- `server/src/http.ts`: Create (T10). Holds `apiError`, `parseJsonBody` and `parseQuery`; a failure returns `{ ok: false; response: Response }`.
- `server/src/content.ts`: Create (T12). Typed content readers `getItem`, `getPackageItems`, `getQuiz`, `getGame` (SQL-filtered to `GAME_COMPAT` types, then `resolveGameItems`), `listQuizzes` and `listGames`.
- `server/src/attemptLog.ts`: Create (T15), extended in T16–T18. Holds the run-record types, the three inserts, `AttemptRow`, `toAttemptRecord`, the module-private `VISIBLE_ATTEMPT` orphan filter, `listAttempts` and `attemptStats`.
- `server/src/schema.sql`: Modify (T15). Appends the `attempts_history` index on `attempts(package_id, kind, ref_id)` and rewrites the `answer` column comment (:70).
- `server/src/app.ts`: Modify (T13). Mounts `quizRoutes()` at `/api/quizzes` and `gameRoutes()` at `/api/games`, after :23.
- `server/src/routes/quizzes.ts`: Create (T13). `GET /:packageId/:quizId` returns `{ quiz, items }`.
- `server/src/routes/games.ts`: Create (T13), extended in T14. `GET /:packageId/:gameId` returns `{ game, settings, items }`; T14 adds the stateless `POST /:packageId/:gameId/check`, which writes nothing.
- `server/src/routes/attempts.ts`: Modify (T10, T15–T17). T10 adds `parseJsonBody` and a typed item row (:21). T15 adds the quiz branch over a local union of the exercise and quiz schemas; T16 swaps in `attemptBodySchema` and adds the game branch; T17 adds `GET /`.
- `server/src/routes/lessons.ts`: Modify (T10). The progress body is parsed by `progressRequestSchema` before the lesson lookup (:36-41), and its 400 becomes `invalid_request`. Typed rows replace the `as any` casts at :13, :20 and :25.
- `server/src/routes/review.ts`: Modify (T11). The grade body is parsed by `gradeRequestSchema` (replaces :70-73). A `'back'` grade on a card without `reverse` returns 404 and writes nothing. The free-study 400 becomes `invalid_request` (:64). Typed rows replace the casts at :22 and :81.
- `server/src/routes/packages.ts`: Modify (T18). Adds `quizzes` and `games` summaries, with `runs` and `best`, to each package (response at :29-32). Typed rows replace the casts at :16 and :25.
- `server/sample/items.json`: Modify (T19). Adds the multi-select `ms-techniques` (tags `['memory']`, `partialCredit`). Still 3 flashcards.
- `server/sample/games.json`: Modify (T19). Adds `game-order` (order-it, itemIds `['ord-study-loop']`).
- `server/test/helpers.ts`: Modify (T12). Adds `PLAY_FILES`, which spreads `GOOD_FILES` without mutating it and adds quizzes, games, and matching and ordering items.
- `server/test/api.lessons.test.ts`: Modify (T10). Malformed, `null` and invalid progress bodies return 400 and write no row.
- `server/test/api.review.test.ts`: Modify (T11). Covers grade body hardening, the non-reverse `'back'` 404, and free-study `invalid_request`.
- `server/test/content.test.ts`: Create (T12). Covers the content readers and their order.
- `server/test/api.play.test.ts`: Create (T13), extended in T14–T17. Covers the quiz and game reads, move checks, submissions and history.
- `server/test/db.test.ts`: Modify (T15). A legacy DB gains `attempts_history`, and reopening is idempotent.
- `server/test/api.packages.test.ts`: Modify (T18). Covers the quiz and game summaries plus `runs`/`best`.
- `server/test/seed.test.ts`: Modify (T19). Checks the sample counts, the game pools and the sample round sizes (game-speed 2, game-match 3).

**web/**
- `web/tsconfig.json`: Modify (T1). `include` becomes `["src", "test"]` (:4).
- `web/src/pages/Lesson.tsx`: Modify (T5). Exports the pure `lessonExtras` (declared after `Lesson()`), which de-duplicates the frontmatter extras (`extra`, :50-51), so the `key={id}` at :80-81 cannot repeat.
- `web/src/components/answerRules.ts`: Create (T20). Pure draft rules that return `Answer | null` for each form.
- `web/src/components/ActivityView.tsx`: Modify (T20). Exports `Task`, `TYPE_LABEL`, `ItemPrompt`, `Verdict` and `AnswerForm`, with optional `onSubmit`/`onChange`. The shared `shuffle`/`scramble` replace the local `shuffled` (:229-236). Text inputs get `maxLength`. A moved ordering step keeps focus. The default `ActivityView` keeps its DOM.
- `web/src/api.ts`: Modify (T21). Adds the quiz and game summary and payload types, `PackageSummary.quizzes/games`, `getQuiz`, `getGame`, `checkMove` (not `checkGameMove`, which the guard bans), `submitQuiz`, `submitGame`, `listAttempts` and `isStale`.
- `web/src/format.ts`: Create (T21), extended in T22. Holds `formatClock`, `remainingSeconds` and `percent` (floored); T22 adds `TEMPLATE_LABEL`.
- `web/src/useClock.ts`: Create (T21). A wall-clock hook that ticks every 250 ms and fires `onExpire` once per start, decided by the pure `expiryDue`.
- `web/src/components/Clock.tsx`: Create (T21). Renders `p.clock` with `role="timer"`, a countdown or a stopwatch.
- `web/src/components/Icon.tsx`: Modify (T22). `PATHS` (:3-17) gains `quiz` and `game`.
- `web/src/App.tsx`: Modify (T22–T24). Quizzes and Games NavLinks go after Study, and every nav label sits in `span.nav-label` (:46-61). T22 adds the `/quizzes` and `/games` routes next to :70-74; T23 adds `QuizRoute` and T24 `GameRoute`.
- `web/src/pages/Library.tsx`: Modify (T22). Adds `Quizzes · n` and `Games · n` link buttons in the sheet foot, before Export (:183-187).
- `web/src/pages/Quizzes.tsx`: Create (T22). The quiz list page, with the named export `QuizList` and a `?package=` filter.
- `web/src/pages/Games.tsx`: Create (T22). The game list page, with the named export `GameList` and a `?package=` filter.
- `web/src/components/History.tsx`: Create (T22). An `ol.history` of past runs: date, percent, pass chip, m:ss, time's up.
- `web/src/styles/layout.css`: Modify (T22). `.nav-label` becomes sr-only below 40rem.
- `web/src/styles/components.css`: Modify (T22–T25). T22 lets `.sheet-foot` (:192-198) wrap and adds a `/* ---- Play lists ---- */` section (history, pass/fail chips); T23 adds a `/* ---- Quiz ---- */` section (`.quiz-bar`, `.clock`, `.play-summary`); T24 adds a `/* ---- Games ---- */` section (`.game-bar`), and T25 adds the board and tiles to it.
- `web/src/styles/math.css`: Modify (T25). `.tile-text` joins the inline KaTeX sizing selector (:21).
- `web/src/quizRun.ts`: Create (T23). Holds `quizOrder`, `answeredCount`, `buildQuizSubmission` and `quizSummary`.
- `web/src/components/QuizQuestion.tsx`: Create (T23). One always-mounted quiz question: prompt, a draft-only `AnswerForm`, and a `Verdict` after submit.
- `web/src/components/PlaySummary.tsx`: Create (T23). The focused `h2.play-summary` result line, reused by the game summary (T24).
- `web/src/pages/Quiz.tsx`: Create (T23). The quiz runner: intro → running → done, with the timer, unanswered-confirm, submit guard, retry and `beforeunload`.
- `web/src/pages/Game.tsx`: Create (T24), extended in T25. The game runner: intro → playing → done, with the client deal, the check guard, the `ended` ref, finish/submit, Play again and the named `GameResultSummary`; T25 mounts `MatchingBoard` for a matching deal.
- `web/src/components/ItemRun.tsx`: Create (T24). The timed-round and order-it player: one item at a time, server-checked.
- `web/src/components/MatchingBoard.tsx`: Create (T25). Two tile columns, one pick per side, server-checked pairs, misses counted.
- `web/test/rendering.test.tsx`: Modify (T1, T20–T25). T1 types the fixture (:50-56) as `Item`. Later tasks add the `AnswerForm`/`ItemPrompt`/`Verdict` (T20), `Clock` (T21), list/`History` (T22), `QuizQuestion` (T23), game summary/`ItemRun` (T24) and `MatchingBoard` (T25) cases.
- `web/test/lesson.test.ts`: Create (T5). `lessonExtras` lists each frontmatter extra once and skips the ones the body embeds.
- `web/test/answerRules.test.ts`: Create (T20). The null-until-answered rule for each form.
- `web/test/format.test.ts`: Create (T21). Clock formatting, remaining time, floored percent.
- `web/test/useClock.test.ts`: Create (T21). `expiryDue` fires once per start, at the limit, and never for a stopwatch.
- `web/test/api.test.ts`: Create (T21). `isStale` is true only for `not_found` and `not_checkable`.
- `web/test/serverChecking.test.ts`: Create (T21). Fails if `web/src` references `checkAnswer`, `scoreQuiz`, `scoreGame` or `checkGameMove`.
- `web/test/quizRun.test.ts`: Create (T23). Quiz order, answered count, nulls sent in `quizItemIds` order, elapsed time clamped to `[0, MAX_ELAPSED_SECONDS]` and the limit, the summary line.

**e2e/**
- `e2e/playwright.config.ts`: Modify (T1). `STUDY_E2E_DATA_DIR ??= mkdtempSync(...)` replaces the per-load temp dir (:16) and feeds `webServer.env.STUDY_DATA_DIR`. Adds `workers: 1` and `globalTeardown: './global-teardown.ts'`.
- `e2e/global-teardown.ts`: Create (T1). Removes `STUDY_E2E_DATA_DIR` with `rmSync(..., { recursive: true, force: true })`.
- `e2e/play.spec.ts`: Create (T20), extended in T22–T25. Thirteen tests on the seeded sample, each written in the task that owns the code it pins: the ordering focus test and the lesson Enter-to-check test (T20, both open the lesson by URL); the entry points, failed quiz and game list loads and the phone-width nav (T22); the failed-submit quiz with Retake, the quiz expiry, the expiry during an in-flight submit, the submit held across expiry, leaving a run, and a missing or changed quiz (T23); the timed-round expiry with its late checks, the order-it check retry and double click, and a missing or changed game (T24); matching with one miss (T25). The Library-driven tests start at `/` and click "Quizzes · 1" or "Games · 3". History counts are `historyRows(before, n)`, where `before` comes from `runs()`, which reads `GET /api/attempts` at the start of a test, and the count is capped at the page's 20 rows (T23), so the tests do not depend on each other's runs. T25 Step 4 and the Post-plan checklist run the full suite twice, with smoke, as the stage's e2e gate.

**Root and docs**
- `package.json`: Modify (T1). Adds `"engines": { "node": ">=20" }`.
- `package-lock.json`: Modify (T1). Regenerated by `npm install` after the server declares `zod`.
- `docs/superpowers/specs/2026-08-03-study-app-design.md`: Modify (T26). Writes the spec amendments listed above.
- `content/README.md`: Modify (T26). Adds a "Quizzes and games" section (defaults, scoring, expiry, distractors, first-left-wins, the no-duplicate rules, the size caps, the regex rules, the 200-character cap) and the math-table row "quiz and game title, description — none" (table at :103-108).
- `README.md`: Modify (T26). Updates the stage status and adds the API list of the routes that exist after Stage 2.

Not touched: `server/src/exporter.ts`, `server/src/zip.ts`, `server/src/index.ts`, `e2e/smoke.spec.ts`. Boundaries: `shared/` is pure (no I/O, with clock and random injected); `server/` is the only writer of SQLite; `web/` talks only to `/api/*`.

---

### Task 1: Repo hygiene (engines, zod, e2e temp dir, typechecked web tests)

**Files:**
- Modify: `package.json` (add `"engines": { "node": ">=20" }` after `"workspaces"` at :5; there is no engines field today, :1-17)
- Modify: `server/package.json` (add `"zod": "^3.23.0"` to `dependencies` (:10-24), after `unist-util-visit` at :23; the server already imports zod at `server/src/zip.ts:7`)
- Modify: `package-lock.json` (regenerated by `npm install`; zod 3.25.76 is already hoisted at :5248-5249)
- Modify: `e2e/playwright.config.ts` (replace the per-load `mkdtempSync` at :16; add `workers` and `globalTeardown` to the config at :8-18)
- Create: `e2e/global-teardown.ts`
- Modify: `web/tsconfig.json` (`include` at :4 becomes `["src", "test"]`)
- Modify: `web/test/rendering.test.tsx` (type the fixture at :50-56 as `Item` instead of `as const`)
- Test: `npm run typecheck`, `npm run e2e`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - env var `STUDY_E2E_DATA_DIR`. The Playwright runner sets it once, and worker processes inherit it, so every config load reuses one directory. `e2e/global-teardown.ts` removes that directory.
  - `workers: 1`, so spec files run one at a time against the one server and DB. `e2e/play.spec.ts` (Tasks 20 and 22–25) relies on this.
  - `npm run typecheck` now checks `web/test/**`, which Tasks 20–25 add to.

- [ ] **Step 1: Expose the two failures**
  - In `web/tsconfig.json:4`, set `"include": ["src", "test"]`.
  - Record the leak baseline: `ls "$(node -p 'require("os").tmpdir()')" | grep -c '^study-e2e-'` prints N.

- [ ] **Step 2: Confirm they fail**
  - `npm run typecheck` → FAIL at `web/test/rendering.test.tsx:59` and `:60` (TS2322, elaborated as TS4104), once for each `<ActivityView item={item} />`. The `as const` fixture's `readonly [...]` options tuple cannot be assigned to `Item`'s mutable `options` array.
  - `npm run e2e` → `1 passed`. Running the count command again prints M > N, because the run leaked a `study-e2e-*` directory.

- [ ] **Step 3: Implement**
  - `rendering.test.tsx:50-56`: write `const item: Item = { … }` with the same literal and no `as const`. Add `import type { Item } from "@study/shared";` on its own line.
  - Make the `package.json` and `server/package.json` edits, then run `npm install`. The lockfile changes as follows, with no resolved version changing:
    - the root entry gains `engines`;
    - the `server` workspace entry (:5267-5288) gains `zod`.
  - `e2e/playwright.config.ts`:
    - add `workers: 1` and `globalTeardown: "./global-teardown.ts"`;
    - set `webServer.env.STUDY_DATA_DIR` to `dataDir`, defined as:
```ts
// Workers re-evaluate this file. They inherit the runner's env, so ??= makes every load share the runner's dir.
const dataDir = (process.env.STUDY_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), "study-e2e-")));
```
  - `e2e/global-teardown.ts`: `export default function globalTeardown(): void`. When `STUDY_E2E_DATA_DIR` is set, it calls `rmSync(dir, { recursive: true, force: true })`. Add a comment saying it may run while the webServer still has the SQLite file open, which is safe because unlinking an open file is safe on POSIX (darwin is the target).

- [ ] **Step 4: Verify**
  - `npm run typecheck` → exit 0.
  - `npm test` → all pass.
  - `npm ls zod` → `zod@3.25.76` under both `@study/server` and `@study/shared`.
  - `npm run e2e` twice → `1 passed` both times. The count command prints M after each run, so no new directory is left behind.

- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json server/package.json e2e/playwright.config.ts e2e/global-teardown.ts web/tsconfig.json web/test/rendering.test.tsx
git commit -m "chore: declare node engines and zod, clean up e2e temp dirs, typecheck web tests"
```

---

### Task 2: Regex hazard guard and answer-length caps

**Files:**
- Create: `shared/src/regexSafety.ts`
- Modify: `shared/src/items.ts` (the short-answer `superRefine` at :119-132 runs `regexHazard` once a pattern compiles)
- Modify: `shared/src/checking.ts` (`MAX_ANSWER_TEXT` above `answerSchema` at :5; cap fill-blank values at :8 and short-answer `text` at :9; guard the regex branch at :100)
- Modify: `shared/src/index.ts` (add the regexSafety exports; add `MAX_ANSWER_TEXT` to the checking export at :28)
- Test: `shared/test/regexSafety.test.ts` (create), `shared/test/items.test.ts`, `shared/test/checking.test.ts`

**Interfaces:**
- Consumes: `itemSchema` (`shared/src/items.ts:170`), `answerSchema` (`shared/src/checking.ts:5`), `checkAnswer(item: Item, input: Answer): CheckResult` (:36).
- Produces:
  - `MAX_PATTERN_LENGTH = 200`.
  - `regexHazard(pattern: string): string | null`. It returns `null` for a safe pattern, and otherwise exactly one of:
    - `"pattern is longer than 200 characters"`
    - `"backreferences are not allowed"`
    - NESTED: `"a repeated group may not contain another repeat or an alternation — list alternatives as separate accept entries or use a character class"`
  - `MAX_ANSWER_TEXT = 200`. In `answerSchema`, short-answer `text` and fill-blank `answers` values become `z.string().max(MAX_ANSWER_TEXT)`. `attemptRequestSchema` and every Task 6 schema that embeds `answerSchema` inherit the cap. Task 20 puts it as `maxLength` on the inputs.
  - `checkAnswer` throws `"unsafe regular expression"` when any stored regex accept pattern is hazardous. Tasks 10 and 15 map the throw to 422.

- [ ] **Step 1: Write the failing tests**

`shared/test/regexSafety.test.ts` (new). The last SAFE entry and the last two UNSAFE entries go beyond the decision table. They pin two behaviours:
- the `(?<=` and `(?:` prefixes are skipped, not read as quantifiers;
- `{1,2}` counts as a repeat.
```ts
const NESTED = "a repeated group may not contain another repeat or an alternation — list alternatives as separate accept entries or use a character class";
const SAFE = ["^\\d{4}$", "^colou?r$", "^(the )?mitochondri(a|on)$", "(ab)+", "(\\d{1,3}\\.){3}",
  "^[a-z]+(-[a-z]+)?$", "[(a+)+]", "\\(a+\\)+", "(?<=a)b+"];
const UNSAFE = ["(a+)+$", "(a*)*", "(a|aa)+", "(\\w+\\s?)+", "((a)+)+", "(.*a){20}", "(a+){2,5}", "(?:a|b)*", "(a{1,2})+"];
it.each(SAFE)("accepts %s", (p) => expect(regexHazard(p)).toBeNull());
it.each(UNSAFE)("rejects nested repetition in %s", (p) => expect(regexHazard(p)).toBe(NESTED));
it("rejects backreferences", () => {
  expect(regexHazard("(a)\\1")).toBe("backreferences are not allowed");
  expect(regexHazard("(?<x>a)\\k<x>")).toBe("backreferences are not allowed");
});
it("caps the pattern length", () => {
  expect(MAX_PATTERN_LENGTH).toBe(200);
  expect(regexHazard("a".repeat(200))).toBeNull();
  expect(regexHazard("a".repeat(201))).toBe("pattern is longer than 200 characters");
});
```
`shared/test/items.test.ts` gets the tests below. The issue list is the short-answer member's own, because it is the only union member that parses structurally.
```ts
it("rejects a backtracking-prone regular expression at accept.0", () => {
  const r = itemSchema.safeParse({ ...base, type: "short-answer", match: "regex", accept: ["(a+)+$"] });
  expect(r.success).toBe(false);
  expect(r.error?.issues).toEqual([expect.objectContaining({ path: ["accept", 0], message: expect.stringMatching(/^a repeated group/) })]);
});
it("reports an uncompilable pattern once, as invalid", () => {
  const r = itemSchema.safeParse({ ...base, type: "short-answer", match: "regex", accept: ["[unterminated"] });
  expect(r.error?.issues).toEqual([expect.objectContaining({ path: ["accept", 0], message: "must be a valid regular expression" })]);
});
it("checks hazards only in regex mode", () =>
  expect(itemSchema.safeParse({ ...base, type: "short-answer", accept: ["(a+)+$"] }).success).toBe(true));
```
`shared/test/checking.test.ts` gets the tests below. The existing `^\d{4}$` case (:68-70) stays green.
```ts
it("caps answer text at MAX_ANSWER_TEXT characters", () => {
  expect(MAX_ANSWER_TEXT).toBe(200);
  const sa: Item = { id: "a9", type: "short-answer", prompt: "?", accept: ["x"] };
  expect(checkAnswer(sa, { type: "short-answer", text: "y".repeat(200) }).correct).toBe(false);
  expect(() => checkAnswer(sa, { type: "short-answer", text: "y".repeat(201) })).toThrow(/invalid answer/i);
  const fb: Item = { id: "f9", type: "fill-blank", prompt: "?", template: "{{1}}", blanks: [{ slot: 1, accept: ["y"] }] };
  expect(() => checkAnswer(fb, { type: "fill-blank", answers: { "1": "y".repeat(201) } })).toThrow(/invalid answer/i);
});
it("short-answer: vets every stored regex before running any", () => {
  const rx: Item = { id: "r9", type: "short-answer", prompt: "?", match: "regex", accept: ["^ok$", "(a+)+"] };
  expect(() => checkAnswer(rx, { type: "short-answer", text: "ok" })).toThrow(/unsafe regular expression/);
});
```

- [ ] **Step 2: Run them and confirm they fail**

`npx vitest run shared/test/regexSafety.test.ts shared/test/items.test.ts shared/test/checking.test.ts` → FAIL: `TypeError: … regexHazard is not a function`; the items hazard test gives `expected true to be false`; checking gives `expected undefined to be 200`, and the unsafe-regex test does not throw because `^ok$` matches first.

- [ ] **Step 3: Implement `regexHazard(pattern: string): string | null` in `shared/src/regexSafety.ts`, and wire it in**

The scanner is a single pass with no dependency, so `shared` stays safe to bundle into the web. Its JSDoc says why it exists: `checkAnswer` runs stored patterns synchronously in the request handler, and nested repetition backtracks exponentially at about 30 characters.
```text
regexHazard(p):
  if p.length > MAX_PATTERN_LENGTH: return "pattern is longer than 200 characters"
  stack = [frame()]                  -- frame = { repeats: false, unbounded: false, alternation: false }
  i = 0
  while i < p.length:
    closed = null                    -- the flags of a group that closes at p[i]
    switch p[i]:
      "\": if p[i+1] is "1".."9", or p[i+1..i+2] is "k<": return "backreferences are not allowed"
           i += 2                    -- any other escape is one literal atom
      "[": move past the first "]" not escaped by "\"   -- a class is one atom; its contents are ignored
      "(": push frame(); i += 1; skip a "?:", "?=", "?!", "?<=", "?<!" or "?<name>" prefix
           continue                  -- "(" itself takes no quantifier
      ")": closed = stack has more than 1 frame ? pop() : null; i += 1   -- never pop the root
      "|": top().alternation = true; i += 1; continue
      else: i += 1
    q = quantifier at p[i]: "*", "+", "?", "{n}", "{n,}" or "{n,m}", each with an optional lazy "?";
        a "{" that does not complete one of these is a literal
    if q:
      i += q.length
      unbounded = q is "*", "+" or "{n,}";  ranged = q is "{n,m}" with m > 1;  fixed = q is "{n}" with n > 1
      if closed and unbounded and (closed.repeats or closed.alternation): return NESTED      -- rule 3
      if closed and (ranged or fixed) and closed.unbounded: return NESTED                   -- rule 4
      top().repeats ||= unbounded or ranged;  top().unbounded ||= unbounded
    if closed: top().repeats ||= closed.repeats; top().unbounded ||= closed.unbounded       -- alternation does not fold up
  return null
```
- `items.ts:119-132`: the catch branch keeps its issue. When a pattern compiles and `regexHazard(pattern)` returns a message, add `ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accept", index], message })`.
- `checking.ts`: declare `export const MAX_ANSWER_TEXT = 200` before `answerSchema`. Line :8 becomes `answers: z.record(z.string().max(MAX_ANSWER_TEXT))` and :9 becomes `text: z.string().max(MAX_ANSWER_TEXT)`. At :100, before any pattern runs, add `if (item.accept.some((acc) => regexHazard(acc) !== null)) throw new Error("unsafe regular expression")`.
- `index.ts`: add `export { MAX_PATTERN_LENGTH, regexHazard } from "./regexSafety.js";`, and add `MAX_ANSWER_TEXT` to :28.

- [ ] **Step 4: Run tests and confirm they pass**

The Step 2 command → PASS. `npm test` and `npm run typecheck` → exit 0. `npm run validate:content -- content/web-app-reference content/matching-and-recommendation` prints the lines below (no authored item uses `match: "regex"`):
```
OK   content/web-app-reference — 57 lessons, 498 items, 12 quizzes, 24 games
OK   content/matching-and-recommendation — 1 lessons, 22 items, 1 quizzes, 0 games
```

- [ ] **Step 5: Commit**
```bash
git add shared/src/regexSafety.ts shared/src/items.ts shared/src/checking.ts shared/src/index.ts shared/test/regexSafety.test.ts shared/test/items.test.ts shared/test/checking.test.ts
git commit -m "feat: reject backtracking-prone answer regexes and cap answer text"
```

---

### Task 3: CheckableItem, expectedAnswer and checking test gaps

**Files:**
- Modify: `shared/src/items.ts` (add `CheckableItem` after the type aliases at :180-188)
- Modify: `shared/src/checking.ts` (add `expectedAnswer`; `expected` at :53, :74, :91, :102, :117 and :138 becomes `expectedAnswer(item)`)
- Modify: `shared/src/index.ts` (`CheckableItem` joins the type export at :4-7; `expectedAnswer` joins :28)
- Test: `shared/test/checking.test.ts`

**Interfaces:**
- Consumes: `Item`, `checkAnswer` and `CheckResult` (`shared/src/checking.ts:25-36`).
- Produces:
  - `export type CheckableItem = Exclude<Item, { type: "flashcard" }>`.
  - `expectedAnswer(item: CheckableItem): unknown`. What it returns depends on the item type:

    | Item type | `expectedAnswer` returns |
    |---|---|
    | MC | the correct option id |
    | MS | the correct option ids, in option order |
    | Fill-blank | `{ [slot]: accept[0] }` |
    | Short answer | `accept[0]` |
    | Ordering | the step ids, in order |
    | Matching | `item.pairs` |

    Every `checkAnswer` branch returns `expected: expectedAnswer(item)`.
  - Used by: Task 4 (`CheckableItem[]` pools), Task 7 (`expected` on a null quiz answer), and Task 20 (`Task = CheckableItem`).

- [ ] **Step 1: Write the failing tests**

In `shared/test/checking.test.ts`:
- retype `mc` (:5) as `CheckableItem`;
- add module-level `CheckableItem` fixtures copied from the inline ones:
  - `ms` from :27-34 (`partialCredit: true`);
  - `fb` from :50-56;
  - `sa` from :66;
  - `ord` from :74-77;
  - `mt` from :108-111, plus `distractors: ["bird"]`.
```ts
it("expectedAnswer equals checkAnswer's expected for every checkable type", () => {
  const cases: [CheckableItem, Answer, unknown][] = [
    [mc, { type: "multiple-choice", optionId: "b" }, "a"],
    [ms, { type: "multi-select", optionIds: ["c"] }, ["a", "b"]],
    [fb, { type: "fill-blank", answers: {} }, { "1": "Paris", "2": "Lyon" }],
    [sa, { type: "short-answer", text: "nope" }, "Café"],
    [ord, { type: "ordering", orderedIds: ["s2", "s1", "s3"] }, ["s1", "s2", "s3"]],
    [mt, { type: "matching", pairs: [{ left: "perro", right: "cat" }, { left: "gato", right: "dog" }] }, mt.pairs],
  ];
  for (const [item, answer, want] of cases) {
    expect(expectedAnswer(item)).toEqual(want);
    expect(checkAnswer(item, answer).expected).toEqual(want);
  }
});
it("multi-select: partial credit rewards a subset of the right options", () =>
  expect(checkAnswer(ms, { type: "multi-select", optionIds: ["a"] })).toMatchObject({ correct: false, score: 0.5 }));
it("short-answer exact mode trims but keeps case and accents", () => {
  const exact: Item = { id: "a3", type: "short-answer", prompt: "?", accept: ["Café"], match: "exact" };
  expect(checkAnswer(exact, { type: "short-answer", text: " Café " }).correct).toBe(true);
  expect(checkAnswer(exact, { type: "short-answer", text: "cafe" }).correct).toBe(false);
  expect(checkAnswer(exact, { type: "short-answer", text: "café" }).correct).toBe(false);
});
it("matching: a distractor is a legal choice that scores wrong", () =>
  expect(checkAnswer(mt, { type: "matching", pairs: [{ left: "perro", right: "dog" }, { left: "gato", right: "bird" }] }))
    .toMatchObject({ correct: false, score: 0.5 }));
it("matching: an unknown right is rejected", () =>
  expect(() => checkAnswer(mt, { type: "matching", pairs: [{ left: "perro", right: "dog" }, { left: "gato", right: "fish" }] }))
    .toThrow('unknown matching choice "fish"'));
```

- [ ] **Step 2: Run them and confirm they fail**

`npx vitest run shared/test/checking.test.ts` → FAIL with `TypeError: … expectedAnswer is not a function`. The four gap tests already pass, because they pin existing behaviour.

- [ ] **Step 3: Implement `expectedAnswer(item: CheckableItem): unknown` in `shared/src/checking.ts`**
  - Return the values in the Produces table.
  - Inside `checkAnswer`, the flashcard throw at :40 already narrows `item` to `CheckableItem`. So each branch's `expected:` becomes `expectedAnswer(item)`, and nothing else changes.
  - Give `expectedAnswer` a Google-style JSDoc (Args, Returns).

- [ ] **Step 4: Run tests and confirm they pass**

`npx vitest run shared/test/checking.test.ts` → PASS. Then `npm test` and `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**
```bash
git add shared/src/items.ts shared/src/checking.ts shared/src/index.ts shared/test/checking.test.ts
git commit -m "feat: add CheckableItem and expectedAnswer, cover checking gaps"
```

---

### Task 4: Shuffle helpers and game-source resolution

**Files:**
- Create: `shared/src/random.ts`, `shared/src/games.ts`
- Modify: `shared/src/validatePackage.ts` (delete the local `GAME_COMPAT` at :25-29 and import it from `./games.js`; the zero-compatible check at :88-98 uses `resolveGameItems`)
- Modify: `shared/src/index.ts`
- Test: `shared/test/random.test.ts` (create), `shared/test/games.test.ts` (create), `shared/test/validatePackage.test.ts`

**Interfaces:**
- Consumes: `CheckableItem` (Task 3), `Game`, `Item`.
- Produces:
```ts
// shared/src/random.ts
function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[];  // new array; input untouched
function scramble<T>(items: readonly T[], random: () => number = Math.random): T[]; // never the identity when length ≥ 2
// shared/src/games.ts
const GAME_COMPAT: Record<Game["template"], Item["type"][]>;   // moved verbatim from validatePackage.ts:25-29
interface GameSettings { roundSize: number; timeLimitSeconds: number | null }
const GAME_DEFAULTS: Record<Game["template"], GameSettings>;
const MAX_MATCH_DISTRACTORS = 2;
function gameSettings(game: Game): GameSettings;
function resolveGameItems(game: Game, items: readonly Item[]): CheckableItem[];
interface MatchPair { itemId: string; left: string; right: string }
function matchingPairs(pool: readonly CheckableItem[]): MatchPair[];
function unitCount(game: Game, pool: readonly CheckableItem[]): number;
function roundSizeFor(game: Game, pool: readonly CheckableItem[]): number;
```
  Used by: Task 8; Task 12 (`getGame` filters SQL to the `GAME_COMPAT` types, then calls `resolveGameItems`); Tasks 13 and 18 (`gameSettings`); Task 19 (`roundSizeFor` on the sample); Task 20 (`shuffle`/`scramble` replace `ActivityView.tsx:229-236`); Task 23 (`shuffle` in `quizOrder`); Task 24 (`roundSizeFor` in the intro facts).

- [ ] **Step 1: Write the failing tests**

Both new test files define a mulberry32 PRNG `seeded(seed: number): () => number` at the top. Tasks 8 and 9 reuse the one in `games.test.ts`, along with the fixtures below.

`shared/test/random.test.ts`:
```ts
it("shuffles with a descending Fisher–Yates", () => {
  expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  expect(shuffle([1, 2, 3], () => 0.999)).toEqual([1, 2, 3]);
});
it("returns a permutation and leaves the input alone", () => {
  const input = [5, 1, 4, 2, 3];
  for (let s = 1; s <= 50; s++) expect([...shuffle(input, seeded(s))].sort()).toEqual([1, 2, 3, 4, 5]);
  expect(input).toEqual([5, 1, 4, 2, 3]);
});
it("scramble swaps the first two when the shuffle comes out unchanged", () => {
  expect(scramble([1, 2, 3], () => 0.999)).toEqual([2, 1, 3]);
  expect(scramble([7], () => 0.999)).toEqual([7]);
  expect(scramble([], () => 0.999)).toEqual([]);
});
it("scramble never returns the identity for lengths 2–7", () => {
  for (let n = 2; n <= 7; n++) for (let s = 1; s <= 200; s++) {
    const xs = [...Array(n).keys()];
    expect(scramble(xs, seeded(s))).not.toEqual(xs);
  }
});
```
`shared/test/games.test.ts` fixtures are typed `Item`, with `ITEMS = [mc1, card1, ms1, mc2, ord1, mat1, mat2]` in that order:

| Fixture | Type | Tags | Content |
|---|---|---|---|
| `mc1` | MC | `["t"]` | options a✓, b |
| `card1` | flashcard | `["t"]` | — |
| `ms1` | MS | `["t"]` | partialCredit; options a✓, b✓, c |
| `mc2` | MC | `["u"]` | options a✓, b |
| `ord1` | ordering | none | steps s1, s2, s3 |
| `mat1` | matching | `["m"]` | pairs a→1, b→2, c→3; `distractors: ["1", "x", "y", "z"]` |
| `mat2` | matching | `["m", "t"]` | pairs d→4, a→9 |

```ts
const game = (template: Game["template"], source: Game["source"], settings?: Game["settings"]): Game => ({ id: "g", title: "G", template, source, settings });
const pool = (g: Game) => resolveGameItems(g, ITEMS);
const ids = (g: Game) => pool(g).map((i) => i.id);
const gMatch = game("matching", { itemIds: ["mat1"] }), gMatchM = game("matching", { tags: ["m"] }),
  gMatchSmall = game("matching", { itemIds: ["mat1"] }, { roundSize: 2 }), gSpeed = game("timed-round", { itemIds: ["mc1", "ms1"] }),
  gSpeed2 = game("timed-round", { itemIds: ["mc1", "ms1", "mc2"] }, { roundSize: 2 }), gOrder = game("order-it", { itemIds: ["ord1"] });
it("resolves itemIds in listed order, first occurrence, dropping missing and incompatible ids", () =>
  expect(ids(game("timed-round", { itemIds: ["ms1", "ghost", "mc1", "ms1", "card1", "ord1"] }))).toEqual(["ms1", "mc1"]));
it("resolves tags by any matching tag, in items order", () => {
  expect(ids(game("timed-round", { tags: ["u", "t"] }))).toEqual(["mc1", "ms1", "mc2"]);
  expect(ids(gMatchM)).toEqual(["mat1", "mat2"]);
  expect(ids(game("order-it", { itemIds: ["ord1", "mc1"] }))).toEqual(["ord1"]);
});
it("overlays settings on the template defaults field by field", () => {
  expect(GAME_DEFAULTS).toEqual({ matching: { roundSize: 6, timeLimitSeconds: null },
    "timed-round": { roundSize: 10, timeLimitSeconds: 60 }, "order-it": { roundSize: 3, timeLimitSeconds: null } });
  expect(MAX_MATCH_DISTRACTORS).toBe(2);
  expect(gameSettings(gMatch)).toEqual({ roundSize: 6, timeLimitSeconds: null });
  expect(gameSettings(game("timed-round", { tags: ["t"] }, { timeLimitSeconds: 30 }))).toEqual({ roundSize: 10, timeLimitSeconds: 30 });
  expect(gameSettings(game("order-it", { tags: ["t"] }, { roundSize: 5 }))).toEqual({ roundSize: 5, timeLimitSeconds: null });
});
it("pools pairs across items, keeping the first pair for a repeated left", () =>
  expect(matchingPairs(pool(gMatchM))).toEqual([{ itemId: "mat1", left: "a", right: "1" }, { itemId: "mat1", left: "b", right: "2" },
    { itemId: "mat1", left: "c", right: "3" }, { itemId: "mat2", left: "d", right: "4" }]));
it("counts units and caps the round size by them", () => {
  expect(unitCount(gMatchM, pool(gMatchM))).toBe(4);
  expect(unitCount(gSpeed2, pool(gSpeed2))).toBe(3);
  expect([gMatchM, gMatchSmall, gSpeed, gSpeed2, gOrder].map((g) => roundSizeFor(g, pool(g)))).toEqual([4, 2, 2, 2, 1]);
});
```
`shared/test/validatePackage.test.ts` gets characterization tests that guard the refactor (they pass before and after it). They use the `pkg()` factory (:5-25); every `items` override keeps `i1` (`{ id: "i1", type: "flashcard", front: "a", back: "b" }`), which the lesson body embeds. `msgs(p)` joins `validatePackage(p)` messages.

| Test | Setup (`pkg` overrides) | Expect |
|---|---|---|
| "accepts a tag-sourced game with a compatible item" | items `i1`, `i2`, MC `m1` tagged `["x"]`; games `[{ id: "g1", template: "timed-round", title: "T", source: { tags: ["x"] } }]` | `toEqual([])` |
| "flags a tag-sourced game whose tagged items are all incompatible" | `i1` tagged `["x"]`, same game | contains `game "g1" (timed-round) has no compatible items (needs: multiple-choice/multi-select)` |
| "flags timed-round and order-it games over incompatible items" | `g2` timed-round and `g3` order-it, both itemIds `["i2"]` | contains the `g2` text and `game "g3" (order-it) has no compatible items (needs: ordering)` |
| "keeps reporting missing game items" | `g4` matching, itemIds `["ghost"]` | contains `game references missing item "ghost"` and `game "g4" (matching) has no compatible items (needs: matching)` |
| "flags a flashcard in a quiz" | quizzes `[{ id: "q1", title: "Q", items: ["i1"] }]` | `toEqual([{ file: "quizzes.json", path: "q1", message: 'quiz item "i1" is a flashcard (not quizzable)' }])` |

- [ ] **Step 2: Run them and confirm they fail**

`npx vitest run shared/test/random.test.ts shared/test/games.test.ts shared/test/validatePackage.test.ts` → FAIL: `TypeError: … shuffle is not a function` and `… resolveGameItems is not a function`. validatePackage passes.

- [ ] **Step 3: Implement the Produces block**
  - `shuffle`: a descending Fisher–Yates on a copy: `for i = n−1 … 1: j = Math.floor(random() * (i + 1)); swap(i, j)`.
  - `scramble`: shuffles the index list `0…n−1`. When n ≥ 2 and the result is the identity, it swaps positions 0 and 1, then maps the indices back to items.
  - `gameSettings` overlays `game.settings` on `GAME_DEFAULTS[template]` field by field.
  - `resolveGameItems`: an itemIds source walks the listed order, keeps the first occurrence and skips missing ids; a tags source is `items.filter((i) => i.tags?.some((t) => tags.includes(t)))`. Both then keep only `GAME_COMPAT[template]` types.
  - `matchingPairs` flattens the pool's matching items in order, skipping a left text already seen. `unitCount` is `matchingPairs(pool).length` for matching, else `pool.length`. `roundSizeFor` is `Math.min(gameSettings(game).roundSize, unitCount(game, pool))`.
  - `validatePackage.ts:88-98`: keep the missing-id loop and its message. The error condition becomes `resolveGameItems(g, pkg.items).length === 0`, with the same `has no compatible items (needs: ${GAME_COMPAT[g.template].join("/")})` text.
  - `index.ts`: `export { shuffle, scramble } from "./random.js";`, `export { GAME_COMPAT, GAME_DEFAULTS, MAX_MATCH_DISTRACTORS, gameSettings, resolveGameItems, matchingPairs, unitCount, roundSizeFor } from "./games.js";` and `export type { GameSettings, MatchPair } from "./games.js";`. Every export gets a JSDoc.

- [ ] **Step 4: Run tests and confirm they pass**

The Step 2 command → PASS. `npm test` and `npm run typecheck` → exit 0. `npm run validate:content -- content/web-app-reference content/matching-and-recommendation` → the same two `OK` lines as Task 2.

- [ ] **Step 5: Commit**
```bash
git add shared/src/random.ts shared/src/games.ts shared/src/validatePackage.ts shared/src/index.ts shared/test/random.test.ts shared/test/games.test.ts shared/test/validatePackage.test.ts
git commit -m "feat: add shuffle helpers and shared game-source resolution"
```

---

### Task 5: Duplicate-reference rules

**Files:**
- Modify: `shared/src/validatePackage.ts` (a duplicate check beside the frontmatter `activities` loop at :51-53, and one beside the quiz-items loop at :77-81)
- Modify: `web/src/pages/Lesson.tsx` (`embedded` and `extra` at :50-51 move into an exported helper)
- Test: `shared/test/validatePackage.test.ts`, `web/test/lesson.test.ts` (create)

**Interfaces:**
- Consumes: `validatePackage(pkg: LoadedPackage): PackageError[]` (`shared/src/validatePackage.ts:31`); `activityIdsInBody(body: string): string[]` (`shared/src/lessonBody.ts:48`).
- Produces two new `PackageError`s, each reported once per repeated id:
  - `{ file: l.file, path: "activities", message: 'activities lists item "<id>" more than once' }`
  - `{ file: "quizzes.json", path: q.id, message: 'quiz lists item "<id>" more than once' }`

  Repeated `::activity` directives in a body stay allowed. Repeated ids in a game's itemIds also stay allowed, because `resolveGameItems` (Task 4) de-duplicates them.
- Produces, in `web/src/pages/Lesson.tsx`: `export function lessonExtras(activities: readonly string[] | undefined, body: string): string[]`. It returns the frontmatter activities that the body does not embed, each once, in listed order.

- [ ] **Step 1: Write the failing tests**

In `shared/test/validatePackage.test.ts` (`LessonFrontmatter` is a type import on its own line):
```ts
const lesson = (frontmatter: LessonFrontmatter, body = 'Hello\n\n::activity{id="i1"}\n') => ({ file: "lessons/01-a.md", order: 0, frontmatter, body });
it("rejects an item listed twice in frontmatter activities, once per id", () => {
  const msg = { file: "lessons/01-a.md", path: "activities", message: 'activities lists item "i2" more than once' };
  expect(validatePackage(pkg({ lessons: [lesson({ id: "l1", title: "L1", activities: ["i2", "i2"] })] }))).toEqual([msg]);
  expect(validatePackage(pkg({ lessons: [lesson({ id: "l1", title: "L1", activities: ["i2", "i2", "i2"] })] }))).toEqual([msg]);
});
it("rejects an item listed twice in a quiz", () =>
  expect(validatePackage(pkg({ quizzes: [{ id: "q1", title: "Q", items: ["i2", "i2"] }] })))
    .toEqual([{ file: "quizzes.json", path: "q1", message: 'quiz lists item "i2" more than once' }]));
it("still accepts a body that embeds the same activity twice", () =>
  expect(validatePackage(pkg({ lessons: [lesson({ id: "l1", title: "L1" }, 'A\n\n::activity{id="i1"}\n\nB\n\n::activity{id="i1"}\n')] }))).toEqual([]));
it("does not count a frontmatter activity that the body also embeds", () =>
  expect(validatePackage(pkg({ lessons: [lesson({ id: "l1", title: "L1", activities: ["i1"] })] }))).toEqual([]));
```
`web/test/lesson.test.ts` (imports `lessonExtras` from `../src/pages/Lesson.js`):
```ts
it("lessonExtras lists each frontmatter extra once and skips the ones the body embeds", () => {
  expect(lessonExtras(["x", "x", "y"], 'A\n\n::activity{id="y"}\n')).toEqual(["x"]);
  expect(lessonExtras(undefined, "A")).toEqual([]);
});
```

- [ ] **Step 2: Run them and confirm they fail**

`npx vitest run shared/test/validatePackage.test.ts web/test/lesson.test.ts` → FAIL on the two rejection tests with `expected [] to deeply equal [ { file: …, path: …, message: … } ]`, and on the lesson test with `TypeError: … lessonExtras is not a function`. The two acceptance tests already pass.

- [ ] **Step 3: Implement both checks in `validatePackage`, and `lessonExtras`**
  - Each check keeps a `seen` set and a `reported` set, so an id repeated any number of times gives exactly one error.
  - `lessonExtras` is `[...new Set(activities ?? [])]` filtered against `new Set(activityIdsInBody(body))`. `Lesson()` replaces `embedded` and `extra` (`Lesson.tsx:50-51`) with `const extra = lessonExtras(fm.activities, data.lesson.body)`. Rows imported before this rule then cannot repeat the `key={id}` at :80-81. Declare `lessonExtras` after `Lesson()`, at the end of the file, so the HEAD lines above :50 keep their numbers (only the lines after :51 move up by one).
  - The helper is a pure export because the page itself cannot be render-tested in the node env: it needs `useParams` and a fetch.

- [ ] **Step 4: Run tests and confirm they pass**
  - `npx vitest run shared/test/validatePackage.test.ts server/test/packageFolder.test.ts web/test/lesson.test.ts` → PASS.
  - `npm test` and `npm run typecheck` → exit 0.
  - `npm run validate:content -- content/web-app-reference content/matching-and-recommendation` → both `OK` lines. Each frontmatter activities list holds one id (`content/matching-and-recommendation/lessons/01-matching-and-recommendation.md:8`, `server/sample/lessons/02-active-recall.md:8`), and no quiz repeats an item.

- [ ] **Step 5: Commit**
```bash
git add shared/src/validatePackage.ts shared/test/validatePackage.test.ts web/src/pages/Lesson.tsx web/test/lesson.test.ts
git commit -m "feat: reject duplicate frontmatter activities and quiz items"
```

---

### Task 6: Request contracts and the import caps that match them

**Files:**
- Create: `shared/src/requests.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/src/validatePackage.ts` (three size errors: in the quiz loop at :73-82, the game loop at :84-99 and the item media loop at :101-105)
- Test: `shared/test/requests.test.ts` (create), `shared/test/validatePackage.test.ts`

**Interfaces:**
- Consumes: `idSchema` (`shared/src/ids.ts:4`); `answerSchema` and `attemptRequestSchema` (`shared/src/checking.ts:5-23`) with the Task 2 caps; `Game`; `validatePackage` and the test file's `pkg()` factory as Tasks 4–5 left them.
- Produces exactly these constants and schemas (each with a one-line JSDoc), plus their types:
```ts
const MAX_ELAPSED_SECONDS = 86400   // one day; the web client clamps elapsed time to [0, MAX_ELAPSED_SECONDS] (Tasks 23–24)
const MAX_PLAY_ITEMS = 200          // the most quiz answers, dealt lefts, dealt item ids or item answers one request carries
const MAX_MATCH_TEXT = 2000         // the longest left or right text one matching pick carries
ratingSchema = z.enum(["again", "hard", "good", "easy"])
progressRequestSchema = z.object({ status: z.enum(["in-progress", "completed"]) }).strict()
gradeRequestSchema = z.object({ packageId: idSchema, itemId: idSchema, direction: z.enum(["front", "back"]), rating: ratingSchema }).strict()
quizAnswerSchema = z.object({ itemId: idSchema, answer: answerSchema.nullable() }).strict()
quizSubmissionSchema = z.object({ kind: z.literal("quiz"), packageId: idSchema, quizId: idSchema,
  answers: z.array(quizAnswerSchema).max(MAX_PLAY_ITEMS), elapsedSeconds: z.number().int().min(0).max(MAX_ELAPSED_SECONDS) }).strict()
matchPickSchema = z.object({ left: z.string().max(MAX_MATCH_TEXT), right: z.string().max(MAX_MATCH_TEXT) }).strict()
gameItemAnswerSchema = z.object({ itemId: idSchema, answer: answerSchema }).strict()
gameMoveSchema = z.union([gameItemAnswerSchema, matchPickSchema])
gamePlaySchema = z.discriminatedUnion("template", [
  z.object({ template: z.literal("matching"), lefts: z.array(z.string().max(MAX_MATCH_TEXT)).min(1).max(MAX_PLAY_ITEMS), picks: z.array(matchPickSchema).max(2000) }).strict(),
  z.object({ template: z.literal("timed-round"), itemIds: z.array(idSchema).min(1).max(MAX_PLAY_ITEMS), answers: z.array(gameItemAnswerSchema).max(MAX_PLAY_ITEMS) }).strict(),
  z.object({ template: z.literal("order-it"), itemIds: z.array(idSchema).min(1).max(MAX_PLAY_ITEMS), answers: z.array(gameItemAnswerSchema).max(MAX_PLAY_ITEMS) }).strict(),
])
gameSubmissionSchema = z.object({ kind: z.literal("game"), packageId: idSchema, gameId: idSchema,
  play: gamePlaySchema, elapsedSeconds: z.number().int().min(0).max(MAX_ELAPSED_SECONDS) }).strict()
attemptBodySchema = z.union([attemptRequestSchema, quizSubmissionSchema, gameSubmissionSchema])  // strict members are disjoint; the exercise body has no kind
attemptsQuerySchema = z.object({ packageId: idSchema.optional(), kind: z.enum(["exercise", "quiz", "game"]).optional(),
  refId: idSchema.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).strict()
  .refine((q) => q.refId === undefined || q.kind === "quiz" || q.kind === "game", { message: "refId needs kind quiz or game", path: ["refId"] })
// types: QuizAnswer, QuizSubmission, GameMove, GamePlay, GameSubmission, AttemptsQuery = z.infer<…> of the matching schema
type AttemptRecord =
  | { id: number; kind: "exercise"; packageId: string; itemId: string; correct: boolean; score: number; at: string }
  | { id: number; kind: "quiz"; packageId: string; quizId: string; score: number; passed: boolean | null;
      correctCount: number; total: number; timedOut: boolean; elapsedSeconds: number; at: string }
  | { id: number; kind: "game"; packageId: string; gameId: string; template: Game["template"]; score: number;
      correctCount: number; total: number; mistakes: number; completed: boolean; timedOut: boolean; elapsedSeconds: number; at: string };
```
  Used by: Tasks 7–9 (types), 10 (progress), 11 (grade), 14 (moves), 15–16 (`attemptBodySchema`), 17 (query, `AttemptRecord`), 21 (web client) and 22–25 (`AttemptRecord`, `QuizSubmission`, `GameMove`, `GamePlay`, `GameSubmission`; Tasks 23–24 also `MAX_ELAPSED_SECONDS`).
- Produces three new `PackageError`s in `validatePackage`, so import refuses content whose runs or plays a request cap would reject with 400 on every retry. The messages build the numbers from the constants:
  - `{ file: "quizzes.json", path: q.id, message: "quiz lists more than 200 items" }`, when the quiz's distinct item ids exceed `MAX_PLAY_ITEMS`;
  - `{ file: "games.json", path: g.id, message: "roundSize may be at most 200" }`, when `settings.roundSize` exceeds `MAX_PLAY_ITEMS` (the deal is `min(roundSize, units)`, so this bounds every dealt round);
  - `{ file: "items.json", path: item.id, message: "matching text may be at most 2000 characters" }`, once per matching item whose pair lefts, pair rights or distractors include a text longer than `MAX_MATCH_TEXT`.

  The `picks` cap (2000 moves) needs no import rule: it is only reached by about 1,800 misses on a 200-pair board.

- [ ] **Step 1: Write the failing tests**

`shared/test/requests.test.ts`:
```ts
const ex = { packageId: "p", itemId: "i", answer: { type: "multiple-choice", optionId: "a" } };
const quiz = { kind: "quiz", packageId: "p", quizId: "q", elapsedSeconds: 12,
  answers: [{ itemId: "i", answer: null }, { itemId: "j", answer: { type: "short-answer", text: "x" } }] };
const game = { kind: "game", packageId: "p", gameId: "g", elapsedSeconds: 5,
  play: { template: "matching", lefts: ["a"], picks: [{ left: "a", right: "1" }] } };
it("parses the legacy exercise body, a quiz submission and a game submission", () => {
  for (const body of [ex, quiz, game]) expect(attemptBodySchema.parse(body)).toEqual(body);
});
it("rejects unknown keys on every branch", () => {
  for (const body of [{ ...ex, typo: true }, { ...quiz, extra: 1 }, { ...game, extra: 1 }, { ...game, play: { ...game.play, rights: [] } }])
    expect(attemptBodySchema.safeParse(body).success).toBe(false);
});
it("rejects a quiz-kind body carrying exercise fields", () =>
  expect(attemptBodySchema.safeParse({ kind: "quiz", packageId: "p", itemId: "i", answer: ex.answer }).success).toBe(false));
it("rejects a play whose fields do not match its template", () => {
  for (const play of [{ template: "matching", itemIds: ["i"], answers: [] }, { template: "order-it", lefts: ["a"], picks: [] },
    { template: "timed-round", itemIds: [], answers: [] }]) expect(gamePlaySchema.safeParse(play).success).toBe(false);
});
it("bounds elapsed time, list sizes and text", () => {
  expect(MAX_ELAPSED_SECONDS).toBe(86400); expect([MAX_PLAY_ITEMS, MAX_MATCH_TEXT]).toEqual([200, 2000]);
  for (const elapsedSeconds of [-1, 1.5, 86401]) expect(quizSubmissionSchema.safeParse({ ...quiz, elapsedSeconds }).success).toBe(false);
  expect(quizSubmissionSchema.safeParse({ ...quiz, elapsedSeconds: 86400 }).success).toBe(true);
  const many = Array.from({ length: 201 }, (_, k) => ({ itemId: `i${k}`, answer: null }));
  const long = [{ itemId: "i", answer: { type: "short-answer", text: "x".repeat(201) } }];
  for (const answers of [many, long]) expect(quizSubmissionSchema.safeParse({ ...quiz, answers }).success).toBe(false);
  expect(matchPickSchema.safeParse({ left: "a".repeat(2001), right: "b" }).success).toBe(false);
});
it("accepts either game move shape but not a mix", () => {
  expect(gameMoveSchema.safeParse({ itemId: "i", answer: ex.answer }).success).toBe(true);
  expect(gameMoveSchema.safeParse({ left: "a", right: "1" }).success).toBe(true);
  expect(gameMoveSchema.safeParse({ left: "a", right: "1", itemId: "i" }).success).toBe(false);
});
it("parses attempts queries", () => {
  expect(attemptsQuerySchema.parse({})).toEqual({ limit: 50 });
  expect(attemptsQuerySchema.parse({ packageId: "p", kind: "quiz", refId: "q", limit: "20" })).toEqual({ packageId: "p", kind: "quiz", refId: "q", limit: 20 });
  expect(attemptsQuerySchema.safeParse({ refId: "q" }).error?.issues[0]).toMatchObject({ path: ["refId"], message: "refId needs kind quiz or game" });
  for (const q of [{ kind: "exercise", refId: "q" }, { bogus: "1" }, { limit: "0" }, { limit: "201" }, { limit: "abc" }])
    expect(attemptsQuerySchema.safeParse(q).success).toBe(false);
});
it("keeps progress and grade bodies strict", () => {
  expect(progressRequestSchema.safeParse({ status: "completed" }).success).toBe(true);
  for (const b of [{ status: "done" }, { status: "completed", x: 1 }, null]) expect(progressRequestSchema.safeParse(b).success).toBe(false);
  const grade = { packageId: "p", itemId: "c", direction: "back", rating: "good" };
  expect(gradeRequestSchema.safeParse(grade).success).toBe(true);
  for (const b of [{ ...grade, rating: "perfect" }, { ...grade, itemId: 5 }, { ...grade, direction: "up" }, { ...grade, x: 1 }, { ...grade, packageId: "x".repeat(65) }])
    expect(gradeRequestSchema.safeParse(b).success).toBe(false);
});
```
Append to `shared/test/validatePackage.test.ts` (`Item` joins the type import):
```ts
it("refuses a quiz, a roundSize or a matching text that no request could carry", () => {
  const i1: Item = { id: "i1", type: "flashcard", front: "a", back: "b" };   // the lesson body embeds it
  const sas = Array.from({ length: 201 }, (_, k): Item => ({ id: `s${k}`, type: "short-answer", prompt: "?", accept: ["x"] }));
  const quiz = (n: number) => pkg({ items: [i1, ...sas], quizzes: [{ id: "q1", title: "Q", items: sas.slice(0, n).map((i) => i.id) }] });
  expect(validatePackage(quiz(200))).toEqual([]);
  expect(validatePackage(quiz(201))).toEqual([{ file: "quizzes.json", path: "q1", message: "quiz lists more than 200 items" }]);
  const mat = (right: string, distractors?: string[]): Item =>
    ({ id: "mt", type: "matching", prompt: "?", pairs: [{ left: "a", right }, { left: "b", right: "2" }], distractors });
  const game = (roundSize: number, item = mat("1")) => pkg({ items: [i1, item],
    games: [{ id: "g1", template: "matching", title: "M", source: { itemIds: ["mt"] }, settings: { roundSize } }] });
  expect(validatePackage(game(200))).toEqual([]);
  expect(validatePackage(game(201))).toEqual([{ file: "games.json", path: "g1", message: "roundSize may be at most 200" }]);
  const tooLong = { file: "items.json", path: "mt", message: "matching text may be at most 2000 characters" };
  expect(validatePackage(game(6, mat("x".repeat(2000), ["y".repeat(2000)])))).toEqual([]);
  expect(validatePackage(game(6, mat("x".repeat(2001), ["y".repeat(2001)])))).toEqual([tooLong]);   // once per item
  expect(validatePackage(game(6, mat("1", ["y".repeat(2001)])))).toEqual([tooLong]);                 // a distractor counts
});
```

- [ ] **Step 2: Run them and confirm they fail**

`npx vitest run shared/test/requests.test.ts shared/test/validatePackage.test.ts` → FAIL. The requests tests fail with `TypeError: Cannot read properties of undefined (reading 'parse')`, and the same error for `safeParse`; the bounds test stops at its first assertion, with `expected undefined to be 86400`. The new validatePackage test fails at `quiz(201)` with `expected [] to deeply equal [ { file: 'quizzes.json', … } ]`; the Task 4–5 tests still pass.

- [ ] **Step 3: Create `shared/src/requests.ts` with exactly the Produces declarations, and add the three size errors**

`shared/src/index.ts` gains one value export line for `MAX_ELAPSED_SECONDS`, `MAX_PLAY_ITEMS`, `MAX_MATCH_TEXT` and the twelve schemas, and one `export type` line for `QuizAnswer`, `QuizSubmission`, `GameMove`, `GamePlay`, `GameSubmission`, `AttemptsQuery` and `AttemptRecord`. `validatePackage.ts` imports the two caps from `./requests.js` and adds each error in the loop named under Files.

- [ ] **Step 4: Run tests and confirm they pass**
  - `npx vitest run shared/test/requests.test.ts shared/test/validatePackage.test.ts` → PASS. Then `npm test` and `npm run typecheck` → exit 0.
  - `npm run validate:content -- content/web-app-reference content/matching-and-recommendation` → both `OK` lines. The largest authored quiz lists 18 items, no game sets `roundSize`, and the longest matching text is 88 characters.

- [ ] **Step 5: Commit**
```bash
git add shared/src/requests.ts shared/src/index.ts shared/src/validatePackage.ts shared/test/requests.test.ts shared/test/validatePackage.test.ts
git commit -m "feat: add shared request contracts and refuse content they cannot carry"
```

---

### Task 7: Quiz scoring

**Files:**
- Create: `shared/src/quiz.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/quiz.test.ts` (create)

**Interfaces:**
- Consumes: `checkAnswer`, `CheckResult`, `expectedAnswer`, `CheckableItem` (Task 3); `QuizAnswer` (Task 6); `Quiz`; `Item`.
- Produces:
```ts
function quizItemIds(quiz: Quiz): string[];   // unique ids, first-occurrence order
function isPassing(score: number, threshold: number | undefined): boolean | null;  // undefined → null; else score >= threshold - 1e-9
interface QuizItemResult extends CheckResult { itemId: string; answered: boolean }
interface QuizResult { score: number; correctCount: number; answeredCount: number; total: number; passThreshold: number | null;
  passed: boolean | null; timedOut: boolean; elapsedSeconds: number; results: QuizItemResult[] }
function scoreQuiz(quiz: Quiz, items: ReadonlyMap<string, Item>, answers: readonly QuizAnswer[], elapsedSeconds: number): QuizResult;
```
  Used by: Task 12 (`quizItemIds` in `getQuiz`), Task 15 (`scoreQuiz`; a throw maps to 422), Task 18 (`quizItemIds` for `itemCount`), Task 22 (`isPassing` for the list dots), Task 23 (`quizItemIds` in `quizOrder` and `buildQuizSubmission`; `QuizResult` and `QuizItemResult` on the page).

- [ ] **Step 1: Write the failing tests**

`shared/test/quiz.test.ts` fixtures, typed `CheckableItem`: `mc` (options a✓/b), `ms` (`partialCredit: true`, options a✓/b✓/c), `fb` (template `"{{1}} and {{2}}"`, blanks `Paris` and `Lyon`), `ord` (steps s1/s2/s3). Answers: `mcRight` (option a), `msHalf` `["a"]`, `msAll` `["a", "b"]`, `fbHalf` `{ "1": "Paris" }`, `fbAll` `{ "1": "Paris", "2": "Lyon" }`, `ordOff` `["s1", "s3", "s2"]`.
```ts
const items: ReadonlyMap<string, Item> = new Map([mc, ms, fb, ord].map((i) => [i.id, i]));
const quiz: Quiz = { id: "qz", title: "Q", items: ["mc", "ms", "fb", "ord"], passThreshold: 0.75, timeLimitSeconds: 60 };
const run = (answers: (Answer | null)[], q: Quiz = quiz) => scoreQuiz(q, items, q.items.map((itemId, k) => ({ itemId, answer: answers[k] ?? null })), 30);
const nulls = quiz.items.map((itemId) => ({ itemId, answer: null }));
```
```ts
it("scores the mean item score, keeping partial credit", () => {
  const r = run([mcRight, msHalf, fbHalf, ordOff]);
  expect(r.results.map((x) => x.score)).toEqual([1, 0.5, 0.5, 1 / 3]);
  expect(r.score).toBeCloseTo(7 / 12, 12);
  expect(r).toMatchObject({ correctCount: 1, answeredCount: 4, total: 4, passThreshold: 0.75, passed: false });
});
it("scores a null answer 0, reports its expected answer, and never checks it", () => {
  const r = run([mcRight, null, null, null]);   // checkAnswer would throw "invalid answer" on null
  expect(r).toMatchObject({ score: 0.25, correctCount: 1, answeredCount: 1 });
  expect(r.results[1]).toEqual({ itemId: "ms", answered: false, correct: false, score: 0, expected: ["a", "b"] });
  expect(r.results[3]?.expected).toEqual(["s1", "s2", "s3"]);
});
it("passes 3 of 4 against a 0.75 threshold", () =>
  expect(run([mcRight, msAll, fbAll, null])).toMatchObject({ score: 0.75, correctCount: 3, passed: true }));
it("isPassing tolerates float error and is null without a threshold", () => {
  expect([isPassing(0.75, 0.75), isPassing(0.7499999999999999, 0.75), isPassing(0.7467, 0.75), isPassing(1, undefined)])
    .toEqual([true, true, false, null]);
});
it("gives passed and passThreshold null when the quiz sets no threshold", () => {
  const { passThreshold: _, ...open } = quiz;
  expect(run([mcRight], open)).toMatchObject({ passThreshold: null, passed: null });
});
it("requires exactly one answer per quiz item", () => {
  for (const answers of [nulls.slice(0, 3), [...nulls, { itemId: "zz", answer: null }], [...nulls.slice(0, 3), { itemId: "mc", answer: null }]])
    expect(() => scoreQuiz(quiz, items, answers, 0)).toThrow("quiz answers must list every quiz item exactly once");
});
it("throws for a missing or uncheckable item and propagates checkAnswer errors", () => {
  expect(() => scoreQuiz(quiz, new Map([...items].filter(([id]) => id !== "ord")), nulls, 0)).toThrow('quiz item "ord" is missing');
  const card: Item = { id: "ord", type: "flashcard", front: "f", back: "b" };
  expect(() => scoreQuiz(quiz, new Map([...items, ["ord", card]]), nulls, 0)).toThrow('quiz item "ord" is not checkable');
  expect(() => run([{ type: "multiple-choice", optionId: "zz" }])).toThrow('unknown option id "zz"');
});
it("dedupes quiz items and reports results in quiz order", () => {
  expect(quizItemIds({ ...quiz, items: ["a", "b", "a", "c", "b"] })).toEqual(["a", "b", "c"]);
  expect(scoreQuiz(quiz, items, [...nulls].reverse(), 0).results.map((x) => x.itemId)).toEqual(["mc", "ms", "fb", "ord"]);
  expect(scoreQuiz({ ...quiz, items: ["mc", "mc", "ms"] }, items, nulls.slice(0, 2), 0).total).toBe(2);
});
it("clamps elapsed time to the limit and flags timedOut at the limit", () => {
  expect(scoreQuiz(quiz, items, nulls, 75)).toMatchObject({ elapsedSeconds: 60, timedOut: true });
  expect(scoreQuiz(quiz, items, nulls, 60)).toMatchObject({ elapsedSeconds: 60, timedOut: true });
  expect(scoreQuiz(quiz, items, nulls, 59)).toMatchObject({ elapsedSeconds: 59, timedOut: false });
  const { timeLimitSeconds: _, ...untimed } = quiz;
  expect(scoreQuiz(untimed, items, nulls, 500)).toMatchObject({ elapsedSeconds: 500, timedOut: false });
});
```

- [ ] **Step 2: Run them and confirm they fail**

`npx vitest run shared/test/quiz.test.ts` → FAIL with `TypeError: … scoreQuiz is not a function`.

- [ ] **Step 3: Implement `scoreQuiz` and its helpers in `shared/src/quiz.ts`**
  - Exact cover first: with `ids = quizItemIds(quiz)`, `answers` must name every id exactly once, in any order; otherwise throw `quiz answers must list every quiz item exactly once`.
  - Then, per id in `ids` order:
    - missing from `items` → throw `quiz item "<id>" is missing`;
    - a flashcard → throw `quiz item "<id>" is not checkable`;
    - a null answer → `{ itemId, answered: false, correct: false, score: 0, expected: expectedAnswer(item) }`, without calling `checkAnswer`;
    - otherwise → `{ ...checkAnswer(item, answer), itemId, answered: true }`, and any throw propagates.
  - Totals: `total = ids.length`, `score = Σ score / total`, `passThreshold = quiz.passThreshold ?? null`, `passed = isPassing(score, quiz.passThreshold)`.
  - Time, with `limit = quiz.timeLimitSeconds`: stored `elapsedSeconds = limit === undefined ? elapsed : Math.min(elapsed, limit)`, and `timedOut = limit !== undefined && elapsed >= limit`.
  - Exports: `export { quizItemIds, isPassing, scoreQuiz } from "./quiz.js";` and `export type { QuizItemResult, QuizResult } from "./quiz.js";`. Every function gets a JSDoc, and `scoreQuiz`'s has a `Raises:` section.

- [ ] **Step 4: Run tests and confirm they pass**

`npx vitest run shared/test/quiz.test.ts` → PASS. Then `npm test` and `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**
```bash
git add shared/src/quiz.ts shared/src/index.ts shared/test/quiz.test.ts
git commit -m "feat: score quiz submissions in shared"
```

---

### Task 8: Game dealing and per-move checks

**Files:**
- Modify: `shared/src/games.ts`, `shared/src/index.ts`
- Test: `shared/test/games.test.ts`

**Interfaces:**
- Consumes: `shuffle`, `matchingPairs`, `roundSizeFor`, `MAX_MATCH_DISTRACTORS` (Task 4's Interfaces); `GameMove` (Task 6); `checkAnswer`, `CheckResult`.
- Produces:
```ts
type GameDeal =
  | { template: "matching"; lefts: string[]; rights: string[] }
  | { template: "timed-round" | "order-it"; itemIds: string[] };
function dealGame(game: Game, pool: readonly CheckableItem[], random: () => number = Math.random): GameDeal;
type GameMoveResult = CheckResult | { correct: boolean };
function checkGameMove(game: Game, pool: readonly CheckableItem[], move: GameMove): GameMoveResult;
```
  `checkGameMove` throws exactly: `unknown matching left "<left>"`, `unknown matching choice "<right>"`, `matching games take { left, right } picks`, `<template> games take { itemId, answer } moves`, `item "<id>" is not in this game`.

  Used by: Task 9 (replay), Task 14 (`POST /api/games/:p/:g/check`; a throw maps to 422), Task 24 (`Game.tsx` deals), Task 25 (`MatchingBoard` takes `Extract<GameDeal, { template: "matching" }>`).

- [ ] **Step 1: Write the failing tests**

Append to `shared/test/games.test.ts`, reusing Task 4's `seeded`, `ITEMS`, `game`, `pool` and named games. Two narrowing helpers: `matchDeal(g, s)` returns `dealGame(g, pool(g), seeded(s))` and throws unless its template is `"matching"`; `itemDeal(g, s)` returns the same deal and throws if it is `"matching"`.
```ts
it("deals min(roundSize, units) distinct units", () => {
  const all = matchDeal(gMatchM, 1);
  expect([...all.lefts].sort()).toEqual(["a", "b", "c", "d"]);
  expect(all.rights).toHaveLength(6);                           // 4 rights + 2 of x/y/z
  expect(new Set(matchDeal(gMatchSmall, 1).lefts).size).toBe(2);
  const two = itemDeal(gSpeed2, 1).itemIds;
  expect(new Set(two).size).toBe(2);
  expect(two.every((id) => ["mc1", "ms1", "mc2"].includes(id))).toBe(true);
  expect([...itemDeal(gSpeed, 1).itemIds].sort()).toEqual(["mc1", "ms1"]);
  expect(dealGame(gOrder, pool(gOrder), seeded(1))).toEqual({ template: "order-it", itemIds: ["ord1"] });
});
it("adds at most 2 distractors and never one equal to a dealt right", () => {
  for (let s = 1; s <= 50; s++) {
    const all = matchDeal(gMatch, s);                            // all 3 pairs dealt, so "1" is a dealt right
    expect(all.rights).toHaveLength(5);
    expect(all.rights.filter((r) => r === "1")).toHaveLength(1);
    const two = matchDeal(gMatchSmall, s);
    const dealt = two.lefts.map((l) => ({ a: "1", b: "2", c: "3" })[l as "a" | "b" | "c"]);
    const extras = [...two.rights];
    for (const r of dealt) extras.splice(extras.indexOf(r), 1);
    expect(extras).toHaveLength(2);
    expect(extras.some((e) => dealt.includes(e))).toBe(false);
  }
});
it("takes distractors only from the dealt pairs' items", () => {
  const one = game("matching", { tags: ["m"] }, { roundSize: 1 });
  let dealtD = 0;
  for (let s = 1; s <= 50; s++) {
    const d = matchDeal(one, s);
    if (d.lefts[0] === "d") { dealtD++; expect(d.rights).toEqual(["4"]); } else expect(d.rights).toHaveLength(3);
  }
  expect(dealtD).toBeGreaterThan(0);
});
it("keeps repeated right texts as separate tiles", () => {
  const dup: Item = { id: "dup", type: "matching", prompt: "?", pairs: [{ left: "p", right: "same" }, { left: "q", right: "same" }] };
  const g = game("matching", { itemIds: ["dup"] });
  expect(dealGame(g, resolveGameItems(g, [dup]), seeded(3))).toMatchObject({ rights: ["same", "same"] });
});
it("deals the same round for the same random", () =>
  expect(dealGame(gMatchM, pool(gMatchM), seeded(7))).toEqual(dealGame(gMatchM, pool(gMatchM), seeded(7))));
it("checks a matching pick without revealing the pair", () => {
  const p = pool(gMatchM);
  expect(checkGameMove(gMatchM, p, { left: "a", right: "1" })).toEqual({ correct: true });
  expect(checkGameMove(gMatchM, p, { left: "a", right: "2" })).toEqual({ correct: false });
  expect(checkGameMove(gMatchM, p, { left: "a", right: "x" })).toEqual({ correct: false });  // authored distractor
  expect(checkGameMove(gMatchM, p, { left: "a", right: "9" })).toEqual({ correct: false });  // right of the shadowed mat2 pair
  expect(() => checkGameMove(gMatchM, p, { left: "zz", right: "1" })).toThrow('unknown matching left "zz"');
  expect(() => checkGameMove(gMatchM, p, { left: "a", right: "nope" })).toThrow('unknown matching choice "nope"');
  expect(() => checkGameMove(gMatchM, p, { itemId: "mat1", answer: { type: "matching", pairs: [] } }))
    .toThrow("matching games take { left, right } picks");
});
it("checks an item move with checkAnswer", () => {
  const optionA = { type: "multiple-choice", optionId: "a" } as const;
  expect(checkGameMove(gSpeed, pool(gSpeed), { itemId: "mc1", answer: optionA })).toMatchObject({ correct: true, score: 1, expected: "a" });
  expect(checkGameMove(gOrder, pool(gOrder), { itemId: "ord1", answer: { type: "ordering", orderedIds: ["s1", "s2", "s3"] } }))
    .toMatchObject({ correct: true, score: 1 });
  expect(() => checkGameMove(gSpeed, pool(gSpeed), { itemId: "card1", answer: optionA })).toThrow('item "card1" is not in this game');
  expect(() => checkGameMove(gSpeed, pool(gSpeed), { left: "a", right: "1" })).toThrow("timed-round games take { itemId, answer } moves");
});
```

- [ ] **Step 2: Run them and confirm they fail**

`npx vitest run shared/test/games.test.ts` → FAIL with `TypeError: … dealGame is not a function` and `… checkGameMove is not a function`. The Task 4 tests still pass.

- [ ] **Step 3: Implement `dealGame` and `checkGameMove` in `shared/src/games.ts`**
  - `dealGame`, with `n = roundSizeFor(game, pool)`, in this random-call order:
    - Matching:
      1. `dealt = shuffle(matchingPairs(pool), random).slice(0, n)`. `lefts` = the dealt lefts, in dealt order.
      2. Distractors: collect from the dealt pairs' items (pool order, then authored order). Remove duplicates and any text equal to a dealt right, `shuffle`, and keep the first `MAX_MATCH_DISTRACTORS`.
      3. `rights = shuffle([...dealt rights, ...distractors], random)`. Repeated texts stay as separate entries.
    - Other templates: `itemIds = shuffle(pool, random).slice(0, n).map((i) => i.id)`.
  - `checkGameMove`:
    - Matching: the move needs `left`, and that left must be a `matchingPairs(pool)` left. The right must be in the pool's matching items' pair rights, including pairs shadowed by first-left-wins, or in their distractors. Return `{ correct: pair.right === right }` with no `expected` field.
    - Other templates: the move needs `itemId`, in `pool`. Return `checkAnswer(item, move.answer)`.
  - Add `dealGame` and `checkGameMove` to `index.ts`'s games value export, and `GameDeal` and `GameMoveResult` to its type export. Each function gets a JSDoc, and `checkGameMove`'s includes a `Raises:` section.

- [ ] **Step 4: Run tests and confirm they pass**

`npx vitest run shared/test/games.test.ts` → PASS. Then `npm test` and `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**
```bash
git add shared/src/games.ts shared/src/index.ts shared/test/games.test.ts
git commit -m "feat: deal game rounds and check single game moves"
```

---

### Task 9: Game scoring

**Files:**
- Modify: `shared/src/games.ts`, `shared/src/index.ts`
- Test: `shared/test/games.test.ts`

**Interfaces:**
- Consumes: `GamePlay` (Task 6); `gameSettings`, `roundSizeFor`, `matchingPairs` (Task 4's Interfaces); `checkGameMove`, `dealGame` (Task 8's Interfaces).
- Produces:
```ts
interface GameResult { template: Game["template"]; score: number; correctCount: number; total: number;
  mistakes: number; completed: boolean; timedOut: boolean; elapsedSeconds: number }
function scoreGame(game: Game, pool: readonly CheckableItem[], play: GamePlay, elapsedSeconds: number): GameResult;
```
  `scoreGame` checks in this order and throws with these exact messages:
  1. `play template "<t>" does not match game template "<t>"`
  2. `the deal must hold <n> distinct units of this game`
  3. `pick for an undealt or already matched left "<left>"`, or `answer for an undealt or already answered item "<id>"`
  4. any `checkGameMove` throw, propagated

  Used by: Task 16 (the game branch of `POST /api/attempts`, where a throw maps to 422).

- [ ] **Step 1: Write the failing tests**

Append to `shared/test/games.test.ts`:
```ts
const pick = (left: string, right: string) => ({ left, right });
const mPlay = (lefts: string[], picks: { left: string; right: string }[]): GamePlay => ({ template: "matching", lefts, picks });
const mcA = { itemId: "mc1", answer: { type: "multiple-choice" as const, optionId: "a" } };
const perfect = mPlay(["a", "b", "c"], [pick("a", "1"), pick("b", "2"), pick("c", "3")]);
```
```ts
it("scores matching as matched / (dealt + mistakes)", () => {
  expect(scoreGame(gMatch, pool(gMatch), mPlay(["b", "a", "c"], [pick("a", "2"), pick("a", "1"), pick("b", "2"), pick("c", "3")]), 42))
    .toEqual({ template: "matching", score: 0.75, correctCount: 3, total: 3, mistakes: 1, completed: true, timedOut: false, elapsedSeconds: 42 });
  expect(scoreGame(gMatch, pool(gMatch), perfect, 9)).toMatchObject({ score: 1, mistakes: 0, completed: true });
  expect(scoreGame(gMatch, pool(gMatch), mPlay(["a", "b", "c"], [pick("a", "x"), pick("a", "1"), pick("b", "2")]), 9))
    .toMatchObject({ score: 0.5, correctCount: 2, mistakes: 1, completed: false });
});
it("clamps elapsed time to the limit and never scores time", () => {
  const timed = { ...gMatch, settings: { timeLimitSeconds: 30 } };
  expect(scoreGame(timed, pool(timed), perfect, 45)).toMatchObject({ score: 1, elapsedSeconds: 30, timedOut: true });
  expect(scoreGame(timed, pool(timed), perfect, 30)).toMatchObject({ elapsedSeconds: 30, timedOut: true });
  expect(scoreGame(timed, pool(timed), perfect, 29)).toMatchObject({ elapsedSeconds: 29, timedOut: false });
  expect(scoreGame(gMatch, pool(gMatch), perfect, 400)).toMatchObject({ elapsedSeconds: 400, timedOut: false });
});
it("keeps multi-select partial credit in a timed round", () =>
  expect(scoreGame(gSpeed, pool(gSpeed), { template: "timed-round", itemIds: ["ms1", "mc1"],
    answers: [{ itemId: "ms1", answer: { type: "multi-select", optionIds: ["a"] } }, mcA] }, 61))
    .toEqual({ template: "timed-round", score: 0.75, correctCount: 1, total: 2, mistakes: 1, completed: true, timedOut: true, elapsedSeconds: 60 }));
it("scores order-it by position and an unanswered item as 0", () => {
  const r = scoreGame(gOrder, pool(gOrder), { template: "order-it", itemIds: ["ord1"],
    answers: [{ itemId: "ord1", answer: { type: "ordering", orderedIds: ["s1", "s3", "s2"] } }] }, 5);
  expect(r.score).toBeCloseTo(1 / 3, 12);
  expect(r).toMatchObject({ correctCount: 0, mistakes: 1, completed: true });
  expect(scoreGame(gSpeed, pool(gSpeed), { template: "timed-round", itemIds: ["mc1", "ms1"], answers: [mcA] }, 5))
    .toMatchObject({ score: 0.5, correctCount: 1, mistakes: 0, completed: false });
});
it("rejects plays the deal could not have produced", () => {
  const cases: [Game, GamePlay, string][] = [
    [gSpeed, { template: "order-it", itemIds: ["mc1", "ms1"], answers: [] }, 'play template "order-it" does not match game template "timed-round"'],
    [gMatch, mPlay(["a", "b"], []), "the deal must hold 3 distinct units of this game"],
    [gMatch, mPlay(["a", "b", "q"], []), "the deal must hold 3 distinct units of this game"],
    [gSpeed, { template: "timed-round", itemIds: ["mc1", "mc1"], answers: [] }, "the deal must hold 2 distinct units of this game"],
    [gSpeed, { template: "timed-round", itemIds: ["mc1", "zz"], answers: [] }, "the deal must hold 2 distinct units of this game"],
    [gSpeed2, { template: "timed-round", itemIds: ["mc1", "ms1"], answers: [{ ...mcA, itemId: "mc2" }] }, 'answer for an undealt or already answered item "mc2"'],
    [gSpeed, { template: "timed-round", itemIds: ["mc1", "ms1"], answers: [mcA, mcA] }, 'answer for an undealt or already answered item "mc1"'],
    [gMatchSmall, mPlay(["a", "b"], [pick("c", "3")]), 'pick for an undealt or already matched left "c"'],
    [gMatch, mPlay(["a", "b", "c"], [pick("a", "1"), pick("a", "1")]), 'pick for an undealt or already matched left "a"'],
    [gMatch, mPlay(["a", "b", "c"], [pick("a", "nope")]), 'unknown matching choice "nope"'],
  ];
  for (const [g, play, message] of cases) expect(() => scoreGame(g, pool(g), play, 0)).toThrow(message);
});
it("accepts every genuine deal", () => {
  const rightOf = new Map(matchingPairs(pool(gMatchM)).map((p) => [p.left, p.right]));
  for (let s = 1; s <= 20; s++) {
    for (const g of [gMatchM, gMatchSmall]) {
      const d = matchDeal(g, s);
      expect(scoreGame(g, pool(g), mPlay(d.lefts, d.lefts.map((l) => pick(l, rightOf.get(l)!))), 0).score).toBe(1);
    }
    const d = itemDeal(gSpeed2, s);
    expect(scoreGame(gSpeed2, pool(gSpeed2), { template: "timed-round", itemIds: d.itemIds, answers: [] }, 0)).toMatchObject({ score: 0, total: 2 });
  }
});
```

- [ ] **Step 2: Run them and confirm they fail**

`npx vitest run shared/test/games.test.ts` → FAIL with `TypeError: … scoreGame is not a function`. The Task 4 and Task 8 tests still pass.

- [ ] **Step 3: Implement `scoreGame` in `shared/src/games.ts`**
  - With `n = roundSizeFor(game, pool)`, check the template, then the deal:
    - matching: `play.lefts` must be exactly `n` distinct `matchingPairs(pool)` lefts;
    - otherwise: `play.itemIds` must be exactly `n` distinct pool ids.
  - Matching replays picks in order:
    - a pick on an undealt or already-matched left throws;
    - otherwise `checkGameMove` decides; a correct pick matches the left, and a wrong one adds a mistake;
    - `score = matched / (n + mistakes)`, `correctCount = matched`, `completed = matched === n`.
  - Timed-round and order-it:
    - an answer for an undealt or already-answered id throws;
    - otherwise the `CheckResult.score` from `checkGameMove` is summed;
    - `score = Σ / n` (unanswered items count 0), `correctCount` counts `.correct`, `mistakes = answered − correctCount`, `completed = answered === n`.
  - `total = n`.
  - Time, with `limit = gameSettings(game).timeLimitSeconds`:
    - stored `elapsedSeconds = limit === null ? elapsed : Math.min(elapsed, limit)`;
    - `timedOut = limit !== null && elapsed >= limit`;
    - time never enters the score.
  - Add `scoreGame` and `GameResult` to `index.ts`. JSDoc whose `Raises:` names the four failures.

- [ ] **Step 4: Run tests and confirm they pass**

`npx vitest run shared/test/games.test.ts` → PASS. Then `npm test` and `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**
```bash
git add shared/src/games.ts shared/src/index.ts shared/test/games.test.ts
git commit -m "feat: score game plays in shared"
```

---

### Task 10: Server — JSON body helper, progress and attempt hardening

**Files:**
- Create: `server/src/http.ts`
- Modify: `server/src/routes/lessons.ts`. The progress route parses its body before the lesson lookup. This replaces the lookup-then-destructure at :36-41, including `bad_request` at :40. Every error response goes through `apiError`. Typed rows replace the `as any` casts at :13, :20 and :25.
- Modify: `server/src/routes/attempts.ts`. `parseJsonBody` replaces :10-19. A typed row replaces the cast at :21. The 404 and 422 responses use `apiError` and keep today's messages.
- Test: `server/test/api.lessons.test.ts`

**Interfaces:**
- Consumes:
  - `progressRequestSchema` (Task 6): `z.object({ status: z.enum(["in-progress", "completed"]) }).strict()`
  - `attemptRequestSchema` (`shared/src/checking.ts:19-23`)
  - `type AppEnv` (`server/src/app.ts:8`)
  - the `Item` and `LessonFrontmatter` types from `@study/shared`
- Produces (`server/src/http.ts`):
  - `export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response }`
  - `apiError(c: Context, status: 400 | 404 | 422, code: "invalid_request" | "not_found" | "not_checkable", message: string): Response`. It returns `c.json({ error: { code, message } }, status)`.
  - `parseJsonBody<S extends z.ZodTypeAny>(c: Context<AppEnv>, schema: S, invalidMessage: string): Promise<Parsed<z.output<S>>>`
  - `parseQuery<S extends z.ZodTypeAny>(c: Context<AppEnv>, schema: S, invalidMessage: string): Parsed<z.output<S>>`. It runs the same check on `c.req.query()`.
  - Fixed messages:
    - malformed JSON → `"request body must be valid JSON"`
    - progress → `"request body is not a valid progress update"`
    - attempts keeps `"request body is not a valid attempt"`

- [ ] **Step 1: Write the failing tests.** Append to `server/test/api.lessons.test.ts`:

```ts
describe("request bodies", () => {
  const raw = (path: string, body: string) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body });
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;

  it("400s malformed, null and invalid progress bodies without writing", async () => {
    const cases: [string, string][] = [
      ["{not json", "request body must be valid JSON"],
      ["null", "request body is not a valid progress update"],
      [JSON.stringify({ status: "done" }), "request body is not a valid progress update"],
      [JSON.stringify({ status: "completed", extra: 1 }), "request body is not a valid progress update"],
    ];
    for (const [body, message] of cases) {
      const res = await raw("/api/lessons/demo/intro/progress", body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toEqual({ code: "invalid_request", message });
    }
    expect(count("lesson_progress")).toBe(0);
  });

  it("reads the progress body before looking up the lesson", async () => {
    expect((await raw("/api/lessons/demo/ghost/progress", JSON.stringify({ status: "done" }))).status).toBe(400);
    expect((await raw("/api/lessons/demo/ghost/progress", JSON.stringify({ status: "completed" }))).status).toBe(404);
  });

  it("400s malformed and null attempt bodies without writing", async () => {
    const bad = await raw("/api/attempts", "{not json");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toEqual({ code: "invalid_request", message: "request body must be valid JSON" });
    const nul = await raw("/api/attempts", "null");
    expect((await nul.json()).error).toEqual({ code: "invalid_request", message: "request body is not a valid attempt" });
    expect(count("attempts")).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run server/test/api.lessons.test.ts`. The two progress tests FAIL for these reasons:
  - malformed and `null` bodies return 500 `internal`;
  - `{status:"done"}` returns the code `bad_request`;
  - `ghost` returns 404 before its body is read.

  The attempt-body test already passes. It pins today's behaviour across the refactor.
- [ ] **Step 3: Implement `parseJsonBody`, `parseQuery` and `apiError` in `server/src/http.ts`.**
  - `parseJsonBody` awaits `c.req.json()` inside try/catch. A throw returns 400 `invalid_request` with the fixed JSON message. It then runs `schema.safeParse`. Any failure, JSON `null` included, returns 400 `invalid_request` with `invalidMessage`.
  - `zod` types come in with `import type { z } from "zod"`. Every export gets JSDoc (Args/Returns).
  - `lessons.ts`: the progress handler calls `parseJsonBody(c, progressRequestSchema, "request body is not a valid progress update")` first, then the lesson lookup. The sticky upsert at :42-50 does not change. Row types:
    - :13 → `{ id: string; frontmatter: string; body: string } | undefined`, with the frontmatter parsed `as LessonFrontmatter`;
    - :20 → `{ data: string } | undefined`;
    - :25 → `{ status: "in-progress" | "completed" } | undefined`.
  - `attempts.ts`: call `parseJsonBody(c, attemptRequestSchema, "request body is not a valid attempt")`. Type the row at :21 as `{ data: string } | undefined`, then `JSON.parse(row.data) as Item`.
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/api.lessons.test.ts && npm run typecheck` → 13 passed, and tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/http.ts server/src/routes/lessons.ts server/src/routes/attempts.ts server/test/api.lessons.test.ts
git commit -m "fix: parse progress and attempt bodies through one JSON helper"
```

---

### Task 11: Server — grade hardening

**Files:**
- Modify: `server/src/routes/review.ts`:
  - `parseJsonBody` replaces :70-73;
  - the lookup at :74-77 selects `data` and rejects 'back' on a one-sided card;
  - `bad_request` at :64 becomes `invalid_request`;
  - typed rows replace the casts at :22 and :81;
  - the `rating as Rating` cast at :86 goes.
- Test: `server/test/api.review.test.ts`

**Interfaces:**
- Consumes:
  - `gradeRequestSchema` (Task 6): `z.object({ packageId: idSchema, itemId: idSchema, direction: z.enum(["front", "back"]), rating: ratingSchema }).strict()`
  - `parseJsonBody`, `apiError` (Task 10)
  - `FlashcardItem` (`shared/src/items.ts:188`)
- Produces, the `POST /api/review/grade` contract. No rejection writes `card_state` or `review_log`.
  - 400 `invalid_request` "request body is not a valid grade" for any body the schema rejects.
  - 404 `not_found` "unknown flashcard", unchanged.
  - 404 `not_found` "this flashcard has no back→front card" when `direction === "back"` and `reverse !== true`.

  `GET /api/review/free-study` with no packageId returns 400 `invalid_request` "packageId required". Stage 3's `LIVE.cardState` relies on this rule: back-direction state is live only when `reverse === true`.

- [ ] **Step 1: Write the failing tests.** Append to `server/test/api.review.test.ts`:

```ts
describe("grade hardening", () => {
  const raw = (body: string) =>
    app.request("/api/review/grade", { method: "POST", headers: { "content-type": "application/json" }, body });
  const writes = () => ({
    state: (db.prepare("SELECT COUNT(*) n FROM card_state").get() as { n: number }).n,
    log: (db.prepare("SELECT COUNT(*) n FROM review_log").get() as { n: number }).n,
  });
  const ok = { packageId: "demo", itemId: "card1", direction: "front", rating: "good" };

  it("400s malformed, null and mistyped grades without writing", async () => {
    for (const body of ["{not json", "null", JSON.stringify({ ...ok, itemId: 5 }),
      JSON.stringify({ ...ok, itemId: "x".repeat(65) }), JSON.stringify({ ...ok, extra: true })]) {
      const res = await raw(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
    expect(writes()).toEqual({ state: 0, log: 0 });
  });

  it("404s a back grade on a one-sided card and writes nothing", async () => {
    const items = [...JSON.parse(GOOD_FILES["items.json"] as string),
      { id: "card2", type: "flashcard", front: "gato", back: "cat" }];
    await app.request("/api/packages/import", {
      method: "POST", body: new Uint8Array(makeZip({ ...GOOD_FILES, "items.json": JSON.stringify(items) })) });
    const res = await raw(JSON.stringify({ ...ok, itemId: "card2", direction: "back" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({ code: "not_found", message: "this flashcard has no back→front card" });
    expect(writes()).toEqual({ state: 0, log: 0 });
    expect((await raw(JSON.stringify({ ...ok, itemId: "card2" }))).status).toBe(200);
  });

  it("still grades the back of a reverse card", async () => {
    expect((await grade("back", "good")).status).toBe(200);
    expect(db.prepare("SELECT item_id, direction FROM card_state").all()).toEqual([{ item_id: "card1", direction: "back" }]);
  });

  it("400s free study without a packageId as invalid_request", async () => {
    const res = await app.request("/api/review/free-study");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual({ code: "invalid_request", message: "packageId required" });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run server/test/api.review.test.ts`. These FAIL:
  - malformed and `null` bodies return 500;
  - `itemId: 5` reaches SQLite and returns 404;
  - card2's back grade returns 200 and writes rows;
  - free-study's code is `bad_request`.

  "still grades the back of a reverse card" already passes.
- [ ] **Step 3: Implement grade hardening in `server/src/routes/review.ts`.**
  - The handler calls `parseJsonBody(c, gradeRequestSchema, "request body is not a valid grade")` first.
  - The lookup becomes `SELECT data FROM items WHERE package_id = ? AND id = ? AND type = 'flashcard'`, typed `{ data: string } | undefined` and parsed `as FlashcardItem`.
  - The 'back' check runs before the prior state is read.
  - Two row interfaces:
    - for :22, `interface CardJoinRow { package_id: string; id: string; data: string; due_at: string | null; has_state: string | null; state_dir: "front" | "back" | null; interval_days: number | null; ease: number | null; reps: number | null; lapses: number | null }`. The regroup reads the state columns inside `if (r.has_state)` with `!`.
    - for :81, `interface CardStateRow { interval_days: number; ease: number; reps: number; lapses: number; due_at: string }`.
  - free-study at :64 uses `apiError(c, 400, "invalid_request", "packageId required")`.
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/api.review.test.ts && npm run typecheck` → 11 passed, and tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/routes/review.ts server/test/api.review.test.ts
git commit -m "fix: reject malformed grades and back grades on one-sided cards"
```

---

### Task 12: Server — content readers and the play fixture

**Files:**
- Create: `server/src/content.ts`
- Modify: `server/test/helpers.ts` (add `PLAY_FILES` after `GOOD_FILES`, :17-32)
- Test: `server/test/content.test.ts` (new)

**Interfaces:**
- Consumes:
  - `resolveGameItems(game: Game, items: readonly Item[]): CheckableItem[]` and `GAME_COMPAT: Record<Game["template"], Item["type"][]>` (Task 4)
  - `quizItemIds(quiz: Quiz): string[]` (Task 7)
  - `CheckableItem` (Task 3)
  - `type Db` (`server/src/db.ts:6`)
  - `importPackage` (`server/src/importer.ts:7`)
- Produces (`server/src/content.ts`, typed casts such as `as { data: string } | undefined`):
  - `getItem(db: Db, packageId: string, itemId: string): Item | null`
  - `getPackageItems(db: Db, packageId: string, types?: readonly ItemType[]): Item[]`. It sorts by `ORDER BY ord`. Passing `types` adds `AND type IN (?, …)`.
  - `getQuiz(db: Db, packageId: string, quizId: string): { quiz: Quiz; items: Map<string, Item> } | null`. The map is filled with `getItem` in `quizItemIds(quiz)` order. An id with no row is left out, so `scoreQuiz` throws on it (Task 15).
  - `getGame(db: Db, packageId: string, gameId: string): { game: Game; pool: CheckableItem[] } | null`. It returns `resolveGameItems(game, getPackageItems(db, packageId, GAME_COMPAT[game.template]))`. The type filter runs in SQL.
  - `listQuizzes(db: Db, packageId: string): Quiz[]` and `listGames(db: Db, packageId: string): Game[]`, both `ORDER BY ord`.
- Produces (`server/test/helpers.ts`): `PLAY_FILES: Record<string, string | Buffer>`, exactly as below. Tasks 13–18 assert against these values. ms1 is tagged `m`, so g-match's tag source holds an incompatible item that resolution must drop.

```ts
export const PLAY_FILES: Record<string, string | Buffer> = {
  ...GOOD_FILES,
  "items.json": JSON.stringify([
    ...JSON.parse(GOOD_FILES["items.json"] as string), // mc1 (a correct, b), card1 (reverse)
    { id: "ms1", type: "multi-select", prompt: "Pick two", partialCredit: true, tags: ["m"], options: [
      { id: "a", text: "A", correct: true }, { id: "b", text: "B", correct: true },
      { id: "c", text: "C" }, { id: "d", text: "D" }] },
    { id: "fb1", type: "fill-blank", prompt: "Fill", template: "{{1}} and {{2}}",
      blanks: [{ slot: 1, accept: ["salt"] }, { slot: 2, accept: ["pepper"] }] },
    { id: "sa1", type: "short-answer", prompt: "Say yes", accept: ["yes"] },
    { id: "ord1", type: "ordering", prompt: "Order", steps: [
      { id: "s1", text: "One" }, { id: "s2", text: "Two" }, { id: "s3", text: "Three" }] },
    { id: "mat1", type: "matching", prompt: "Match", tags: ["m"], distractors: ["quack"], pairs: [
      { left: "cat", right: "meow" }, { left: "dog", right: "woof" }, { left: "cow", right: "moo" }] },
    { id: "mat2", type: "matching", prompt: "Match more", tags: ["m"], pairs: [
      { left: "sheep", right: "baa" }, { left: "owl", right: "hoot" }] },
  ]),
  "quizzes.json": JSON.stringify([
    { id: "quiz-all", title: "All types", description: "Every checkable type",
      items: ["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"], passThreshold: 0.5, timeLimitSeconds: 60 },
    { id: "quiz-plain", title: "Plain", items: ["mc1"] },
  ]),
  "games.json": JSON.stringify([
    { id: "g-match", template: "matching", title: "Match", source: { tags: ["m"] } },
    { id: "g-small", template: "matching", title: "Small", source: { itemIds: ["mat1"] }, settings: { roundSize: 2 } },
    { id: "g-speed", template: "timed-round", title: "Speed", source: { itemIds: ["mc1", "ms1"] } },
    { id: "g-order", template: "order-it", title: "Order", source: { itemIds: ["ord1"] } },
  ]),
};
```

- [ ] **Step 1: Write the failing tests.** Create `server/test/content.test.ts`. It imports `beforeEach, expect, it` from vitest; the six readers from `../src/content.js`; `type Db`; `importPackage`; and `freshDb, makeZip, PLAY_FILES` from `./helpers.js`.

```ts
let db: Db;
beforeEach(() => {
  db = freshDb();
  expect(importPackage(db, makeZip(PLAY_FILES))).toEqual({ ok: true, packageId: "demo" });
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

it("getItem reads one item, or null for an unknown item or package", () => {
  expect(getItem(db, "demo", "ms1")).toMatchObject({ type: "multi-select", partialCredit: true });
  expect(getItem(db, "demo", "nope")).toBeNull();
  expect(getItem(db, "other", "mc1")).toBeNull();
});
it("getPackageItems follows ord, optionally filtered by type", () => {
  expect(ids(getPackageItems(db, "demo"))).toEqual(["mc1", "card1", "ms1", "fb1", "sa1", "ord1", "mat1", "mat2"]);
  expect(ids(getPackageItems(db, "demo", ["matching", "ordering"]))).toEqual(["ord1", "mat1", "mat2"]);
  db.transaction(() => {
    db.prepare("UPDATE items SET ord = ord + 100 WHERE package_id = 'demo'").run();
    db.prepare("UPDATE items SET ord = CASE id WHEN 'mat2' THEN 0 ELSE ord - 99 END WHERE package_id = 'demo'").run();
  })();
  expect(ids(getPackageItems(db, "demo"))[0]).toBe("mat2");
});
it("getQuiz returns the quiz and its items in quiz order", () => {
  const found = getQuiz(db, "demo", "quiz-all")!;
  expect(found.quiz.passThreshold).toBe(0.5);
  expect([...found.items.keys()]).toEqual(["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"]);
  expect(getQuiz(db, "demo", "ghost")).toBeNull();
});
it("getGame resolves only compatible items, in resolver order", () => {
  expect(ids(getGame(db, "demo", "g-match")!.pool)).toEqual(["mat1", "mat2"]); // ms1 is tagged m, not matching
  expect(ids(getGame(db, "demo", "g-speed")!.pool)).toEqual(["mc1", "ms1"]);
  expect(getGame(db, "demo", "g-small")!.game.settings).toEqual({ roundSize: 2 });
  expect(getGame(db, "demo", "ghost")).toBeNull();
});
it("getGame keeps an itemIds source's listed order and drops repeats and incompatible ids", () => {
  const games = [...JSON.parse(PLAY_FILES["games.json"] as string),
    { id: "g-mixed", template: "timed-round", title: "Mixed", source: { itemIds: ["ms1", "card1", "ms1", "mc1"] } }];
  importPackage(db, makeZip({ ...PLAY_FILES, "games.json": JSON.stringify(games) }));
  expect(ids(getGame(db, "demo", "g-mixed")!.pool)).toEqual(["ms1", "mc1"]);
});
it("lists quizzes and games in package order", () => {
  expect(ids(listQuizzes(db, "demo"))).toEqual(["quiz-all", "quiz-plain"]);
  expect(ids(listGames(db, "demo"))).toEqual(["g-match", "g-small", "g-speed", "g-order"]);
  expect(listQuizzes(db, "other")).toEqual([]);
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run server/test/content.test.ts` → FAIL, because `../src/content.js` cannot be resolved and `PLAY_FILES` is not exported.
- [ ] **Step 3: Implement the readers in `server/src/content.ts` and add `PLAY_FILES` to `server/test/helpers.ts`.** Use the signatures under Produces. Each reader runs one prepared statement and `JSON.parse`s `data`. The `IN` placeholders come from `types.length`. Every export gets JSDoc.
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/content.test.ts && npm run typecheck` → 6 passed, and tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/content.ts server/test/helpers.ts server/test/content.test.ts
git commit -m "feat: add typed content readers and the play fixture"
```

---

### Task 13: Server — quiz and game read routes

**Files:**
- Create: `server/src/routes/quizzes.ts`, `server/src/routes/games.ts`
- Modify: `server/src/app.ts`. Import both factories after :6 and mount `/api/quizzes` and `/api/games` after :23.
- Test: `server/test/api.play.test.ts` (new)

**Interfaces:**
- Consumes:
  - `getQuiz`, `getGame` (Task 12)
  - `gameSettings(game: Game): GameSettings`, where `GameSettings = { roundSize: number; timeLimitSeconds: number | null }` (Task 4)
  - `apiError` (Task 10)
- Produces:
  - `quizRoutes(): Hono<AppEnv>`, serving `GET /:packageId/:quizId`. It returns 200 `{ quiz: Quiz; items: Record<string, Item> }`, with keys in `quizItemIds` order, or 404 `not_found` "unknown quiz".
  - `gameRoutes(): Hono<AppEnv>`, serving `GET /:packageId/:gameId`. It returns 200 `{ game: Game; settings: GameSettings; items: CheckableItem[] }`, where `items` is the resolved pool, or 404 `not_found` "unknown game".

  Items are sent whole, answer keys included (decision 5). Task 21's `QuizPayload` and `GamePayload` mirror these shapes.

- [ ] **Step 1: Write the failing tests.** Create `server/test/api.play.test.ts`. It imports `beforeEach, describe, expect, it` from vitest, `createApp`, `type Db`, and `freshDb, makeZip, PLAY_FILES` from `./helpers.js`. Later tasks add describe blocks to it.

```ts
let db: Db;
let app: ReturnType<typeof createApp>;
beforeEach(async () => {
  db = freshDb();
  app = createApp(db);
  const res = await app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(PLAY_FILES)) });
  expect(res.status).toBe(201);
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("quiz and game reads", () => {
  it("returns a quiz with its whole items keyed by id, in quiz order", async () => {
    const res = await app.request("/api/quizzes/demo/quiz-all");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quiz).toMatchObject({ id: "quiz-all", passThreshold: 0.5, timeLimitSeconds: 60 });
    expect(Object.keys(body.items)).toEqual(["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"]);
    expect(body.items.mc1.options[0]).toEqual({ id: "a", text: "A", correct: true });
  });
  it("returns each game's effective settings and pool", async () => {
    const get = async (id: string) => (await app.request(`/api/games/demo/${id}`)).json();
    const match = await get("g-match");
    expect(match.game.id).toBe("g-match");
    expect(match.settings).toEqual({ roundSize: 6, timeLimitSeconds: null });
    expect(ids(match.items)).toEqual(["mat1", "mat2"]);
    const speed = await get("g-speed");
    expect(speed.settings).toEqual({ roundSize: 10, timeLimitSeconds: 60 });
    expect(ids(speed.items)).toEqual(["mc1", "ms1"]);
    expect((await get("g-order")).settings).toEqual({ roundSize: 3, timeLimitSeconds: null });
  });
  it("reports g-small's authored roundSize", async () => {
    const small = await (await app.request("/api/games/demo/g-small")).json();
    expect(small.settings).toEqual({ roundSize: 2, timeLimitSeconds: null });
    expect(ids(small.items)).toEqual(["mat1"]);
  });
  it("404s unknown quizzes and games", async () => {
    const cases: [string, string][] = [
      ["/api/quizzes/demo/ghost", "unknown quiz"], ["/api/quizzes/other/quiz-all", "unknown quiz"],
      ["/api/games/demo/ghost", "unknown game"], ["/api/games/other/g-match", "unknown game"]];
    for (const [path, message] of cases) {
      const res = await app.request(path);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toEqual({ code: "not_found", message });
    }
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run server/test/api.play.test.ts` → FAIL. No route is mounted, so every request gets `app.notFound`'s 404 "no such route or resource" (`app.ts:19`).
- [ ] **Step 3: Implement `quizRoutes()` and `gameRoutes()`.** Each is a factory shaped like `packageRoutes` (`server/src/routes/packages.ts:11-12,79`). The quiz route returns `{ quiz, items: Object.fromEntries(found.items) }`. The game route returns `{ game, settings: gameSettings(game), items: pool }`. Mount both in `app.ts`.
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/api.play.test.ts && npm run typecheck` → 4 passed, and tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/routes/quizzes.ts server/src/routes/games.ts server/src/app.ts server/test/api.play.test.ts
git commit -m "feat: serve quizzes and games"
```

---

### Task 14: Server — per-move game check

**Files:**
- Modify: `server/src/routes/games.ts` (add `POST /:packageId/:gameId/check`)
- Test: `server/test/api.play.test.ts`

**Interfaces:**
- Consumes:
  - `gameMoveSchema` and `GameMove` (Task 6): `z.union([gameItemAnswerSchema, matchPickSchema])`
  - `checkGameMove(game: Game, pool: readonly CheckableItem[], move: GameMove): GameMoveResult`, with `GameMoveResult = CheckResult | { correct: boolean }` (Task 8)
  - `getGame` (Task 12)
  - `parseJsonBody`, `apiError` (Task 10)
- Produces: `POST /api/games/:packageId/:gameId/check`. It writes nothing, and Task 21's web client `checkMove` calls it.
  - 200 returns a `GameMoveResult`. A matching pick returns exactly `{ correct }`, with no `expected`.
  - 400 `invalid_request` "request body is not a valid game move".
  - 404 `not_found` "unknown game".
  - 422 `not_checkable` with the thrown message.

- [ ] **Step 1: Write the failing tests.** Append to `server/test/api.play.test.ts`. Put the two helpers at module level, because Tasks 15–17 reuse them.

```ts
const send = (path: string, body: unknown) => app.request(path, {
  method: "POST", headers: { "content-type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const attemptCount = () => (db.prepare("SELECT COUNT(*) n FROM attempts").get() as { n: number }).n;

describe("game move checks", () => {
  const check = (gameId: string, move: unknown) => send(`/api/games/demo/${gameId}/check`, move);
  it("judges a matching pick without revealing the pair", async () => {
    expect(await (await check("g-match", { left: "cat", right: "meow" })).json()).toEqual({ correct: true });
    expect(await (await check("g-match", { left: "cat", right: "woof" })).json()).toEqual({ correct: false });
    expect(await (await check("g-match", { left: "cat", right: "quack" })).json()).toEqual({ correct: false });
    expect(attemptCount()).toBe(0);
  });
  it("checks a timed-round answer through checkAnswer", async () => {
    const mc = await check("g-speed", { itemId: "mc1", answer: { type: "multiple-choice", optionId: "a" } });
    expect(mc.status).toBe(200);
    expect(await mc.json()).toMatchObject({ correct: true, score: 1, expected: "a" });
    const ms = await check("g-speed", { itemId: "ms1", answer: { type: "multi-select", optionIds: ["a"] } });
    expect(await ms.json()).toMatchObject({ correct: false, score: 0.5, expected: ["a", "b"] });
    expect(attemptCount()).toBe(0);
  });
  it("422s moves outside the pool or of the wrong shape", async () => {
    const cases: [string, unknown][] = [
      ["g-match", { left: "bird", right: "meow" }],                                  // unknown left
      ["g-small", { left: "sheep", right: "baa" }],                                  // left outside this pool
      ["g-match", { itemId: "mat1", answer: { type: "matching", pairs: [] } }],       // item move on matching
      ["g-speed", { itemId: "card1", answer: { type: "short-answer", text: "x" } }], // not in the pool
      ["g-speed", { left: "cat", right: "meow" }],                                   // pick on timed-round
    ];
    for (const [gameId, move] of cases) {
      const res = await check(gameId, move);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("not_checkable");
    }
    const right = await check("g-small", { left: "cat", right: "baa" }); // mat2's right, not g-small's
    expect(right.status).toBe(422);
    expect((await right.json()).error.message).toMatch(/unknown matching choice/);
    expect(attemptCount()).toBe(0);
  });
  it("400s malformed moves before looking up the game", async () => {
    for (const move of ["{not json", "null", { left: "cat" }, { left: "cat", right: "meow", extra: 1 },
      { left: "x".repeat(2001), right: "meow" }, { itemId: "sa1", answer: { type: "short-answer", text: "y".repeat(201) } }]) {
      const res = await check("g-match", move);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
    expect((await check("ghost", { left: "cat" })).status).toBe(400);
  });
  it("404s an unknown game", async () => {
    const res = await check("ghost", { left: "cat", right: "meow" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toEqual({ code: "not_found", message: "unknown game" });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run server/test/api.play.test.ts` → the five new tests FAIL, because the POST has no route and returns 404.
- [ ] **Step 3: Implement the check route in `server/src/routes/games.ts`.** The handler runs these steps in order:
  1. `parseJsonBody(c, gameMoveSchema, "request body is not a valid game move")`
  2. `getGame`, which returns 404 "unknown game" when nothing is found
  3. `checkGameMove(game, pool, move)` inside try/catch; a throw returns 422 `not_checkable` with the error message
  4. `c.json(result)`

  It makes no INSERT.
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/api.play.test.ts && npm run typecheck` → 9 passed, and tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/routes/games.ts server/test/api.play.test.ts
git commit -m "feat: check single game moves on the server"
```

---

### Task 15: Server — quiz submissions and the history index

**Files:**
- Create: `server/src/attemptLog.ts`
- Modify: `server/src/schema.sql`:
  - the comment at :70 becomes `-- exercise: Answer JSON; quiz/game: run record JSON (server/src/attemptLog.ts)`;
  - append `CREATE INDEX IF NOT EXISTS attempts_history ON attempts(package_id, kind, ref_id);` after :81. All three columns are in the table's first definition, so this cannot hit the "no such column" hazard (`db.ts:51-53`).
- Modify: `server/src/routes/attempts.ts`. Add quiz dispatch. The exercise branch uses `getItem` and `insertExerciseAttempt`, replacing :21-32.
- Test: `server/test/api.play.test.ts`, `server/test/db.test.ts`

**Interfaces:**
- Consumes:
  - `quizSubmissionSchema`, `QuizSubmission`, `QuizAnswer` (Task 6)
  - `scoreQuiz(quiz: Quiz, items: ReadonlyMap<string, Item>, answers: readonly QuizAnswer[], elapsedSeconds: number): QuizResult` (Task 7)
  - `getItem`, `getQuiz` (Task 12)
  - `parseJsonBody`, `apiError` (Task 10)
  - `checkAnswer`, `Answer`, `CheckResult` (shared); since Task 2, `checkAnswer` throws `"unsafe regular expression"` for a hazardous stored pattern
- Produces (`server/src/attemptLog.ts`):
  - `interface QuizRunRecord { v: 1; answers: QuizAnswer[]; results: { itemId: string; answered: boolean; correct: boolean; score: number }[]; correctCount: number; answeredCount: number; total: number; passThreshold: number | null; timedOut: boolean; elapsedSeconds: number }`
  - `insertExerciseAttempt(db: Db, packageId: string, itemId: string, answer: Answer, result: CheckResult): void`. It runs the INSERT from `attempts.ts:30-32` unchanged.
  - `insertQuizAttempt(db: Db, submission: QuizSubmission, result: QuizResult): void`. It writes one row with `kind 'quiz'`, `ref_id = quizId`, `item_id NULL`, `score = result.score`, `correct = passed === null ? NULL : passed ? 1 : 0`, `answer = JSON.stringify(QuizRunRecord)` and `at = new Date().toISOString()`.
  - The quiz variant of `POST /api/attempts` returns 200 `QuizResult`, 404 "unknown quiz", or 422 `not_checkable` with scoreQuiz's message.

- [ ] **Step 1: Write the failing tests.** Append to `server/test/api.play.test.ts`. The module-level constants are reused by Tasks 16–17.

```ts
const attempt = (body: unknown) => send("/api/attempts", body);
const QUIZ_IDS = ["mc1", "ms1", "fb1", "sa1", "ord1", "mat1"];
const RIGHT: Record<string, unknown> = {
  mc1: { type: "multiple-choice", optionId: "a" }, ms1: { type: "multi-select", optionIds: ["a", "b"] },
  fb1: { type: "fill-blank", answers: { "1": "salt", "2": "pepper" } }, sa1: { type: "short-answer", text: "yes" },
  ord1: { type: "ordering", orderedIds: ["s1", "s2", "s3"] },
  mat1: { type: "matching", pairs: [{ left: "cat", right: "meow" }, { left: "dog", right: "woof" }, { left: "cow", right: "moo" }] },
};
const quizBody = (answers: Record<string, unknown>, elapsedSeconds = 42) => ({
  kind: "quiz", packageId: "demo", quizId: "quiz-all", elapsedSeconds,
  answers: QUIZ_IDS.map((itemId) => ({ itemId, answer: answers[itemId] ?? null })),
});
const lastAttempt = () => db.prepare("SELECT kind, ref_id, item_id, correct, score, answer FROM attempts ORDER BY id DESC")
  .get() as { kind: string; ref_id: string | null; item_id: string | null; correct: number | null; score: number; answer: string };

describe("quiz submissions", () => {
  it("scores a full run and logs one quiz row with its run record", async () => {
    const body = quizBody(RIGHT);
    const res = await attempt(body);
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toMatchObject({ score: 1, correctCount: 6, answeredCount: 6, total: 6,
      passThreshold: 0.5, passed: true, timedOut: false, elapsedSeconds: 42 });
    expect(result.results.map((r: { itemId: string }) => r.itemId)).toEqual(QUIZ_IDS);
    expect(lastAttempt()).toMatchObject({ kind: "quiz", ref_id: "quiz-all", item_id: null, correct: 1, score: 1 });
    const record = JSON.parse(lastAttempt().answer);
    expect(record).toMatchObject({ v: 1, correctCount: 6, answeredCount: 6, total: 6, passThreshold: 0.5, timedOut: false, elapsedSeconds: 42 });
    expect(record.answers).toEqual(body.answers);
    expect(record.results[0]).toEqual({ itemId: "mc1", answered: true, correct: true, score: 1 });
    expect(attemptCount()).toBe(1);
  });
  it("scores nulls as 0 without checking them, and still returns their key", async () => {
    const result = await (await attempt(quizBody({ mc1: RIGHT.mc1, ms1: { type: "multi-select", optionIds: ["a"] },
      fb1: { type: "fill-blank", answers: { "1": "salt", "2": "" } }, sa1: RIGHT.sa1 }))).json();
    expect(result).toMatchObject({ score: 0.5, passed: true, correctCount: 2, answeredCount: 4 });
    expect(result.results[4]).toEqual({ itemId: "ord1", answered: false, correct: false, score: 0, expected: ["s1", "s2", "s3"] });
    expect(await (await attempt(quizBody({}))).json()).toMatchObject({ score: 0, passed: false, answeredCount: 0 });
    expect(lastAttempt().correct).toBe(0);
  });
  it("gives passed null and correct NULL for a quiz with no threshold", async () => {
    const res = await attempt({ kind: "quiz", packageId: "demo", quizId: "quiz-plain", elapsedSeconds: 5,
      answers: [{ itemId: "mc1", answer: { type: "multiple-choice", optionId: "b" } }] });
    expect(await res.json()).toMatchObject({ score: 0, passThreshold: null, passed: null });
    expect(lastAttempt()).toMatchObject({ ref_id: "quiz-plain", correct: null, score: 0 });
  });
  it("clamps elapsed time to the limit and marks the run timed out", async () => {
    expect(await (await attempt(quizBody(RIGHT, 75))).json()).toMatchObject({ score: 1, elapsedSeconds: 60, timedOut: true });
    expect(JSON.parse(lastAttempt().answer)).toMatchObject({ elapsedSeconds: 60, timedOut: true });
  });
  it("rejects bad quiz runs without writing a row", async () => {
    const body = quizBody({}, 10);
    const a = body.answers;
    const cases: [unknown, number][] = [
      [{ ...body, answers: a.slice(0, 5) }, 422],                                   // mat1 missing
      [{ ...body, answers: [...a, { itemId: "mc1", answer: null }] }, 422],          // mc1 twice
      [{ ...body, answers: [...a, { itemId: "card1", answer: null }] }, 422],        // not in the quiz
      [{ ...body, answers: [{ itemId: "mc1", answer: { type: "multiple-choice", optionId: "z" } }, ...a.slice(1)] }, 422],
      [{ ...body, answers: [...a.slice(0, 3), { itemId: "sa1", answer: { type: "short-answer", text: "y".repeat(201) } }, ...a.slice(4)] }, 400],
      [{ ...body, itemId: "mc1" }, 400], [{ ...body, quizId: "x".repeat(65) }, 400],
      [{ ...body, elapsedSeconds: -1 }, 400], [{ ...body, elapsedSeconds: 86401 }, 400],
      [{ ...body, quizId: "ghost" }, 404],
    ];
    for (const [b, status] of cases) expect((await attempt(b)).status).toBe(status);
    expect((await (await attempt(cases[0]![0])).json()).error)
      .toEqual({ code: "not_checkable", message: "quiz answers must list every quiz item exactly once" });
    expect(attemptCount()).toBe(0);
  });
  it("404s an exercise or a quiz in an unknown item or package, writing nothing", async () => {
    const cases: [unknown, string][] = [
      [{ packageId: "demo", itemId: "ghost", answer: RIGHT.mc1 }, "unknown item"],
      [{ packageId: "other", itemId: "mc1", answer: RIGHT.mc1 }, "unknown item"],
      [{ ...quizBody({}), packageId: "other" }, "unknown quiz"],
    ];
    for (const [b, message] of cases) {
      const res = await attempt(b);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toEqual({ code: "not_found", message });
    }
    expect(attemptCount()).toBe(0);
  });
  it("422s an exercise or a quiz whose stored regex is hazardous, writing nothing", async () => {
    // Import now refuses such a pattern (Task 2), so plant it the way a row imported before Stage 2 could hold it.
    db.prepare("UPDATE items SET data = ? WHERE package_id = 'demo' AND id = 'sa1'").run(JSON.stringify(
      { id: "sa1", type: "short-answer", prompt: "Say yes", match: "regex", accept: ["^yes$", "(a+)+$"] }));
    const exercise = await attempt({ packageId: "demo", itemId: "sa1", answer: RIGHT.sa1 });
    expect(exercise.status).toBe(422);
    expect((await exercise.json()).error).toEqual({ code: "not_checkable", message: "unsafe regular expression" });
    expect((await attempt(quizBody({ sa1: RIGHT.sa1 }))).status).toBe(422);
    expect(attemptCount()).toBe(0);
  });
});
```

Add this test to `server/test/db.test.ts`, following the legacy-DB pattern at :59-83:

```ts
it("adds the attempts history index to a Stage 1 database, idempotently", () => {
  const dir = mkdtempSync(join(tmpdir(), "study-"));
  const legacy = new Database(join(dir, "study.db"));
  legacy.exec(`CREATE TABLE attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, package_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('exercise','quiz','game')), ref_id TEXT, item_id TEXT,
      answer TEXT, correct INTEGER, score REAL, at TEXT NOT NULL);
    INSERT INTO attempts (package_id, kind, item_id, answer, correct, score, at)
      VALUES ('demo', 'exercise', 'mc1', '{}', 1, 1, '2026-08-06T00:00:00.000Z');`);
  legacy.close();
  const db = openDb(dir);
  const cols = (db.prepare("PRAGMA index_info(attempts_history)").all() as { name: string }[]).map((c) => c.name);
  expect(cols).toEqual(["package_id", "kind", "ref_id"]);
  expect(db.prepare("SELECT COUNT(*) n FROM attempts").get()).toEqual({ n: 1 });
  db.close();
  openDb(dir).close();
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run server/test/api.play.test.ts server/test/db.test.ts` → FAIL, for two reasons:
  - quiz bodies get 400 "request body is not a valid attempt", because `attemptRequestSchema` rejects them (the exercise halves of the unknown-item and hazardous-regex tests already pass, through today's 404 at `attempts.ts:22` and 422 at `attempts.ts:25-29`, but their quiz cases get that 400);
  - `index_info` returns `[]`.
- [ ] **Step 3: Implement `insertExerciseAttempt` and `insertQuizAttempt` in `server/src/attemptLog.ts`, and the quiz branch in `attempts.ts`.**
  - `attempts.ts` parses with `z.union([attemptRequestSchema, quizSubmissionSchema])` and the same invalid message. Task 16 swaps this for `attemptBodySchema`.
  - Quiz branch (`"quizId" in body`): `getQuiz` (404 "unknown quiz") → `scoreQuiz(found.quiz, found.items, body.answers, body.elapsedSeconds)` in try/catch (422 with the thrown message) → `insertQuizAttempt` → `c.json(result)`.
  - Exercise branch (otherwise): `getItem` (404 "unknown item") → `checkAnswer` (422 on a throw) → `insertExerciseAttempt`.
  - Each branch's single INSERT runs only after every check passes. JSDoc on every export.
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/api.play.test.ts server/test/db.test.ts server/test/api.lessons.test.ts && npm run typecheck` → 16 + 6 + 13 passed. This includes the legacy exercise tests at `api.lessons.test.ts:57-150`, unchanged. tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/attemptLog.ts server/src/schema.sql server/src/routes/attempts.ts server/test/api.play.test.ts server/test/db.test.ts
git commit -m "feat: score and log quiz submissions"
```

---

### Task 16: Server — game submissions

**Files:**
- Modify: `server/src/attemptLog.ts` (add `GameRunRecord`, `insertGameAttempt`)
- Modify: `server/src/routes/attempts.ts` (parse `attemptBodySchema`; add the game branch; drop Task 15's local union and its `zod` import)
- Test: `server/test/api.play.test.ts`

**Interfaces:**
- Consumes:
  - `attemptBodySchema`, `gameSubmissionSchema`, `GameSubmission`, `GamePlay` (Task 6)
  - `scoreGame(game: Game, pool: readonly CheckableItem[], play: GamePlay, elapsedSeconds: number): GameResult`, with `GameResult = { template; score; correctCount; total; mistakes; completed; timedOut; elapsedSeconds }` (Task 9)
  - `getGame` (Task 12)
- Produces:
  - `interface GameRunRecord { v: 1; template: Game["template"]; play: GamePlay; correctCount: number; total: number; mistakes: number; completed: boolean; timedOut: boolean; elapsedSeconds: number }`
  - `insertGameAttempt(db: Db, submission: GameSubmission, result: GameResult): void`. It writes one row with `kind 'game'`, `ref_id = gameId`, `item_id NULL`, `correct NULL`, `score = result.score`, and `answer = JSON GameRunRecord`.
  - The game variant of `POST /api/attempts` returns 200 `GameResult`, 404 "unknown game", or 422 `not_checkable`.

- [ ] **Step 1: Write the failing tests.** Append to `server/test/api.play.test.ts`. `SMALL_PLAY` and `gameBody` are module-level, because Task 17 reuses them.

```ts
const SMALL_PLAY = { template: "matching", lefts: ["cat", "dog"],
  picks: [{ left: "cat", right: "woof" }, { left: "cat", right: "meow" }, { left: "dog", right: "woof" }] };
const gameBody = (gameId: string, play: unknown, elapsedSeconds = 30) =>
  ({ kind: "game", packageId: "demo", gameId, play, elapsedSeconds });
const speedPlay = (answers: unknown[]) => ({ template: "timed-round", itemIds: ["ms1", "mc1"], answers });

describe("game submissions", () => {
  it("scores a matching play as matched / (dealt + misses) and logs one game row", async () => {
    const res = await attempt(gameBody("g-small", SMALL_PLAY));
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result).toMatchObject({ template: "matching", correctCount: 2, total: 2, mistakes: 1,
      completed: true, timedOut: false, elapsedSeconds: 30 });
    expect(result.score).toBeCloseTo(2 / 3);
    const row = lastAttempt();
    expect(row).toMatchObject({ kind: "game", ref_id: "g-small", item_id: null, correct: null });
    expect(row.score).toBeCloseTo(2 / 3);
    expect(JSON.parse(row.answer)).toEqual({ v: 1, template: "matching", play: SMALL_PLAY, correctCount: 2,
      total: 2, mistakes: 1, completed: true, timedOut: false, elapsedSeconds: 30 });
  });
  it("scores timed-round and order-it answers through checkAnswer", async () => {
    const speed = await (await attempt(gameBody("g-speed", speedPlay([{ itemId: "mc1", answer: RIGHT.mc1 },
      { itemId: "ms1", answer: { type: "multi-select", optionIds: ["a"] } }])))).json();
    expect(speed).toMatchObject({ template: "timed-round", score: 0.75, correctCount: 1, total: 2, mistakes: 1, completed: true });
    const late = await (await attempt(gameBody("g-speed", speedPlay([{ itemId: "mc1", answer: RIGHT.mc1 }]), 61))).json();
    expect(late).toMatchObject({ score: 0.5, completed: false, timedOut: true, elapsedSeconds: 60, mistakes: 0 });
    const order = await (await attempt(gameBody("g-order", { template: "order-it", itemIds: ["ord1"],
      answers: [{ itemId: "ord1", answer: { type: "ordering", orderedIds: ["s1", "s3", "s2"] } }] }))).json();
    expect(order).toMatchObject({ template: "order-it", correctCount: 0, total: 1, mistakes: 1, completed: true });
    expect(order.score).toBeCloseTo(1 / 3);
  });
  it("rejects illegal plays without writing a row", async () => {
    const cases: [unknown, number][] = [
      [gameBody("g-small", { ...SMALL_PLAY, lefts: ["cat"] }), 422],                         // deals 1, not 2
      [gameBody("g-small", { ...SMALL_PLAY, lefts: ["cat", "dog", "cow"] }), 422],           // deals 3
      [gameBody("g-small", { ...SMALL_PLAY, lefts: ["cat", "cat"] }), 422],                  // repeated unit
      [gameBody("g-small", { ...SMALL_PLAY, lefts: ["cat", "sheep"] }), 422],                // not in the pool
      [gameBody("g-small", { ...SMALL_PLAY, picks: [{ left: "cow", right: "moo" }] }), 422], // undealt left
      [gameBody("g-small", { ...SMALL_PLAY, picks: [{ left: "cat", right: "meow" }, { left: "cat", right: "meow" }] }), 422],
      [gameBody("g-speed", speedPlay([{ itemId: "mc1", answer: RIGHT.mc1 }, { itemId: "mc1", answer: RIGHT.mc1 }])), 422],
      [gameBody("g-speed", speedPlay([{ itemId: "card1", answer: { type: "short-answer", text: "x" } }])), 422],
      [gameBody("g-small", { template: "timed-round", itemIds: ["mat1"], answers: [] }), 422], // template mismatch
      [gameBody("ghost", SMALL_PLAY), 404],
      [{ kind: "game", packageId: "demo", gameId: "g-small", elapsedSeconds: 30 }, 400],
      [gameBody("g-small", SMALL_PLAY, -1), 400],
    ];
    for (const [b, status] of cases) expect((await attempt(b)).status).toBe(status);
    expect(attemptCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run server/test/api.play.test.ts` → the three new tests FAIL. Game bodies match neither union member, so they get 400.
- [ ] **Step 3: Implement `insertGameAttempt` and the game branch.**
  - `attempts.ts` parses `attemptBodySchema` and dispatches in this order: `"quizId" in body` → quiz; `"gameId" in body` → game; anything else → exercise.
  - The game branch runs:
    1. `getGame` → 404 "unknown game"
    2. `scoreGame(found.game, found.pool, body.play, body.elapsedSeconds)` in try/catch → 422
    3. `insertGameAttempt`
    4. `c.json(result)`
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/api.play.test.ts server/test/api.lessons.test.ts && npm run typecheck` → 19 + 13 passed, and tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/attemptLog.ts server/src/routes/attempts.ts server/test/api.play.test.ts
git commit -m "feat: score and log game plays"
```

---

### Task 17: Server — GET /api/attempts

**Files:**
- Modify: `server/src/attemptLog.ts` (add `AttemptRow`, `toAttemptRecord`, `VISIBLE_ATTEMPT`, `listAttempts`)
- Modify: `server/src/routes/attempts.ts` (add `GET /`; today the file is POST-only, :8)
- Test: `server/test/api.play.test.ts`

**Interfaces:**
- Consumes:
  - `attemptsQuerySchema`, `AttemptsQuery`, `AttemptRecord` (Task 6)
  - `parseQuery` (Task 10)
  - `QuizRunRecord` (Task 15)
  - `GameRunRecord` (Task 16)
- Produces:
  - `interface AttemptRow { id: number; package_id: string; kind: "exercise" | "quiz" | "game"; ref_id: string | null; item_id: string | null; answer: string | null; correct: 0 | 1 | null; score: number | null; at: string }`
  - `toAttemptRecord(row: AttemptRow): AttemptRecord`
  - `listAttempts(db: Db, query: AttemptsQuery): AttemptRecord[]`
  - `GET /api/attempts?packageId=&kind=&refId=&limit=` returns 200 `{ attempts: AttemptRecord[] }`, or 400 `invalid_request` "query is not a valid attempts filter".
  - `VISIBLE_ATTEMPT` stays module-private. Stage 3 moves it into `LIVE.attempts('a')`, and these tests must pass unchanged after that move.

- [ ] **Step 1: Write the failing tests.** Append to `server/test/api.play.test.ts`:

```ts
describe("attempt history", () => {
  const history = async (query = "") => {
    const res = await app.request(`/api/attempts${query}`);
    expect(res.status).toBe(200);
    return (await res.json()).attempts as { id: number; kind: string }[];
  };
  const kinds = async (query = "") => (await history(query)).map((a) => a.kind);
  const importZip = (files: Record<string, string | Buffer>) =>
    app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(files)) });
  beforeEach(async () => {
    for (const body of [{ packageId: "demo", itemId: "mc1", answer: RIGHT.mc1 }, quizBody(RIGHT),
      quizBody({}, 75), gameBody("g-small", SMALL_PLAY)]) expect((await attempt(body)).status).toBe(200);
  });

  it("lists visible attempts newest first", async () => {
    const all = await history();
    expect(all.map((a) => a.kind)).toEqual(["game", "quiz", "quiz", "exercise"]);
    expect(all.map((a) => a.id)).toEqual(all.map((a) => a.id).sort((x, y) => y - x));
  });
  it("filters by package, kind, refId and limit", async () => {
    expect(await kinds("?packageId=demo")).toHaveLength(4);
    expect(await kinds("?packageId=other")).toEqual([]);
    expect(await kinds("?kind=quiz&refId=quiz-all")).toEqual(["quiz", "quiz"]);
    expect(await kinds("?kind=quiz&refId=quiz-plain")).toEqual([]);
    expect(await kinds("?kind=game&refId=g-small")).toEqual(["game"]);
    expect(await kinds("?kind=exercise")).toEqual(["exercise"]);
    expect(await kinds("?limit=1")).toEqual(["game"]);
  });
  it("maps rows to summary records and never returns raw answers", async () => {
    const [game, timedOut, quiz, exercise] = await history();
    expect(exercise).toEqual({ id: expect.any(Number), kind: "exercise", packageId: "demo", itemId: "mc1",
      correct: true, score: 1, at: expect.any(String) });
    expect(quiz).toEqual({ id: expect.any(Number), kind: "quiz", packageId: "demo", quizId: "quiz-all", score: 1,
      passed: true, correctCount: 6, total: 6, timedOut: false, elapsedSeconds: 42, at: expect.any(String) });
    expect(timedOut).toMatchObject({ score: 0, passed: false, correctCount: 0, timedOut: true, elapsedSeconds: 60 });
    expect(game).toEqual({ id: expect.any(Number), kind: "game", packageId: "demo", gameId: "g-small",
      template: "matching", score: expect.closeTo(2 / 3, 5), correctCount: 2, total: 2, mistakes: 1,
      completed: true, timedOut: false, elapsedSeconds: 30, at: expect.any(String) });
  });
  it("400s invalid filters", async () => {
    for (const q of ["?refId=quiz-all", "?kind=exercise&refId=mc1", "?foo=1", "?kind=bogus",
      "?limit=0", "?limit=201", "?packageId=bad%20id"]) {
      const res = await app.request(`/api/attempts${q}`);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
  });
  it("hides runs whose content is gone and shows them again on re-import, deleting nothing", async () => {
    expect((await app.request("/api/packages/demo", { method: "DELETE" })).status).toBe(204);
    expect(await kinds()).toEqual([]);
    expect(attemptCount()).toBe(4);
    await importZip(PLAY_FILES);
    expect(await kinds()).toEqual(["game", "quiz", "quiz", "exercise"]);
    const quizzes = JSON.parse(PLAY_FILES["quizzes.json"] as string).filter((q: { id: string }) => q.id !== "quiz-all");
    await importZip({ ...PLAY_FILES, "quizzes.json": JSON.stringify(quizzes) });
    expect(await kinds()).toEqual(["game", "exercise"]);
    expect(attemptCount()).toBe(4);
    await importZip(PLAY_FILES);
    expect(await kinds()).toEqual(["game", "quiz", "quiz", "exercise"]);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run server/test/api.play.test.ts` → the five new tests FAIL. `GET /api/attempts` has no route, so it returns 404.
- [ ] **Step 3: Implement `listAttempts` and `toAttemptRecord` in `attemptLog.ts`, and `GET /` in `attempts.ts`.** The route calls `parseQuery(c, attemptsQuerySchema, "query is not a valid attempts filter")` and then returns `c.json({ attempts: listAttempts(db, q.data) })`.

  `listAttempts` runs `SELECT a.id, a.package_id, a.kind, a.ref_id, a.item_id, a.answer, a.correct, a.score, a.at FROM attempts a WHERE ${VISIBLE_ATTEMPT}`. It adds `AND a.package_id = ?`, `AND a.kind = ?` and `AND a.ref_id = ?` only for the filters given, then `ORDER BY a.id DESC LIMIT ?`. Every value is bound as a parameter. The fragment:

```ts
const VISIBLE_ATTEMPT = `((a.kind = 'exercise' AND EXISTS (SELECT 1 FROM items i WHERE i.package_id = a.package_id AND i.id = a.item_id))
  OR (a.kind = 'quiz' AND EXISTS (SELECT 1 FROM quizzes q WHERE q.package_id = a.package_id AND q.id = a.ref_id))
  OR (a.kind = 'game' AND EXISTS (SELECT 1 FROM games g WHERE g.package_id = a.package_id AND g.id = a.ref_id)))`;
```

  `toAttemptRecord` mapping:
  - **exercise:** `{ id, kind, packageId, itemId: item_id, correct: correct === 1, score: score ?? 0, at }`
  - **quiz:** `passed: correct === null ? null : correct === 1`. `correctCount`, `total`, `timedOut` and `elapsedSeconds` come from the parsed `QuizRunRecord`, and `quizId` is `ref_id`.
  - **game:** `gameId` is `ref_id`. `template`, `correctCount`, `total`, `mistakes`, `completed`, `timedOut` and `elapsedSeconds` come from the parsed `GameRunRecord`.

  Every variant takes `id`, `packageId`, `score` (`?? 0`) and `at` from the row. `answer` is never returned. Visible rows always carry their `item_id` or `ref_id`, so `!` is safe there.
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/api.play.test.ts && npm run typecheck` → 24 passed, and tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/attemptLog.ts server/src/routes/attempts.ts server/test/api.play.test.ts
git commit -m "feat: list attempt history without orphaned runs"
```

---

### Task 18: Server — package summaries

**Files:**
- Modify: `server/src/attemptLog.ts` (add `attemptStats`)
- Modify: `server/src/routes/packages.ts` (add `quizzes` and `games` to each package at :29-32; typed rows replace the casts at :16 and :25)
- Test: `server/test/api.packages.test.ts`

**Interfaces:**
- Consumes:
  - `listQuizzes`, `listGames` (Task 12)
  - `quizItemIds` (Task 7)
  - `gameSettings` (Task 4)
- Produces:
  - ``attemptStats(db: Db, packageId: string): Map<`quiz:${string}` | `game:${string}`, { runs: number; best: number | null }>``. It runs `SELECT kind, ref_id, COUNT(*) AS runs, MAX(score) AS best FROM attempts WHERE package_id = ? AND kind IN ('quiz','game') GROUP BY kind, ref_id`.
  - `GET /api/packages` adds two fields to each package, both in `ord` order. The shapes are server-local interfaces in `packages.ts`, and Task 21 mirrors them in `web/src/api.ts`.
    - `quizzes: QuizSummary[]`, where `QuizSummary = { id: string; title: string; description?: string; itemCount: number; timeLimitSeconds: number | null; passThreshold: number | null; runs: number; best: number | null }`
    - `games: GameSummary[]`, where `GameSummary = { id: string; title: string; template: Game["template"]; timeLimitSeconds: number | null; runs: number; best: number | null }`

    `GameSummary.timeLimitSeconds` is the effective value from `gameSettings`. Stats are merged while iterating content rows, so orphan stats never appear.

- [ ] **Step 1: Write the failing tests.** Append to `server/test/api.packages.test.ts` and import `PLAY_FILES`. The existing `toMatchObject` test at :20-29 stays as it is.

```ts
describe("package summaries", () => {
  const firstPackage = async () => (await (await app.request("/api/packages")).json()).packages[0];
  const importPlay = () => app.request("/api/packages/import", { method: "POST", body: new Uint8Array(makeZip(PLAY_FILES)) });

  it("lists quizzes and games in package order with their settings", async () => {
    await importPlay();
    const pkg = await firstPackage();
    expect(pkg.quizzes).toEqual([
      { id: "quiz-all", title: "All types", description: "Every checkable type", itemCount: 6,
        timeLimitSeconds: 60, passThreshold: 0.5, runs: 0, best: null },
      { id: "quiz-plain", title: "Plain", itemCount: 1, timeLimitSeconds: null, passThreshold: null, runs: 0, best: null },
    ]);
    expect(pkg.games).toEqual([
      { id: "g-match", title: "Match", template: "matching", timeLimitSeconds: null, runs: 0, best: null },
      { id: "g-small", title: "Small", template: "matching", timeLimitSeconds: null, runs: 0, best: null },
      { id: "g-speed", title: "Speed", template: "timed-round", timeLimitSeconds: 60, runs: 0, best: null },
      { id: "g-order", title: "Order", template: "order-it", timeLimitSeconds: null, runs: 0, best: null },
    ]);
  });
  it("counts runs and keeps the best score per quiz and game", async () => {
    await importPlay();
    const run = db.prepare("INSERT INTO attempts (package_id, kind, ref_id, item_id, answer, correct, score, at) " +
      "VALUES (?, ?, ?, NULL, '{}', NULL, ?, '2026-10-22T00:00:00.000Z')");
    run.run("demo", "quiz", "quiz-all", 0.5);
    run.run("demo", "quiz", "quiz-all", 1);
    run.run("demo", "game", "g-small", 0.75);
    run.run("demo", "quiz", "quiz-gone", 1);   // orphan: never listed
    run.run("other", "quiz", "quiz-plain", 1); // another package
    const pkg = await firstPackage();
    expect(pkg.quizzes.map((q: any) => [q.id, q.runs, q.best])).toEqual([["quiz-all", 2, 1], ["quiz-plain", 0, null]]);
    expect(pkg.games.map((g: any) => [g.id, g.runs, g.best]))
      .toEqual([["g-match", 0, null], ["g-small", 1, 0.75], ["g-speed", 0, null], ["g-order", 0, null]]);
  });
  it("gives a package without quizzes or games empty arrays", async () => {
    await importGood();
    expect(await firstPackage()).toMatchObject({ quizzes: [], games: [] });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run server/test/api.packages.test.ts` → the three new tests FAIL because `pkg.quizzes` is `undefined`.
- [ ] **Step 3: Implement `attemptStats` and the summaries in `packages.ts`.** Row types: `{ id: string; manifest: string }[]` at :16, with the manifest parsed `as Manifest`, and `{ id: string; frontmatter: string; status: string }[]` at :25, with the frontmatter parsed `as LessonFrontmatter`. Fields per summary:
  - `itemCount = quizItemIds(q).length`
  - `timeLimitSeconds = q.timeLimitSeconds ?? null` for quizzes, and `gameSettings(g).timeLimitSeconds` for games
  - `passThreshold = q.passThreshold ?? null`
  - `runs` and `best` come from ``stats.get(`quiz:${q.id}`)`` (``game:`` for games), defaulting to `{ runs: 0, best: null }`.
- [ ] **Step 4: Run tests and confirm they pass.** `npx vitest run server/test/api.packages.test.ts && npm run typecheck` → 11 passed, and tsc exits 0.
- [ ] **Step 5: Commit**

```bash
git add server/src/attemptLog.ts server/src/routes/packages.ts server/test/api.packages.test.ts
git commit -m "feat: summarise quizzes and games per package"
```

---

### Task 19: Sample content — a multi-select item and an order-it game

**Files:**
- Modify: `server/sample/items.json`. Append `ms-techniques` after `match-terms` (:45-55). It must come after `mc-forgetting`, so the `memory` tag source resolves in this order.
- Modify: `server/sample/games.json` (add `game-order` after :3)
- Test: `server/test/seed.test.ts`

**Interfaces:**
- Consumes:
  - `getGame`, `getItem`, `listQuizzes`, `listGames` (Task 12)
  - `roundSizeFor(game: Game, pool: readonly CheckableItem[]): number` (Task 4)
  - `seedSampleIfEmpty(db: Db): void` and `loadSamplePackage(): LoadedPackage` (`server/src/index.ts:48`, `:27`)
  - `freshDb` (`server/test/helpers.ts:7`)
- Produces: the seeded sample that the e2e tests of Tasks 20 and 22–25 drive:
  - 1 quiz (`quiz-basics`, "Study techniques check")
  - 3 games: `game-match` ("Match the techniques", deals all 3 pairs), `game-speed` ("Quick fire", pool `[mc-forgetting, ms-techniques]`, deals both) and `game-order` (pool `[ord-study-loop]`, title "Put it in order")
  - still exactly 3 flashcards, so smoke's "All caught up — 4 reviewed" holds (`e2e/smoke.spec.ts:78`)

Exact content:

```json
{
  "id": "ms-techniques",
  "type": "multi-select",
  "prompt": "Which of these make you practise active recall?",
  "options": [
    { "id": "a", "text": "Answering questions without notes", "correct": true },
    { "id": "b", "text": "Rereading the chapter" },
    { "id": "c", "text": "Explaining it from memory", "correct": true },
    { "id": "d", "text": "Highlighting key lines" }
  ],
  "partialCredit": true,
  "explanation": "Both right answers make you pull the idea out of memory; rereading and highlighting only show it to you again.",
  "tags": ["memory"]
}
```

`games.json` gains `{ "id": "game-order", "template": "order-it", "title": "Put it in order", "source": { "itemIds": ["ord-study-loop"] } }`.

- [ ] **Step 1: Write the failing tests.** Add to `server/test/seed.test.ts`, and add these imports: `freshDb` from `./helpers.js`; `getGame, getItem, listGames, listQuizzes` from `../src/content.js`; `loadSamplePackage` from `../src/index.js`; `roundSizeFor` from `@study/shared`; and `type MsItem` from `@study/shared` on its own line.

```ts
const SAMPLE = "learning-how-to-learn";
it("still validates the bundled sample", () => {
  expect(() => loadSamplePackage()).not.toThrow();
});
it("ships one quiz, three games and three flashcards", () => {
  const db = freshDb();
  seedSampleIfEmpty(db);
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  expect(ids(listQuizzes(db, SAMPLE))).toEqual(["quiz-basics"]);
  expect(listGames(db, SAMPLE).map((g) => [g.id, g.template]))
    .toEqual([["game-match", "matching"], ["game-speed", "timed-round"], ["game-order", "order-it"]]);
  expect(ids(getGame(db, SAMPLE, "game-speed")!.pool)).toEqual(["mc-forgetting", "ms-techniques"]);
  expect(ids(getGame(db, SAMPLE, "game-order")!.pool)).toEqual(["ord-study-loop"]);
  expect(ids(getGame(db, SAMPLE, "game-match")!.pool)).toEqual(["match-terms"]);
  const dealt = ["game-speed", "game-match"].map((id) => { const g = getGame(db, SAMPLE, id)!; return roundSizeFor(g.game, g.pool); });
  expect(dealt).toEqual([2, 3]);                                  // every question, every pair
  const ms = getItem(db, SAMPLE, "ms-techniques") as MsItem;
  expect(ms).toMatchObject({ type: "multi-select", partialCredit: true, tags: ["memory"] });
  expect(ms.options.filter((o) => o.correct).map((o) => o.id)).toEqual(["a", "c"]);
  expect(db.prepare("SELECT COUNT(*) n FROM items WHERE type = 'flashcard'").get()).toEqual({ n: 3 });
});
```

- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run server/test/seed.test.ts` → "ships one quiz…" FAILS: there are two games, and `game-speed`'s pool is `["mc-forgetting"]` (so it would deal 1, not 2).
- [ ] **Step 3: Add the item and the game.** Write the JSON above into `server/sample/items.json` and `server/sample/games.json`. No code changes.
- [ ] **Step 4: Run tests and confirm they pass.**
  - `npx vitest run server/test/seed.test.ts` → 3 passed.
  - `npm test` → all suites pass.
  - `npm run typecheck` → exit 0 (`server/tsconfig.json` includes `test`, so the new imports and the `MsItem` cast are checked).
  - `npm run validate:content -- server/sample` prints `OK   server/sample — 2 lessons, 9 items, 1 quizzes, 3 games`.
  - `npm run e2e` → 1 passed (the smoke test, unchanged).
- [ ] **Step 5: Commit**

```bash
git add server/sample/items.json server/sample/games.json server/test/seed.test.ts
git commit -m "feat: add a multi-select item and an order-it game to the sample"
```

---

### Task 20: Web — ActivityView split into ItemPrompt, AnswerForm and Verdict

**Files:**
- Create: `web/src/components/answerRules.ts`, the pure rules for when a sub-form's state counts as an answer.
- Modify: `web/src/components/ActivityView.tsx`:
  - Export `Task` (:10) and `TYPE_LABEL` (:13-21).
  - Extract `ItemPrompt` (:53-55) and `Verdict` (:79-105).
  - Export `AnswerForm` (:204-227) with optional `onSubmit` and `onChange`.
  - Delete `shuffled` (:229-236). Options (:250) and the Matching rights (:449) use the shared `shuffle`, and Ordering (:390) uses `scramble`.
  - Add `maxLength={MAX_ANSWER_TEXT}` on the FillBlank inputs (:314-321) and the ShortAnswer input (:359-367).
- Create: `e2e/play.spec.ts`, holding this task's two tests. Tasks 22–25 add the rest.
- Test: `web/test/answerRules.test.ts` (new), `web/test/rendering.test.tsx`

**Interfaces:**
- Consumes:
  - `shuffle<T>(items: readonly T[], random: () => number = Math.random): T[]` and `scramble<T>(items: readonly T[], random: () => number = Math.random): T[]` (Task 4)
  - `MAX_ANSWER_TEXT = 200` (Task 2)
  - `CheckableItem` (Task 3)
  - `Answer`, `CheckResult` and `Item`
- Produces:
  - `export type Task = CheckableItem`
  - `export const TYPE_LABEL: Record<Item["type"], string>` (the values do not change)
  - `export function ItemPrompt({ packageId, item, kicker }: { packageId: string; item: Task; kicker?: string })`. It renders `p.work-kicker` (`kicker ?? TYPE_LABEL[item.type]`), then the prompt `Markdown`, then `Media`. It adds no wrapper.
  - `export function Verdict({ packageId, item, result, answered = true, children }: { packageId: string; item: Task; result: CheckResult; answered?: boolean; children?: ReactNode })`. It renders the `.result` block from :79-105, with `children` last inside `.result`. ActivityView passes its Try again as `children`, so the lesson DOM stays the same.
  - `export function AnswerForm({ item, disabled, onSubmit, onChange }: { item: Task; disabled: boolean; onSubmit?: (a: Answer) => void; onChange?: (draft: Answer | null) => void })`
  - In `answerRules.ts`:
    - `optionsDraft(multi: boolean, picked: readonly string[]): Answer | null`
    - `fillBlankDraft(answers: Readonly<Record<string, string>>): Answer | null`
    - `shortAnswerDraft(text: string): Answer | null`
    - `orderingDraft(ids: readonly string[], touched: boolean): Answer | null`
    - `matchingDraft(lefts: readonly string[], choices: Readonly<Record<string, string>>): Answer | null`
  - The default `ActivityView({ packageId, item })` keeps its signature, DOM and behaviour.

- [ ] **Step 1: Write the failing tests.** The tests in `web/test/rendering.test.tsx` use fixtures typed `CheckableItem`:
  - `mc` is the existing shape with `shuffle: false`.
  - `ms` has options a and b correct, c wrong, and `partialCredit: true`.
  - `fb` has the template `"A {{1}} B"`.
  - `sa` has accept `["recall"]` and the hint "It starts with r.".
  - `ord` has steps `s1` "First" and `s2` "Second".
  - `mat` has pairs L1→R1 and L2→R2, and the distractor R3.
  - `html = renderToStaticMarkup` and `CHECK = /<button[^>]*>Check<\/button>/`. It has no `g` flag, so repeated `toMatch` calls share no `lastIndex` state.
  - Beside it, `CHECK_ON = /<button(?![^>]*\sdisabled)[^>]*>Check<\/button>/` and `CHECK_OFF = /<button[^>]*\sdisabled=""[^>]*>Check<\/button>/`. No attribute of Check other than `disabled` is pinned.
  - The existing radio-group test stays.
```tsx
// web/test/answerRules.test.ts
it("options: nothing picked is unanswered", () => {
  expect(optionsDraft(false, [])).toBeNull(); expect(optionsDraft(true, [])).toBeNull();
  expect(optionsDraft(false, ["b"])).toEqual({ type: "multiple-choice", optionId: "b" });
  expect(optionsDraft(true, ["a", "c"])).toEqual({ type: "multi-select", optionIds: ["a", "c"] });
});
it("fill-blank: answered once any blank holds non-space text", () => {
  expect(fillBlankDraft({})).toBeNull(); expect(fillBlankDraft({ "1": "  ", "2": "" })).toBeNull();
  expect(fillBlankDraft({ "1": "Again", "2": "" })).toEqual({ type: "fill-blank", answers: { "1": "Again", "2": "" } });
});
it("short answer: whitespace only is unanswered; text is sent as typed", () => {
  expect(shortAnswerDraft("   ")).toBeNull();
  expect(shortAnswerDraft(" recall ")).toEqual({ type: "short-answer", text: " recall " });
});
it("ordering: untouched is unanswered", () => {
  expect(orderingDraft(["s2", "s1"], false)).toBeNull();
  expect(orderingDraft(["s2", "s1"], true)).toEqual({ type: "ordering", orderedIds: ["s2", "s1"] });
});
it("matching: unanswered until every left is chosen", () => {
  expect(matchingDraft(["L1", "L2"], { L1: "R1" })).toBeNull();
  expect(matchingDraft(["L1", "L2"], { L1: "R1", L2: "R2" }))
    .toEqual({ type: "matching", pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }] });
});
// web/test/rendering.test.tsx
it("AnswerForm renders Check only when onSubmit is given", () => {
  for (const item of [mc, ms, fb, sa, ord, mat]) {
    expect(html(<AnswerForm item={item} disabled={false} onChange={() => {}} />)).not.toMatch(CHECK);
    expect(html(<AnswerForm item={item} disabled={false} onSubmit={() => {}} />)).toMatch(CHECK);
  }
});
it("AnswerForm keeps today's Check enable rules on an empty form", () => {
  for (const item of [fb, ord]) expect(html(<AnswerForm item={item} disabled={false} onSubmit={() => {}} />)).toMatch(CHECK_ON);   // :338, :429: enabled even with every blank empty
  for (const item of [mc, ms, sa, mat]) expect(html(<AnswerForm item={item} disabled={false} onSubmit={() => {}} />)).toMatch(CHECK_OFF); // :279, :371, :481
});
it("AnswerForm caps typed answers at MAX_ANSWER_TEXT", () => {
  expect(html(<AnswerForm item={sa} disabled={false} />)).toMatch(/maxlength="200"/i);
  expect(html(<AnswerForm item={fb} disabled={false} />)).toMatch(/maxlength="200"/i);
});
it("a two-step ordering never starts solved", () => {
  const out = html(<AnswerForm item={ord} disabled={false} />);
  expect(out.indexOf("Second")).toBeLessThan(out.indexOf("First"));
});
it("ItemPrompt uses the kicker it is given, else the type label", () => {
  expect(html(<ItemPrompt packageId="p" item={mc} kicker="Question 1 of 4 · Choose one" />))
    .toContain('<p class="work-kicker">Question 1 of 4 · Choose one</p>');
  expect(html(<ItemPrompt packageId="p" item={mc} />)).toContain('<p class="work-kicker">Choose one</p>');
});
it("Verdict shows a correct answer, a scored miss and an unanswered item", () => {
  const ok = html(<Verdict packageId="p" item={mc} result={{ correct: true, score: 1, expected: "a" }} />);
  expect(ok).toContain("✓ Correct"); expect(ok).not.toContain("Try again");
  const half = html(<Verdict packageId="p" item={ms} result={{ correct: false, score: 0.5, expected: ["a", "b"] }} />);
  expect(half).toContain("✗ Not quite (score 50%)"); expect(half).toContain("Answer:");
  const blank = html(<Verdict packageId="p" item={mc} answered={false} result={{ correct: false, score: 0, expected: "a" }} />);
  expect(blank).toContain("— Not answered"); expect(blank).toContain("Answer:"); expect(blank).not.toContain("Not quite");
});
it("ActivityView keeps one Check button and its hints", () => {
  const out = html(<ActivityView packageId="p" item={sa} />);
  expect(out.match(/>Check<\/button>/g)).toHaveLength(1); expect(out).toContain("Show a hint");
});
// e2e/play.spec.ts (new). Both tests open the lesson by URL, so they do not depend on the Library route.
test("ordering keeps focus on the moved step and Try again keeps the order", async ({ page }) => {
  await page.goto("/lesson/learning-how-to-learn/active-recall");
  const work = page.locator(".work", { has: page.locator(".order-row") });
  const rows = work.locator(".order-row");
  const down0 = rows.nth(0).getByRole("button").nth(1);
  const name0 = (await down0.locator("svg").getAttribute("aria-label"))!;            // Move “…” down
  await down0.click();
  await expect(page.getByRole("button", { name: name0, exact: true })).toBeFocused();
  const down2 = rows.nth(2).getByRole("button").nth(1);
  const up2 = (await down2.locator("svg").getAttribute("aria-label"))!.replace(/ down$/, " up");
  await down2.click();                                   // the step lands last, so its down button is disabled
  await expect(page.getByRole("button", { name: up2, exact: true })).toBeFocused();
  const order = await work.locator(".order-text").allTextContents();
  await work.getByRole("button", { name: "Check", exact: true }).click();   // exact: a step reads "Check and correct"
  await work.getByRole("button", { name: "Try again" }).click();
  await expect(work.locator(".order-text")).toHaveText(order);   // the draft survives the retry
});
test("a lesson short answer checks on Enter", async ({ page }) => {
  await page.goto("/lesson/learning-how-to-learn/active-recall");
  const work = page.locator(".work", { has: page.getByLabel("Your answer") });   // sa-recall, under Practice
  await work.getByLabel("Your answer").fill("recall");
  await work.getByLabel("Your answer").press("Enter");                           // ActivityView.tsx:366
  await expect(work.getByText("✓ Correct")).toBeVisible();
});
```
- [ ] **Step 2: Run them and confirm they fail.**
  - `npx vitest run web/test/answerRules.test.ts web/test/rendering.test.tsx` fails because `../src/components/answerRules.js` does not resolve, and because `AnswerForm`, `ItemPrompt` and `Verdict` are not exported. The new `AnswerForm` tests, the enable-rules test included, fail for that reason.
  - `npm run e2e -- -g "ordering keeps focus"` fails at the first `toBeFocused`: today nothing moves focus after a move, and once a step lands last its focused down button is disabled.
  - `npm run e2e -- -g "checks on Enter"` passes already, because it guards today's behaviour. It fails if the split drops the `onKeyDown`.
- [ ] **Step 3: Implement `answerRules.ts` and the split in `ActivityView.tsx`.**
  - **Rules.** Each rule returns null exactly where the tests expect it, and copies the arrays and records it returns.
  - **Reporting drafts.** Every sub-form takes `onSubmit?` and `onChange?`. Each event handler computes the next state and calls `onChange?.(rule(next))` itself. Never report from an effect, because StrictMode replays effects.
  - **Check button.** It renders only when `onSubmit && !disabled`. It keeps today's enable rules and today's payloads:
    - Options: as at :279.
    - FillBlank: always enabled (:338).
    - ShortAnswer: disabled while `!text` (:371).
    - Ordering: always enabled (:429).
    - Matching: enabled once every left has a choice (:481).

    ShortAnswer's Enter-to-check (:366) fires only when `onSubmit` is given.
  - **Ordering.** It starts from `useState(() => scramble(item.steps, Math.random))` and sets a `touched` flag on the first move. After a move, focus goes to the moved step's button in the direction just used. If that button is now disabled, focus goes to the step's other button. Keep the buttons in refs keyed `` `${stepId}:up|down` ``, and focus the target in an effect on `steps`.
  - **ActivityView.** It builds today's DOM from the parts, in this order:
    1. `section.work`
    2. `ItemPrompt`
    3. `.work-body`, holding `AnswerForm onSubmit={submit}` and the hints
    4. `Verdict`, with Try again's `.actions` as its children
    5. the error

    `FlashcardReveal` does not change.
- [ ] **Step 4: Run tests and confirm they pass.**
  - `npx vitest run web/test` passes.
  - `npm run typecheck` exits 0.
  - `npm run e2e` passes the unchanged `smoke.spec.ts` and the focus and Enter tests (3 passed).
- [ ] **Step 5: Commit**
```bash
git add web/src/components/answerRules.ts web/src/components/ActivityView.tsx web/test/answerRules.test.ts web/test/rendering.test.tsx e2e/play.spec.ts
git commit -m "feat: let AnswerForm report drafts and export its parts"
```

---

### Task 21: Web — play API client, clock helpers and server-checking guard

**Files:**
- Modify: `web/src/api.ts`. Update the type imports (:1). `PackageSummary` (:4-7) gains `quizzes` and `games`. Add the new types and functions after `gradeCard` (:55-56).
- Create: `web/src/format.ts`, `web/src/useClock.ts`, `web/src/components/Clock.tsx`
- Test: new files `web/test/format.test.ts`, `web/test/useClock.test.ts`, `web/test/api.test.ts` and `web/test/serverChecking.test.ts`; a Clock test in `web/test/rendering.test.tsx`.

**Interfaces:**
- Consumes, from the shared barrel:
  - `Quiz`, `Game` and `Item`
  - `CheckableItem` (Task 3)
  - `GameSettings` (Task 4)
  - `QuizResult` (Task 7)
  - `GameMoveResult` (Task 8)
  - `GameResult` (Task 9)
  - `GameMove`, `QuizSubmission`, `GameSubmission`, `AttemptsQuery` and `AttemptRecord` (Task 6)
- Consumes, from the server:
  - `GET /api/quizzes/:p/:q` and `GET /api/games/:p/:g` (Task 13)
  - `POST /api/games/:p/:g/check` (Task 14)
  - the quiz and game bodies of `POST /api/attempts` (Tasks 15–16)
  - `GET /api/attempts` (Task 17)
  - the `quizzes` and `games` fields of `GET /api/packages` (Task 18)
- Produces, in `api.ts`:
  - `interface QuizSummary { id: string; title: string; description?: string; itemCount: number; timeLimitSeconds: number | null; passThreshold: number | null; runs: number; best: number | null }`
  - `interface GameSummary { id: string; title: string; template: Game["template"]; timeLimitSeconds: number | null; runs: number; best: number | null }`
  - `PackageSummary` gains `quizzes: QuizSummary[]; games: GameSummary[]`
  - `interface QuizPayload { quiz: Quiz; items: Record<string, Item> }`
  - `interface GamePayload { game: Game; settings: GameSettings; items: CheckableItem[] }`
  - `getQuiz(packageId: string, quizId: string): Promise<QuizPayload>` and `getGame(packageId: string, gameId: string): Promise<GamePayload>`
  - `checkMove(packageId: string, gameId: string, move: GameMove): Promise<GameMoveResult>`. It is not named `checkGameMove`, so the guard can ban that shared name outright.
  - `submitQuiz(s: QuizSubmission): Promise<QuizResult>` and `submitGame(s: GameSubmission): Promise<GameResult>`. Both POST to `/api/attempts`.
  - `listAttempts(q: Partial<AttemptsQuery>): Promise<AttemptRecord[]>`. It sends a GET with only the keys that are set, and unwraps `{ attempts }`.
  - `isStale(e: unknown): boolean`. It is true for an `ApiError` whose code is `not_found` or `not_checkable`.
- Produces, in `format.ts`: `formatClock(seconds: number): string`, `remainingSeconds(limitSeconds: number, elapsedMs: number): number` and `percent(score: number): number`
- Produces, in `useClock.ts`:
  - `useClock(startedAt: number | null, limitSeconds: number | null, onExpire: () => void): number`. It returns the elapsed time in ms.
  - `expiryDue(firedFor: number | null, startedAt: number, nowMs: number, limitSeconds: number | null): boolean`. It is true when `limitSeconds !== null`, `firedFor !== startedAt` and `nowMs − startedAt ≥ limitSeconds*1000`.
- Produces, in `components/Clock.tsx`: the default export `Clock({ elapsedMs, limitSeconds }: { elapsedMs: number; limitSeconds: number | null })`

- [ ] **Step 1: Write the failing tests**
```tsx
// web/test/format.test.ts
it("formatClock shows m:ss and floors", () => {
  expect(formatClock(0)).toBe("0:00"); expect(formatClock(61)).toBe("1:01");
  expect(formatClock(600)).toBe("10:00"); expect(formatClock(59.9)).toBe("0:59");
});
it("remainingSeconds rounds up and stops at 0", () => {
  expect(remainingSeconds(60, 0)).toBe(60); expect(remainingSeconds(60, 500)).toBe(60); expect(remainingSeconds(60, 59_001)).toBe(1);
  expect(remainingSeconds(60, 60_000)).toBe(0); expect(remainingSeconds(60, 61_000)).toBe(0);
});
it("percent floors, with a float-error guard", () => {
  expect(percent(0.29)).toBe(29); expect(percent(0.7467)).toBe(74); expect(percent(2 / 3)).toBe(66);
  expect(percent(1)).toBe(100); expect(percent(0)).toBe(0);
});
// web/test/useClock.test.ts
it("expiryDue fires once per start, at the limit, and never without one", () => {
  expect(expiryDue(null, 1_000, 60_999, 60)).toBe(false);
  expect(expiryDue(null, 1_000, 61_000, 60)).toBe(true);
  expect(expiryDue(1_000, 1_000, 90_000, 60)).toBe(false);   // already fired for this start: a later tick or a StrictMode replay
  expect(expiryDue(1_000, 5_000, 65_000, 60)).toBe(true);    // a new start can fire again
  expect(expiryDue(null, 1_000, 10 ** 9, null)).toBe(false); // a stopwatch never expires
});
// web/test/api.test.ts
it("isStale is true only when a quiz or game vanished or changed", () => {
  expect(isStale(new ApiError("x", "not_found"))).toBe(true); expect(isStale(new ApiError("x", "not_checkable"))).toBe(true);
  expect(isStale(new ApiError("x", "invalid_request"))).toBe(false); expect(isStale(new Error("x"))).toBe(false);
});
// web/test/serverChecking.test.ts. sourceFiles(dir) is a recursive readdirSync walk written in the test file.
it("web/src never names a shared checker or scorer", () => {
  const files = sourceFiles(fileURLToPath(new URL("../src/", import.meta.url)));       // every .ts and .tsx file
  expect(files.some((f) => f.endsWith("api.ts"))).toBe(true);
  const banned = /\b(checkAnswer|scoreQuiz|scoreGame|checkGameMove)\b/;
  expect(files.filter((f) => banned.test(readFileSync(f, "utf8")))).toEqual([]);
});
// web/test/rendering.test.tsx
it("Clock counts down with a limit and up without one", () => {
  const down = html(<Clock elapsedMs={1500} limitSeconds={60} />);
  expect(down).toContain('role="timer"'); expect(down).toContain('aria-label="Time left"'); expect(down).toContain(">0:59<");
  const up = html(<Clock elapsedMs={61_000} limitSeconds={null} />);
  expect(up).toContain('aria-label="Time taken"'); expect(up).toContain(">1:01<");
});
```
- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run web/test/format.test.ts web/test/useClock.test.ts web/test/api.test.ts web/test/serverChecking.test.ts web/test/rendering.test.tsx`.
  - The format, `expiryDue` and Clock tests fail because their modules do not resolve.
  - The `isStale` test fails because `isStale` is not exported.
  - `serverChecking` passes already. It guards a rule that holds today, and it trips if Tasks 22–25 break that rule.
- [ ] **Step 3: Implement the client, `format.ts`, `useClock` and `Clock`.**
  - **`format.ts`.**
    - `formatClock` floors its input. Minutes are unpadded and seconds always have 2 digits.
    - `remainingSeconds` is `max(0, ceil((limitSeconds*1000 − elapsedMs)/1000))`.
    - `percent` is `floor(score*100 + 1e-6)`.
  - **`useClock`.**
    - It returns `Date.now() − startedAt`, refreshed by a 250 ms `setInterval`. When `startedAt` is null, it returns 0 and sets no interval.
    - The interval callback, not render, asks `expiryDue(fired.current, startedAt, Date.now(), limitSeconds)`. When it is true, the callback sets `fired.current = startedAt`, calls the latest `onExpire` and stops. `fired` is a ref, so it survives StrictMode's effect replay. `onExpire` lives in a ref that is updated on every render.
    - The cleanup clears the interval.
    - Add a comment saying why. Reading the wall clock survives background-tab throttling. Callers set `startedAt` in a click handler, so StrictMode's dev-only effect replay cannot start a second run.
  - **`Clock`.** It renders `<p className="clock" role="timer">`, with `aria-label` "Time left" or "Time taken".
    - With a limit, it shows `formatClock(remainingSeconds(limit, elapsedMs))`.
    - Without one, it shows `formatClock(elapsedMs / 1000)`.
    - It has no `aria-live`, because announcing every tick is noise.
  - **`api.ts`.** Implement the functions in Interfaces on top of the private `req` and `json` helpers (:28-39).
- [ ] **Step 4: Run tests and confirm they pass.** `npm test` passes, and `npm run typecheck` exits 0.
- [ ] **Step 5: Commit**
```bash
git add web/src/api.ts web/src/format.ts web/src/useClock.ts web/src/components/Clock.tsx web/test/format.test.ts web/test/useClock.test.ts web/test/api.test.ts web/test/serverChecking.test.ts web/test/rendering.test.tsx
git commit -m "feat: add the play API client, clock helpers and a server-checking guard"
```

---

### Task 22: Web — nav entries, quiz and game lists, Library links and run history

**Files:**
- Modify: `web/src/components/Icon.tsx`. `PATHS` (:3-17) gains `quiz` (a clipboard with a tick) and `game` (a game controller). Each is one stroke path in the 24×24, 1.75-stroke family.
- Modify: `web/src/App.tsx`.
  - Imports: add the new pages (:5-7).
  - Nav (:47-60): put every label in `<span className="nav-label">`. After Study, add NavLink `/quizzes` (icon `quiz`, "Quizzes") and NavLink `/games` (icon `game`, "Games").
  - Routes (:70-74): add `/quizzes` → `<Quizzes />` and `/games` → `<Games />`.
- Modify: `web/src/pages/Library.tsx`. The sheet-foot (:183-187) gets count links before Export.
- Modify: `web/src/format.ts`. Add `TEMPLATE_LABEL`.
- Modify: `web/src/styles/layout.css`. After `.due-badge` (:84-94), add `@media (max-width: 39.99rem)`, in which `.nav-label` takes the `.sr-only` rules (`base.css:70-79`).
- Modify: `web/src/styles/components.css`.
  - `.sheet-foot` (:192-198) gains `flex-wrap: wrap`, because four controls overflow at 375 px.
  - After `.loading` (:797-801), add a `/* ---- Play lists ---- */` section with `.history`, `.history li`, `.chip-pass` and `.chip-fail`.
- Create: `web/src/pages/Quizzes.tsx`, `web/src/pages/Games.tsx`, `web/src/components/History.tsx`
- Modify: `e2e/play.spec.ts` — append the "play entry points" test.
- Test: `web/test/rendering.test.tsx`, `e2e/play.spec.ts`

**Interfaces:**
- Consumes:
  - the seeded sample, 1 quiz and 3 games (Task 19), and `e2e/play.spec.ts` (Task 20)
  - `listPackages()` (existing, `web/src/api.ts:41`)
  - `PackageSummary` with `quizzes`/`games`, `QuizSummary`, `GameSummary`, `formatClock` and `percent` (Task 21)
  - `isPassing(score: number, threshold: number | undefined): boolean | null` (Task 7); pass `passThreshold ?? undefined`
  - `AttemptRecord` (Task 6)
- Produces:
  - `IconName` gains `"quiz" | "game"`.
  - `TEMPLATE_LABEL: Record<Game["template"], string> = { matching: "Matching", "timed-round": "Timed round", "order-it": "Order it" }`, in `format.ts`.
  - `export function QuizList({ packages }: { packages: PackageSummary[] })`, beside the default page `Quizzes()`.
  - `export function GameList({ packages }: { packages: PackageSummary[] })`, beside the default page `Games()`.
  - The default export `History({ attempts }: { attempts: AttemptRecord[] })`.
  - The CSS hooks `.history li`, which e2e counts, and `.nav-label`.

- [ ] **Step 1: Write the failing tests.** These go in `web/test/rendering.test.tsx`, with the list renders wrapped in `<MemoryRouter>`. Fixture helpers:
  - `quiz(over): QuizSummary` returns `{ id: "q", title: "Q", itemCount: 4, timeLimitSeconds: null, passThreshold: 0.75, runs: 0, best: null, ...over }`.
  - `game(over): GameSummary` returns `{ id: "g", title: "G", template: "matching", timeLimitSeconds: null, runs: 0, best: null, ...over }`.
  - `pkg(id, over): PackageSummary` returns `{ id, title: id, version: "1", lessonCount: 0, lessons: [], quizzes: [], games: [], ...over }`. The `id` is what every expected `/quizzes/p1/…` and `/games/p1/…` href is built from.
  - `row(out, href)` returns the `<a …>` chunk with that href.
```tsx
it("QuizList groups by package, links each quiz and shows meta and dots", () => {
  const out = html(<MemoryRouter><QuizList packages={[pkg("p1", { quizzes: [
    quiz({ id: "passed", runs: 2, best: 0.75 }), quiz({ id: "tried", itemCount: 1, timeLimitSeconds: 60, runs: 1, best: 0.5 }),
    quiz({ id: "open", passThreshold: null, runs: 1, best: 0.2 }), quiz({ id: "new" })] }), pkg("p2")]} /></MemoryRouter>);
  expect(out.match(/class="sheet"/g)).toHaveLength(1);                            // p2 has no quizzes
  expect(row(out, "/quizzes/p1/passed")).toContain("4 questions · pass 75% · best 75%");
  expect(row(out, "/quizzes/p1/passed")).toContain('class="dot dot-done"');
  expect(row(out, "/quizzes/p1/tried")).toContain("1 question · 1:00 limit · pass 75% · best 50%");
  expect(row(out, "/quizzes/p1/tried")).toContain('class="dot dot-progress"');
  expect(row(out, "/quizzes/p1/open")).toContain('class="dot dot-done"');
  expect(row(out, "/quizzes/p1/new")).toContain('class="dot"');
});
it("GameList shows the template, the effective limit and the best score", () => {
  const out = html(<MemoryRouter><GameList packages={[pkg("p1", { games: [game({ id: "g-match" }),
    game({ id: "g-speed", template: "timed-round", timeLimitSeconds: 60, runs: 1, best: 0.75 })] })]} /></MemoryRouter>);
  expect(row(out, "/games/p1/g-match")).toContain('<span class="meta">Matching</span>');
  expect(row(out, "/games/p1/g-speed")).toContain("Timed round · 1:00 limit · best 75%");
  expect(row(out, "/games/p1/g-speed")).toContain('class="dot dot-done"');
});
it("the lists say when there is nothing to list", () => {
  expect(html(<MemoryRouter><QuizList packages={[pkg("p1")]} /></MemoryRouter>)).toContain("No quizzes yet");
  expect(html(<MemoryRouter><GameList packages={[pkg("p1")]} /></MemoryRouter>)).toContain("No games yet");
});
it("History shows score, pass chip, time and expiry in the order given", () => {
  const out = html(<History attempts={[
    { id: 2, kind: "quiz", packageId: "p", quizId: "q", score: 0.7467, passed: false, correctCount: 3, total: 4,
      timedOut: true, elapsedSeconds: 83, at: "2026-10-22T09:00:00.000Z" },
    { id: 1, kind: "game", packageId: "p", gameId: "g", template: "matching", score: 1, correctCount: 3, total: 3,
      mistakes: 0, completed: true, timedOut: false, elapsedSeconds: 42, at: "2026-10-21T09:00:00.000Z" }]} />);
  expect(out.match(/<li/g)).toHaveLength(2); expect(out.indexOf("74%")).toBeLessThan(out.indexOf("100%"));
  expect(out).toContain(">Not passed<"); expect(out).toContain("1:23 · time’s up");
  expect(out).toContain("0:42"); expect(out).not.toContain(">Passed<");
  expect(out).toMatch(/datetime="2026-10-22T09:00:00.000Z"/i);
  expect(html(<History attempts={[]} />)).toContain("No attempts yet.");
});
```
Append to `e2e/play.spec.ts`:
```ts
test("play entry points: failed list loads, Library count links, list filters and a phone-width nav", async ({ page }) => {
  await page.route("**/api/packages", (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  await page.goto("/quizzes");
  await expect(page.getByRole("alert")).toContainText("Your quizzes couldn’t be loaded.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Quizzes", exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Quizzes · 1", exact: true }).click();
  await expect(page).toHaveURL(/\/quizzes\?package=learning-how-to-learn$/);
  await expect(page.getByRole("heading", { name: "Quizzes", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All packages" }).click();
  await expect(page).toHaveURL(/\/quizzes$/);
  await page.route("**/api/packages", (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  await page.getByRole("link", { name: "Games", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your games couldn’t be loaded.");
  await page.getByRole("button", { name: "Try again" }).click();
  for (const t of ["Match the techniques", "Quick fire", "Put it in order"]) await expect(page.getByRole("link", { name: t })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quick fire" })).toContainText("Timed round · 1:00 limit");
  await page.getByRole("link", { name: "Quick fire" }).click();
  await expect(page.getByRole("link", { name: "Games", exact: true })).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto("/");
  await expect(page.locator(".nav .nav-label").first()).toHaveCSS("clip-path", "inset(50%)");
  await expect(page.getByRole("link", { name: "Quizzes", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Games · 3", exact: true })).toBeVisible();   // the sheet foot, all four controls, is laid out
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
```
- [ ] **Step 2: Run them and confirm they fail.**
  - `npx vitest run web/test/rendering.test.tsx` fails because `../src/pages/Quizzes.js`, `../src/pages/Games.js` and `../src/components/History.js` do not resolve.
  - `npm run e2e -- -g "play entry points"` fails at its first assertion: `/quizzes` has no route yet, so no alert reads "Your quizzes couldn’t be loaded.". Past that, `getByRole("link", { name: "Quizzes · 1", exact: true })` would time out, because the Library has no count links yet.
- [ ] **Step 3: Implement the lists, History, the nav and the Library links.**
  - **`QuizList`.**
    - Render one `.sheet` for each package that has at least one quiz. Its `.sheet-head` holds the package title as an `h2`.
    - Render each quiz as a `Link.lesson-row` to `/quizzes/{p}/{q}`. It holds, in order: a `.dot`; a `.lesson-row-text` with the title and the description (plain text, in `.lesson-row-sum`); a `.meta`; and Icon `right`.
    - Build the meta by joining these parts with `" · "`:
      - `{n} question(s)`
      - `{m:ss} limit`, only if a limit is set
      - `pass {p}%`, only if a threshold is set
      - `best {p}%`, only if `best` is not null
    - Choose the dot:
      - `dot-done` when `runs > 0` and either there is no threshold or `isPassing(best, passThreshold) === true`
      - `dot-progress` when `runs > 0` otherwise
      - plain `dot` when there are no runs
    - When there is nothing to list, render `.empty` with `p.empty-title` "No quizzes yet".
  - **`GameList`.** It uses the same layout.
    - The meta is `TEMPLATE_LABEL[template]`, then the limit, then `best`.
    - The dot is `dot-done` when `runs > 0`.
    - The empty text is "No games yet".
  - **`Quizzes()` and `Games()`.**
    - Call `listPackages()` on mount.
    - `useSearchParams().get("package")` narrows the list to one package and shows `Link.back-link` "All packages" to `/quizzes` (or `/games`).
    - The page head is `p.eyebrow` "Practice" and `h1.page-title` "Quizzes" (or "Games").
    - A failed load shows the Library's full-page alert and Try again (`Library.tsx:69-91`), reading "Your quizzes couldn’t be loaded." (or "Your games couldn’t be loaded.").
  - **`History`.**
    - Render `h2.eyebrow.section-break` "History", then `ol.history` with one `li` per record, in the order given.
    - Each row holds, in order:
      - `<time dateTime={at}>`, showing a medium date and a short time
      - `<b>{percent}%</b>`
      - for a quiz with `passed !== null`, `span.chip.chip-pass` "Passed" or `span.chip.chip-fail` "Not passed"
      - `span.meta` with `formatClock(elapsedSeconds)`, followed by `" · time’s up"` if the run timed out
    - Exercise rows show only the date and the percent.
    - With no records, render `p.note` "No attempts yet."
  - **Library.** When a package has quizzes, add a `Link.link-btn` to `/quizzes?package={id}`. It holds Icon `quiz` at size 18 and reads `Quizzes · {n}`. Add the same link for games.
  - **CSS.**
    - `.chip-pass` uses `--marker-wash`, `--on-wash` and `--marker-edge`.
    - `.chip-fail` uses `--pen-red-soft` and `--pen-red`.
    - `.history` has no bullets. Its rows are flex rows with a `--s3` gap and a `--rule` top border.
- [ ] **Step 4: Run tests and confirm they pass.**
  - `npm test` passes.
  - `npm run typecheck` exits 0.
  - `npm run e2e` → 4 passed, with the four-item nav: smoke, plus the three play tests so far (the ordering focus test, the lesson Enter test and "play entry points").
  - Clicking "Quick fire" reaches an unrouted `/games/…` path until Task 24. That is expected: the `/games` NavLink is current by path, so it still gets `aria-current="page"`. Do not give it `end`.
- [ ] **Step 5: Commit**
```bash
git add web/src/components/Icon.tsx web/src/App.tsx web/src/pages/Library.tsx web/src/format.ts web/src/styles/layout.css web/src/styles/components.css web/src/pages/Quizzes.tsx web/src/pages/Games.tsx web/src/components/History.tsx web/test/rendering.test.tsx e2e/play.spec.ts
git commit -m "feat: add quiz and game lists, nav entries and run history"
```

---

### Task 23: Web — Quiz page

**Files:**
- Create: `web/src/quizRun.ts`, `web/src/components/QuizQuestion.tsx`, `web/src/components/PlaySummary.tsx`, `web/src/pages/Quiz.tsx`
- Modify: `web/src/App.tsx`. Add a keyed `QuizRoute` wrapper beside `LessonRoute` (:17-20), and the route `/quizzes/:packageId/:quizId`.
- Modify: `web/src/styles/components.css`. After Task 22's section, add a `/* ---- Quiz ---- */` section:
  - `.quiz-bar`: sticky at `bottom: 0`, with a paper background and a top rule.
  - `.clock`: mono, with tabular numerals.
  - `.play-summary`.
- Test: `web/test/quizRun.test.ts` (new), `web/test/rendering.test.tsx`, `e2e/play.spec.ts`

**Interfaces:**
- Consumes:
  - `ItemPrompt`, `AnswerForm`, `Verdict`, `Task` and `TYPE_LABEL` (Task 20)
  - `getQuiz`, `submitQuiz`, `listAttempts`, `isStale`, `QuizPayload`, `useClock`, `Clock`, `formatClock` and `percent` (Task 21)
  - `History` (Task 22)
  - `quizItemIds(quiz: Quiz): string[]`, `QuizResult` and `QuizItemResult` (Task 7)
  - `shuffle` (Task 4)
  - `QuizSubmission` and `MAX_ELAPSED_SECONDS` (Task 6)
- Produces:
  - In `quizRun.ts`:
    - `quizOrder(quiz: Quiz, random: () => number = Math.random): string[]`
    - `answeredCount(ids: readonly string[], drafts: Readonly<Record<string, Answer | null>>): number`
    - `buildQuizSubmission(packageId: string, quiz: Quiz, drafts: Readonly<Record<string, Answer | null>>, elapsedMs: number): QuizSubmission`
    - `quizSummary(result: QuizResult): string`
  - The default export `QuizQuestion({ packageId, item, index, total, locked, result, onChange }: { packageId: string; item: Task; index: number; total: number; locked: boolean; result: QuizItemResult | null; onChange: (itemId: string, draft: Answer | null) => void })`.
  - The default export `PlaySummary({ text }: { text: string })`. It renders `<h2 className="play-summary" tabIndex={-1}>` and focuses itself on mount. Task 24 reuses it.
  - The page `Quiz()` and the route wrapper `QuizRoute`.
  - In `e2e/play.spec.ts`:
    - the helper `runs(page: Page, kind: "quiz" | "game", refId: string): Promise<number>`, the sample's logged run count from `GET /api/attempts`;
    - the helper `historyRows(before: number, added: number): number`, which is `Math.min(before + added, 20)`, because the pages load History with `limit: 20`.

    Tasks 24 and 25 count History rows with both.

- [ ] **Step 1: Write the failing tests**
```tsx
// web/test/quizRun.test.ts. seeded(n) is an LCG written in the test file.
const quiz: Quiz = { id: "q", title: "Q", items: ["a", "b", "a", "c"], timeLimitSeconds: 60, passThreshold: 0.75 };
const untimed: Quiz = { id: "q", title: "Q", items: ["a"] };
const A: Answer = { type: "short-answer", text: "x" };
it("quizOrder keeps listed order unless the quiz shuffles", () => {
  expect(quizOrder(quiz)).toEqual(["a", "b", "c"]);
  expect(quizOrder({ ...quiz, shuffle: true }, seeded(1)).sort()).toEqual(["a", "b", "c"]);
});
it("answeredCount counts only this quiz's non-null drafts", () => {
  expect(answeredCount(["a", "b", "c"], { a: A, b: null, z: A })).toBe(1);
});
it("buildQuizSubmission sends every item in quizItemIds order, null for the rest", () => {
  expect(buildQuizSubmission("p", quiz, { c: A, a: A }, 12_900)).toEqual({ kind: "quiz", packageId: "p", quizId: "q",
    answers: [{ itemId: "a", answer: A }, { itemId: "b", answer: null }, { itemId: "c", answer: A }], elapsedSeconds: 12 });
});
it("buildQuizSubmission clamps elapsed time to the limit", () => {
  expect(buildQuizSubmission("p", quiz, {}, 75_000).elapsedSeconds).toBe(60);
  expect(buildQuizSubmission("p", untimed, {}, 75_000).elapsedSeconds).toBe(75);
  expect(buildQuizSubmission("p", untimed, {}, 90_000_000).elapsedSeconds).toBe(86400);   // open for over a day
  expect(buildQuizSubmission("p", untimed, {}, -5_000).elapsedSeconds).toBe(0);           // wall clock moved back
});
it("quizSummary floors the score and states pass, fail and expiry", () => {
  const r = (o: Partial<QuizResult>): QuizResult => ({ score: 0.75, correctCount: 3, answeredCount: 3, total: 4,
    passThreshold: 0.75, passed: true, timedOut: false, elapsedSeconds: 83, results: [], ...o });
  expect(quizSummary(r({}))).toBe("75% · Passed · 3 of 4 correct · 1:23");
  expect(quizSummary(r({ score: 0.7467, passed: false, correctCount: 2 }))).toBe("74% · Not passed (needs 75%) · 2 of 4 correct · 1:23");
  expect(quizSummary(r({ score: 0.5, passThreshold: null, passed: null, correctCount: 2, elapsedSeconds: 10 }))).toBe("50% · 2 of 4 correct · 0:10");
  expect(quizSummary(r({ timedOut: true, elapsedSeconds: 60 }))).toBe("75% · Passed · 3 of 4 correct · 1:00 · Time’s up");
});
// web/test/rendering.test.tsx
it("QuizQuestion has a numbered kicker, no Check and no hints", () => {
  const out = html(<QuizQuestion packageId="p" item={sa} index={1} total={4} locked={false} result={null} onChange={() => {}} />);
  expect(out).toContain("Question 2 of 4 · Short answer"); expect(out).not.toMatch(CHECK); expect(out).not.toContain("Show a hint");
});
it("a locked QuizQuestion shows its unanswered verdict", () => {
  const out = html(<QuizQuestion packageId="p" item={sa} index={0} total={4} locked onChange={() => {}}
    result={{ itemId: "sa", answered: false, correct: false, score: 0, expected: "recall" }} />);
  expect(out).toContain("— Not answered"); expect(out).toContain('disabled=""');
});
// e2e/play.spec.ts. Add `type Page` to the @playwright/test import, and these helpers below the imports.
/** Runs logged so far for one sample quiz or game, read from the API so that other tests' runs do not matter. */
async function runs(page: Page, kind: "quiz" | "game", refId: string): Promise<number> {
  const res = await page.request.get(`/api/attempts?packageId=learning-how-to-learn&kind=${kind}&refId=${refId}&limit=200`);
  return ((await res.json()) as { attempts: unknown[] }).attempts.length;
}
/** History rows expected after `added` new runs: the Quiz and Game pages load at most 20 (`limit: 20`). */
const historyRows = (before: number, added: number) => Math.min(before + added, 20);
test("quiz: a failed submit locks the answers and one retry logs one run", async ({ page }) => {
  const before = await runs(page, "quiz", "quiz-basics");
  await page.goto("/");
  await page.getByRole("link", { name: "Quizzes · 1", exact: true }).click();
  await page.getByRole("link", { name: "Study techniques check" }).click();
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel(/just before you would forget/i).check();
  await page.getByLabel("Blank 1").fill("Again"); await page.getByLabel("Blank 2").fill("further");
  await page.getByLabel("Your answer").fill("recall"); await page.getByLabel("Your answer").press("Enter");  // in a quiz, Enter submits nothing
  await expect(page.getByText("3 of 4 answered")).toBeVisible(); await expect(page.locator(".result")).toHaveCount(0);  // the ordering stays untouched
  let posts = 0;
  await page.route("**/api/attempts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (++posts === 1) return route.fulfill({ status: 500, body: "{}" });
    await new Promise((r) => setTimeout(r, 300)); await route.continue();
  });
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await expect(page.getByText("1 unanswered will score 0.")).toBeVisible();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByRole("alert")).toContainText("weren’t submitted");
  await expect(page.getByLabel("Your answer")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit quiz" })).toHaveCount(0);   // a frozen run offers only Submit again
  await page.getByRole("button", { name: "Submit again" }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByRole("heading", { name: /^75% · Passed · 3 of 4 correct/ })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0); await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1));
  expect(posts).toBe(2);
  await page.getByRole("button", { name: "Retake quiz" }).click();
  await expect(page.getByText("0 of 4 answered")).toBeVisible(); await expect(page.locator(".result")).toHaveCount(0);
  await expect(page.getByLabel("Your answer")).toBeEnabled(); await expect(page.getByLabel("Your answer")).toHaveValue("");
});
test("quiz: expiry submits once, without the unanswered prompt", async ({ page }) => {
  await page.clock.install();
  // The sample quiz has no time limit, so give one to the client. The server still scores its own copy.
  await page.route("**/api/quizzes/learning-how-to-learn/quiz-basics", async (route) => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, quiz: { ...body.quiz, timeLimitSeconds: 60 } } });
  });
  let posts = 0;
  await page.route("**/api/attempts", (r) => { if (r.request().method() === "POST") posts += 1; return r.continue(); });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await expect(page.getByText("4 questions · 1:00 limit · pass 75%")).toBeVisible();
  await page.getByRole("button", { name: "Start quiz" }).click();
  await expect(page.getByRole("timer", { name: "Time left" })).toBeVisible();
  await page.clock.fastForward("01:01");
  await expect(page.getByRole("heading", { name: /^0% · Not passed \(needs 75%\) · 0 of 4 correct · 1:00/ })).toBeFocused();
  await expect(page.getByText(/unanswered will score 0/)).toHaveCount(0);
  await expect(page.getByLabel("Your answer")).toBeDisabled(); expect(posts).toBe(1);
});
test("quiz: expiry during an in-flight submit logs one run", async ({ page }) => {
  await page.clock.install();
  const before = await runs(page, "quiz", "quiz-basics");
  await page.route("**/api/quizzes/learning-how-to-learn/quiz-basics", async (route) => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, quiz: { ...body.quiz, timeLimitSeconds: 60 } } });
  });
  let posts = 0; let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/attempts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts += 1; await held; await route.continue();
  });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel(/just before you would forget/i).check();
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();   // this submit is still in flight at the limit
  await expect(page.getByLabel("Your answer")).toBeDisabled();
  await page.clock.fastForward("01:01");
  release();
  // 0:0x, not 1:00: the manual payload was sent, and expiry froze no second one
  await expect(page.getByRole("heading", { name: /^25% · Not passed \(needs 75%\) · 1 of 4 correct · 0:0\d$/ })).toBeFocused();
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1)); expect(posts).toBe(1);
});
test("quiz: a submit held across expiry is sent once and resent unchanged", async ({ page }) => {
  await page.clock.install();
  const before = await runs(page, "quiz", "quiz-basics");
  await page.route("**/api/quizzes/learning-how-to-learn/quiz-basics", async (route) => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({ response, json: { ...body, quiz: { ...body.quiz, timeLimitSeconds: 60 } } });
  });
  const bodies: unknown[] = []; let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/attempts", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) { await held; return route.fulfill({ status: 500, body: "{}" }); }
    await route.continue();
  });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel("Your answer").fill("recall");
  await page.getByRole("button", { name: "Submit quiz" }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByText("3 unanswered will score 0.")).toBeVisible();
  await page.getByRole("button", { name: "Submit anyway" }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByRole("timer", { name: "Time left" })).toHaveCount(0);   // the payload is frozen
  await page.clock.fastForward("01:01");                                         // expiry while POST #1 is held
  release();
  await expect(page.getByRole("alert")).toContainText("weren’t submitted");
  expect(bodies).toHaveLength(1);
  await page.getByRole("button", { name: "Submit again" }).click();
  // no "Time’s up": the resend still carries the manual time, not the limit
  await expect(page.getByRole("heading", { name: /^\d+% · Not passed \(needs 75%\) · [01] of 4 correct · 0:\d\d$/ })).toBeFocused();
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
  expect((bodies[0] as { elapsedSeconds: number }).elapsedSeconds).toBeLessThan(60);
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1));
});
test("quiz: leaving a run asks first, and abandoning it in the app logs nothing", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/attempts", (r) => { if (r.request().method() === "POST") posts += 1; return r.continue(); });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel(/just before you would forget/i).check();       // a real click: Chromium asks only after a user gesture
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Games" }).click();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Start quiz" })).toBeVisible();   // the abandoned run is gone
  expect(posts).toBe(0);
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByLabel(/just before you would forget/i).check();
  const [dialog] = await Promise.all([page.waitForEvent("dialog"), page.close({ runBeforeUnload: true })]);
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();                                                 // stay on the page
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByRole("heading", { name: /^25% · Not passed/ })).toBeFocused();
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); void d.accept(); });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(dialogs).toEqual([]); expect(posts).toBe(1);                     // a submitted run no longer asks
});
test("quiz: a missing or changed quiz says so and offers no retry", async ({ page }) => {
  await page.goto("/quizzes/learning-how-to-learn/ghost");
  await expect(page.getByText("This quiz isn’t in your library any more.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the library" })).toBeVisible();
  await page.route("**/api/attempts", (route) => route.request().method() !== "POST" ? route.continue()
    : route.fulfill({ status: 422, json: { error: { code: "not_checkable", message: "x" } } }));
  // The history GET carries a query string, which the glob above does not match; a regex does.
  await page.route(/\/api\/attempts\?/, (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  await page.goto("/quizzes/learning-how-to-learn/quiz-basics");
  await expect(page.getByText("History couldn’t be loaded.")).toBeVisible();      // the quiz itself still loads and starts
  await page.getByRole("button", { name: "Start quiz" }).click();
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await page.getByRole("button", { name: "Submit anyway" }).click();
  await expect(page.getByText("This quiz changed since you started it — reload to start again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit again" })).toHaveCount(0);   // a 422 would fail on every resend
  await expect(page.getByLabel("Your answer")).toBeDisabled();
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); void d.accept(); });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => page.isClosed()).toBe(true);
  expect(dialogs).toEqual([]);                                             // a stale run can be reloaded without a prompt
});
```
- [ ] **Step 2: Run them and confirm they fail.**
  - `npx vitest run web/test/quizRun.test.ts web/test/rendering.test.tsx` fails because `../src/quizRun.js` and `../src/components/QuizQuestion.js` do not resolve.
  - `npm run e2e -- -g "quiz:"` fails because `/quizzes/:packageId/:quizId` has no route yet: the expiry test times out on `4 questions · 1:00 limit · pass 75%`, the missing-or-changed test on "This quiz isn’t in your library any more.", and the other four on the "Start quiz" button.
- [ ] **Step 3: Implement `quizRun.ts`, `QuizQuestion`, `PlaySummary` and `Quiz()`.**
  - **`quizRun.ts`.**
    - `quizOrder` returns `quizItemIds(quiz)`, and shuffles it only when `quiz.shuffle === true`.
    - `buildQuizSubmission` sends `floor(elapsedMs/1000)` seconds, clamped to `[0, MAX_ELAPSED_SECONDS]` (imported from `@study/shared`) and then capped at the quiz's limit when it has one. A run left open for over a day, or a wall clock moved backwards, would otherwise send a value the schema rejects with 400 on every retry.
    - `quizSummary` joins its parts with `" · "`:
      1. `{percent}%`
      2. `Passed`, or `Not passed (needs {percent(threshold)}%)`, but only when `passed !== null`
      3. `{correctCount} of {total} correct`
      4. `formatClock(elapsedSeconds)`
      5. `Time’s up`, but only when `timedOut`
  - **`QuizQuestion`.** It renders a `section.work` holding three parts:
    - `ItemPrompt`, with the kicker `Question {index+1} of {total} · {TYPE_LABEL[type]}`
    - `AnswerForm`, with only `onChange` and with `disabled={locked}`
    - `Verdict`, with `answered={result.answered}`, once there is a result
  - **`Quiz()` state.**
    - the load result: the payload, an error, or missing (on `not_found`)
    - `history`
    - `run: { key: number; order: string[]; startedAt: number } | null`
    - `drafts` and `confirming`
    - a synchronous `frozen` ref holding the `QuizSubmission`, set at the first submit, mirrored into `payload: QuizSubmission | null` state only for rendering; while it is set, every form is locked
    - a synchronous `inFlight` ref plus `pending`
    - `submitError`, `stale` and `result`
  - **Loading.**
    - `getQuiz` and `listAttempts({ packageId, kind: "quiz", refId: quizId, limit: 20 })` load independently.
    - If only the history fails, show "History couldn’t be loaded." in its place.
  - **The intro** shows, in the order of a lesson head (`Lesson.tsx:65-67`): `p.eyebrow` with the facts (copy below), `h1.page-title` with the quiz title, and `p.page-sub` with the description when it is set, both as plain text. Then come Start quiz and History.
  - **Start.**
    - The click handler sets `startedAt = Date.now()` and `order = quizOrder(quiz)`, clears the drafts and bumps `run.key`. Do not do this in an effect.
    - Retake does the same and also clears `result`, `frozen`, `payload`, `confirming`, `submitError` and `stale`. That remounts every question with fresh shuffles and unlocked forms.
  - **The questions.**
    - Every id in `run.order` renders as ``<QuizQuestion key={`${run.key}:${id}`}>`` and stays mounted until Retake. The `run.key` prefix is what remounts them: an unshuffled quiz keeps the same ids in the same order after Retake.
    - Each question's result comes from `result.results`, matched by `itemId`.
    - An id that is missing from `items`, or that is a flashcard, is not shown. The payload still lists it, so the server answers 422, and the page then shows the stale message.
  - **The bar.** Until a result arrives, `.quiz-bar` shows:
    - the `Clock`, only while the quiz has a limit and no payload is frozen. Once its start is null, `useClock` reads 0, so a clock left on screen would jump back to the full limit during a retry.
    - `{k} of {n} answered`
    - the Submit quiz button, only while no payload is frozen. If any question is unanswered, it opens the inline confirm first (`span.confirm`, the `Library.tsx:188-203` pattern). Freezing a payload also closes the confirm, so after a failed submit the bar offers only Submit again.
  - **Freezing the payload.**
    - Both paths check `frozen.current` first and return at once when it is set. Otherwise they build the submission and store it in `frozen.current` synchronously, before any state update, then mirror it into `payload`. A second click in the same tick still sees `payload === null` in its closure, but finds the ref set, so it cannot build a second submission.
    - A manual submit freezes `buildQuizSubmission(…, Date.now() − startedAt)`.
    - Expiry is handled by `useClock(payload === null && run && limit !== null ? run.startedAt : null, limit, onExpire)`, with `const limit = quiz.timeLimitSeconds ?? null`. `onExpire` freezes the payload with `elapsedMs = limit*1000` and sends it at once, with no confirm.
    - An untimed quiz passes a null start, so no 250 ms interval re-renders the page and its always-mounted questions while the learner types. Nothing reads the clock there: no Clock is shown, and a manual submit reads `Date.now()` itself.
  - **`send()`.**
    - It returns at once if a send is already in flight. It sends `frozen.current`.
    - It clears `submitError` and `stale` before each request.
    - On success, it sets the result and refetches the history. `PlaySummary` then takes focus.
    - If `isStale(e)`, it shows the stale message and offers no retry.
    - On any other error, it shows the alert and "Submit again", which resends `frozen.current` unchanged.
  - **The result.** Once a result arrives, the `.quiz-bar` is gone and the page shows, in order: `PlaySummary` with `quizSummary(result)`, the questions with their Verdicts in place, "Retake quiz", the "All quizzes" link and History (refetched).
  - **Leaving the page.** While `run && !result && !stale`, a `beforeunload` listener calls `preventDefault()` and sets `returnValue = ""`. Add it in an effect keyed on that condition, so a result, a stale run (whose message tells the learner to reload) or an in-app navigation (which unmounts the page) removes it.
```
This quiz isn’t in your library any more.      + Link "Back to the library" → "/"
This quiz didn’t load.  {message}              + button "Try again"
All quizzes                                    (back-link → /quizzes; also a link in the done state)
{n} question(s) · {m:ss} limit | no time limit · pass {p}%   (intro eyebrow; pass only with a threshold)
Start quiz · Submit quiz · Keep answering · Submit anyway · Submit again · Retake quiz
{k} of {n} answered
{N} unanswered will score 0.
Your answers weren’t submitted ({message}).
This quiz changed since you started it — reload to start again.
History couldn’t be loaded.
```
- [ ] **Step 4: Run tests and confirm they pass.**
  - `npm test` passes.
  - `npm run typecheck` exits 0.
  - `npm run e2e` passes the smoke test and all nine play tests (10 passed).
- [ ] **Step 5: Commit**
```bash
git add web/src/quizRun.ts web/src/components/QuizQuestion.tsx web/src/components/PlaySummary.tsx web/src/pages/Quiz.tsx web/src/App.tsx web/src/styles/components.css web/test/quizRun.test.ts web/test/rendering.test.tsx e2e/play.spec.ts
git commit -m "feat: add the quiz runner page"
```

---

### Task 24: Web — Game page and ItemRun

**Files:**
- Create: `web/src/components/ItemRun.tsx`, `web/src/pages/Game.tsx`
- Modify: `web/src/App.tsx`. Add a keyed `GameRoute` wrapper beside `QuizRoute`, and the route `/games/:packageId/:gameId`.
- Modify: `web/src/styles/components.css`. Add a `/* ---- Games ---- */` section after Quiz with `.game-bar`, a row holding only the template label (`TEMPLATE_LABEL[template]`) and the Clock. Progress is not repeated there: ItemRun's kicker and MatchingBoard's `p.meta` (Task 25) carry it, and Task 25's e2e finds the board's progress text by `getByText`, so it must appear once on the page.
- Test: `web/test/rendering.test.tsx`, `e2e/play.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 20: `ItemPrompt`, `AnswerForm`, `Verdict`, `TYPE_LABEL`.
  - From Task 21: `getGame`, `checkMove`, `submitGame`, `listAttempts`, `isStale`, `GamePayload`, `useClock`, `Clock`, `formatClock`, `percent`.
  - From Task 22: `TEMPLATE_LABEL`, `History`.
  - From Task 23: `PlaySummary`, and the e2e helpers `runs` and `historyRows`.
  - From Tasks 4 and 8: `dealGame(game, pool, random?)`, `roundSizeFor(game, pool): number`, `GameDeal`.
  - From Task 8: `GameMoveResult`.
  - From Task 9: `GameResult`.
  - From Task 6: `GameMove`, `GamePlay`, `GameSubmission`, `MAX_ELAPSED_SECONDS`.
- Produces:
  - The default export `ItemRun({ packageId, items, deal, disabled, check, onDone }: { packageId: string; items: readonly CheckableItem[]; deal: Extract<GameDeal, { template: "timed-round" | "order-it" }>; disabled: boolean; check: (move: GameMove) => Promise<GameMoveResult | null>; onDone: () => void })`.
  - `export function GameResultSummary({ result }: { result: GameResult })`, in `Game.tsx`. It is not called `GameSummary`, which is Task 21's package-list type and may already be imported in `rendering.test.tsx` for Task 22's fixtures.
  - The default export `Game()`. Its `check(move: GameMove): Promise<GameMoveResult | null>` resolves `null` whenever the move was not checked: another check was in flight, the game had ended, a new play had started, or the request failed.
  - Task 25 uses `check`, `finish`, `over`, `pending`, `stale` and `round` from `Game()`.

- [ ] **Step 1: Write the failing tests**
```tsx
// web/test/rendering.test.tsx. mcHinted = { ...mc, hints: ["Think about timing."] }
it("GameResultSummary floors the score and reads matched, misses, time and expiry", () => {
  const r = (o: Partial<GameResult>): GameResult => ({ template: "matching", score: 0.75, correctCount: 3, total: 3,
    mistakes: 1, completed: true, timedOut: false, elapsedSeconds: 42, ...o });
  expect(html(<GameResultSummary result={r({})} />)).toContain("75% · 3 of 3 matched · 1 miss · 0:42");
  expect(html(<GameResultSummary result={r({ score: 0.6, mistakes: 2 })} />)).toContain("60% · 3 of 3 matched · 2 misses · 0:42");
  expect(html(<GameResultSummary result={r({ template: "timed-round", score: 0, correctCount: 0, total: 2, mistakes: 0,
    completed: false, timedOut: true, elapsedSeconds: 60 })} />)).toContain("0% · 0 of 2 correct · 1:00 · Time’s up");
  expect(html(<GameResultSummary result={r({ template: "order-it", score: 0.7467, correctCount: 0, total: 1 })} />))
    .toContain("74% · 0 of 1 correct · 0:42");
});
it("ItemRun shows one numbered question with Check and no hints", () => {
  const out = html(<ItemRun packageId="p" items={[mcHinted, ms]} deal={{ template: "timed-round", itemIds: ["mc", "ms"] }}
    disabled={false} check={async () => null} onDone={() => {}} />);
  expect(out).toContain("Question 1 of 2 · Choose one"); expect(out.match(/class="work"/g)).toHaveLength(1);
  expect(out).toMatch(CHECK); expect(out).not.toContain("Show a hint");
});
// e2e/play.spec.ts
test("timed round: expiry submits once and drops a late check, even after Play again", async ({ page }) => {
  await page.clock.install();
  const before = await runs(page, "game", "game-speed");
  await page.goto("/");
  await page.getByRole("link", { name: "Games · 3", exact: true }).click();
  await page.getByRole("link", { name: "Quick fire" }).click();
  let posts = 0; let checks = 0; const bodies: any[] = [];
  let held: Promise<void> | null = null;
  /** Holds the next check request until the returned function is called. */
  const holdNextCheck = () => { let release!: () => void; held = new Promise<void>((r) => (release = r)); return release; };
  /** Lets the page act on a response that has already arrived: one frame, then one task (time still flows under clock.install). */
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  await page.route("**/api/attempts", (r) => {
    if (r.request().method() !== "POST") return r.continue();
    bodies.push(r.request().postDataJSON());
    if (++posts === 1) return r.fulfill({ status: 500, body: "{}" });
    return r.continue();
  });
  await page.route("**/api/games/**/check", async (route) => {
    checks += 1; const wait = held; held = null;
    if (wait) await wait;
    await route.continue();
  });
  const check = page.getByRole("button", { name: "Check", exact: true });
  const option = page.locator(".opt input").first();
  const timesUp = page.getByRole("heading", { name: "0% · 0 of 2 correct · 1:00 · Time’s up" });
  // Round 1: a check is in flight at expiry, and the first save fails.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("timer", { name: "Time left" })).toBeVisible();
  const release1 = holdNextCheck();
  await option.check(); await check.click();
  await page.clock.fastForward("01:01");
  await expect(page.getByRole("alert")).toContainText("Your score wasn’t saved");
  let late = page.waitForResponse("**/api/games/**/check");
  release1(); await late; await settle();
  await expect(page.locator(".verdict")).toHaveCount(0);                     // the late result shows no verdict
  await expect(option).toBeDisabled();                                       // and the ended board stays locked
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(timesUp).toBeFocused();
  expect(bodies[1].play.answers).toEqual([]); expect(bodies[1]).toEqual(bodies[0]);  // Try again resends the frozen payload, without the late answer
  // Round 2: a check is still in flight when the round expires and Play again starts round 3.
  await page.getByRole("button", { name: "Play again" }).click();
  const release2 = holdNextCheck();
  await option.check(); await check.click();
  await page.clock.fastForward("01:01");
  await expect(timesUp).toBeFocused();
  await page.getByRole("button", { name: "Play again" }).click();
  // Round 3: Play again unlocked the new board, and round 2's late result lands while round 3's own check is out.
  const release3 = holdNextCheck();
  await option.check(); await expect(check).toBeEnabled(); await check.click();
  await expect(option).toBeDisabled();                                       // round 3's check is in flight
  late = page.waitForResponse("**/api/games/**/check");
  release2(); await late; await settle();
  await expect(option).toBeDisabled(); await expect(check).toHaveCount(0);   // the late finally did not unlock round 3's board
  await expect(page.locator(".verdict")).toHaveCount(0);                     // nor show a verdict on it
  release3();
  await expect(page.locator(".result .verdict")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await option.check(); await check.click();
  await expect(page.locator(".result .verdict")).toBeVisible();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: /^\d+% · [012] of 2 correct · \d+:\d\d$/ })).toBeFocused();
  await expect(page.getByText("This game changed since you started")).toHaveCount(0);
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 3));
  expect(posts).toBe(4); expect(checks).toBe(4);
});
test("order it: a retried check clears the error, a double click sends one check, and the score is logged", async ({ page }) => {
  const before = await runs(page, "game", "game-order");
  await page.goto("/");
  await page.getByRole("link", { name: "Games · 3", exact: true }).click();
  await page.getByRole("link", { name: "Put it in order" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByText("Question 1 of 1 · Put these in order")).toBeVisible();
  let checks = 0;
  await page.route("**/api/games/**/check", async (route) => {
    if (++checks === 1) return route.fulfill({ status: 500, body: "{}" });
    await new Promise((r) => setTimeout(r, 300)); await route.continue();
  });
  // exact: the step "Check and correct" puts "Check" in two Move buttons' names
  const check = page.getByRole("button", { name: "Check", exact: true });
  await check.click();
  await expect(page.getByRole("alert")).toContainText("That move wasn’t checked");
  await check.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.locator(".result .verdict")).toBeVisible(); expect(checks).toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);                     // the retry cleared the old error
  await expect(page.getByRole("button", { name: "Finish" })).toBeFocused();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: /^\d+% · [01] of 1 correct · \d+:\d\d$/ })).toBeFocused();
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1));
});
test("order it: a missing or changed game says so, locks the board and records nothing", async ({ page }) => {
  await page.goto("/games/learning-how-to-learn/ghost");
  await expect(page.getByText("This game isn’t in your library any more.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the library" })).toBeVisible();
  await page.route("**/api/games/**/check", (route) =>
    route.fulfill({ status: 422, json: { error: { code: "not_checkable", message: "x" } } }));
  // The history GET carries a query string, which a "**/api/attempts" glob does not match; a regex does.
  await page.route(/\/api\/attempts\?/, (route) => route.fulfill({ status: 500, body: "{}" }), { times: 1 });
  let posts = 0;
  await page.route("**/api/attempts", (r) => { if (r.request().method() === "POST") posts += 1; return r.continue(); });
  await page.goto("/games/learning-how-to-learn/game-order");
  await expect(page.getByText("History couldn’t be loaded.")).toBeVisible();      // the game itself still loads and plays
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("timer", { name: "Time taken" })).toBeVisible();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("This game changed since you started — reload to play again.")).toBeVisible();
  await expect(page.getByText("That move wasn’t checked")).toHaveCount(0);   // not the retryable error
  await expect(page.locator(".result .verdict")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check", exact: true })).toHaveCount(0);   // a stale board takes no more moves
  await expect(page.getByRole("timer")).toHaveCount(0);                                     // and its clock has stopped
  expect(posts).toBe(0);                                                                    // a stale play is never saved
});
```
- [ ] **Step 2: Run them and confirm they fail.**
  - `npx vitest run web/test/rendering.test.tsx` fails because `../src/pages/Game.js` and `../src/components/ItemRun.js` do not resolve.
  - `npm run e2e -- -g "timed round|order it"` fails because `/games/:packageId/:gameId` has no route yet: the timed-round test and the order-it retry test time out on the "Play" button, and the missing-or-changed test on "This game isn’t in your library any more.".
- [ ] **Step 3: Implement `ItemRun`, `GameResultSummary` and `Game()`.**
  - **`GameResultSummary`** renders `<PlaySummary>`. The text joins its parts with `" · "`:
    - matching: `{percent}%`, `{k} of {n} matched`, `{m} miss` (or `misses`), `{m:ss}`;
    - the other templates: `{percent}%`, `{k} of {n} correct`, `{m:ss}`;
    - all templates add `Time’s up` at the end when the play timed out.
  - **State in `Game()`:**
    - plain state: the load result, `history`, `phase: "intro" | "playing" | "done"`, a `round` key, `deal` and `startedAt`;
    - synchronous refs: `play` (a `GamePlay`), `checking`, `submitting`, `ended`, `frozen` (the `GameSubmission`) and `run`, a counter bumped whenever a new play starts, so a late check response cannot edit the new play (the pattern of `web/src/pages/Study.tsx:41-42` and `:100-104`);
    - more state: `over` (set together with `ended`), `pending`, `saving`, `checkError`, `saveError`, `stale` and `result`.
  - **Loading.** `getGame` and `listAttempts({ packageId, kind: "game", refId: gameId, limit: 20 })` load independently on mount, and the history loads again after each successful `send()`. If only the history fails, show "History couldn’t be loaded." in its place.
  - **Play.** The click handler:
    - deals with `dealGame(game, items)`;
    - sets `play` to `{ template: "matching", lefts, picks: [] }` for matching, or to `{ template, itemIds, answers: [] }` otherwise;
    - bumps `run`; sets `checking` to false and `pending` to false; clears `checkError` and `stale`; clears `ended` and `over`; sets `startedAt = Date.now()`; and bumps `round`.
  - **The clock** is `useClock(phase === "playing" && !over && !stale ? startedAt : null, settings.timeLimitSeconds, finish)`. With no limit, the Clock is a stopwatch. The `.game-bar` shows the `Clock` only while `!over && !stale`, because `useClock` reads 0 once stopped. A stale play can never be saved, so its clock stops and a timed round does not expire into a doomed submission.
  - **`check(move)`:**
    - It returns `null` at once if the game has ended or a check is in flight. Otherwise it captures `const startedIn = run.current`, clears `checkError`, sets `checking` and `pending`, then calls `checkMove`.
    - If the response or error arrives when `ended.current || run.current !== startedIn`, it returns `null`. It appends nothing and shows no message.
    - A response that arrives in the same play before the game ended appends the move to `play.picks` (for `{left,right}`) or to `play.answers` (for `{itemId,answer}`), then returns the result. It pushes onto the live `play` arrays, which `finish()` freezes without copying, so a late result that slipped through would reach a resend; the timed-round e2e test relies on that to see a missing drop.
    - An error that arrives in the same play before the game ended shows the stale message if `isStale(e)`, and the `checkError` alert otherwise. In both cases it records nothing and returns `null`.
    - The `finally` clears both flags only when `run.current === startedIn`, so a late response from an earlier play can neither unlock nor lock the new board.
  - **`finish()`** runs once, guarded by `ended`:
    - It freezes `{ kind: "game", packageId, gameId, play, elapsedSeconds }`, where `elapsedSeconds` is `floor((Date.now() − startedAt)/1000)` clamped to `[0, MAX_ELAPSED_SECONDS]` and then capped at the limit. The clamp matters most for stopwatch games, which have no limit.
    - It then calls `send()`. `send()` has its own `submitting` ref, separate from `checking`, so an expiry during an in-flight check still submits.
    - `send()` clears `saveError` and `stale` before each request. On success, it moves to `done` and refetches the history. If `isStale(e)`, it shows the stale message. Any other error shows `saveError` and "Try again", which resends the frozen payload.
  - **The board.** For the item templates, it is `<ItemRun key={round} … disabled={over || pending || stale} check={check} onDone={finish} />`. Task 25 adds the matching branch; until then, a matching deal renders no board. The board stays mounted, disabled, while a failed save shows `saveError`, and after a stale check, whose message tells the learner to reload. The phase changes to `done` only after `send()` succeeds.
  - **The intro** shows, in order: `p.eyebrow` with `TEMPLATE_LABEL[template]`, `h1.page-title` with the game title as plain text, the template's one-line rule (copy below), the facts `{n} pair(s)|question(s)|sequence(s) · {m:ss} limit | no time limit` with `n = roundSizeFor(game, items)` (singular when `n` is 1, as the quiz's `{n} question(s)`; the sample `game-order` reads "1 sequence"), Play, and History.
  - **The done phase** shows, in order: `GameResultSummary`, "Play again" (a fresh deal), the "All games" link, and History.
  - **`ItemRun`** shows one `section.work` for question `i` of `deal.itemIds`, looked up in `items`. In order, it holds:
    - `ItemPrompt` with the kicker `Question {i+1} of {n} · {label}`;
    - `<AnswerForm key={i} disabled={disabled || verdict !== null} onSubmit={(answer) => check({ itemId, answer })} />`;
    - `Verdict`, when the result has a `score`;
    - Next, or Finish on the last question. That button takes focus when the verdict appears.

    A `null` result leaves the form as it was, and Check comes back once `disabled` clears.
```
This game isn’t in your library any more.      + Link "Back to the library" → "/"
This game didn’t load.  {message}              + button "Try again"
All games                                      (back-link → /games; also a link in the done state)
matching:    Pick a term, then its match. A wrong pair counts as a miss.
timed-round: Answer as many as you can before the clock runs out.
order-it:    Put each sequence in the right order.
Play · Play again · Next · Finish · Try again
That move wasn’t checked ({message}). Try again.
Your score wasn’t saved ({message}).
This game changed since you started — reload to play again.
History couldn’t be loaded.
```
- [ ] **Step 4: Run tests and confirm they pass.**
  - `npm test` passes, and `npm run typecheck` exits 0.
  - `npm run e2e` passes smoke and the twelve play tests (13 passed).
  - The e2e runs a production build, which never replays effects, so also check once by hand under StrictMode. Do it only when port 4321 is free, because the Vite proxy is fixed to it (`web/vite.config.ts:6`). Run `npm start -w server` and `npm run dev -w web`, then play "Quick fire" until it expires. Exactly one new History row should appear. Stop both processes before the next `npm run e2e`.
- [ ] **Step 5: Commit**
```bash
git add web/src/components/ItemRun.tsx web/src/pages/Game.tsx web/src/App.tsx web/src/styles/components.css web/test/rendering.test.tsx e2e/play.spec.ts
git commit -m "feat: add the game page with timed-round and order-it runs"
```

---

### Task 25: Web — Matching board

**Files:**
- Create: `web/src/components/MatchingBoard.tsx`
- Modify: `web/src/pages/Game.tsx` — for a matching deal, mount `<MatchingBoard key={round} deal={deal} disabled={over || pending || stale} check={check} onDone={finish} />`.
- Modify: `web/src/styles/components.css` — in the Games section, add `.board`, `.board-col`, `.tile`, `.tile[aria-pressed="true"]`, `.tile.is-matched` and `.tile.is-wrong`.
- Modify: `web/src/styles/math.css` — add `.tile-text` to the selector at :21.
- Test: `web/test/rendering.test.tsx`, `e2e/play.spec.ts`

**Interfaces:**
- Consumes:
  - `GameDeal`, `GameMove` and `GameMoveResult` (Tasks 6 and 8)
  - `InlineMarkdown` (`Markdown.tsx:162`)
  - `check`, `finish`, `over`, `pending`, `stale` and `round` from `Game()` (Task 24)
  - the e2e helpers `runs` and `historyRows` (Task 23)
- Produces: the default export `MatchingBoard({ deal, disabled, check, onDone }: { deal: Extract<GameDeal, { template: "matching" }>; disabled: boolean; check: (move: GameMove) => Promise<GameMoveResult | null>; onDone: () => void })`.

- [ ] **Step 1: Write the failing tests**
```tsx
// web/test/rendering.test.tsx
it("MatchingBoard: math lefts, plain rights, a repeated right is two tiles", () => {
  const deal = { template: "matching" as const, lefts: ["$x^2$", "Plain"], rights: ["*square*", "other", "*square*"] };
  const out = html(<MatchingBoard deal={deal} disabled={false} check={async () => null} onDone={() => {}} />);
  expect(out).toMatch(/<span class="tile-text"><span class="katex">/);
  expect(out.match(/aria-pressed="false"/g)).toHaveLength(5);
  expect(out.match(/>\*square\*<\/button>/g)).toHaveLength(2); expect(out).not.toContain("<em>");
  expect(out).toContain('<p class="meta" aria-live="polite">0 of 2 matched · 0 misses</p>');
});
// e2e/play.spec.ts
test("matching: one miss on three pairs scores 75%", async ({ page }) => {
  const before = await runs(page, "game", "game-match");
  await page.goto("/");
  await page.getByRole("link", { name: "Games · 3", exact: true }).click();
  await page.getByRole("link", { name: "Match the techniques" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  let checks = 0;
  await page.route("**/api/games/**/check", async (route) => { checks += 1; await new Promise((r) => setTimeout(r, 300)); await route.continue(); });
  const tile = (name: string) => page.getByRole("button", { name, exact: true });
  const firstOpenTerm = page.getByRole("group", { name: "Terms" }).getByRole("button", { disabled: false }).first();
  await tile("Spaced repetition").click();
  await tile("Test yourself before checking").evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByText("0 of 3 matched · 1 miss")).toBeVisible(); expect(checks).toBe(1);
  await expect(firstOpenTerm).toBeFocused();                 // focus goes back to the first unmatched term
  await tile("Spaced repetition").click(); await tile("Grow the gap between reviews").click();
  await expect(page.getByText("1 of 3 matched · 1 miss")).toBeVisible(); await expect(firstOpenTerm).toBeFocused();
  for (const [l, r] of [["Active recall", "Test yourself before checking"], ["Interleaving", "Mix topics within one session"]]) {
    await tile(l).click(); await tile(r).click();          // a click waits while the board is disabled
  }
  await expect(page.getByRole("heading", { name: /^75% · 3 of 3 matched · 1 miss · \d+:\d\d$/ })).toBeFocused();
  await expect(page.locator(".history li")).toHaveCount(historyRows(before, 1)); expect(checks).toBe(4);
});
```
- [ ] **Step 2: Run them and confirm they fail.**
  - `npx vitest run web/test/rendering.test.tsx` fails, because `../src/components/MatchingBoard.js` does not resolve.
  - `npm run e2e -- -g "matching:"` fails, because no board is mounted and so there are no tile buttons.
- [ ] **Step 3: Implement `MatchingBoard`, mount it, and style the tiles.**
  - **Layout.** `.board` holds two `.board-col` columns. Each column has `role="group"`, with the `aria-label` "Terms" or "Matches".
  - **Tiles.** Every tile is a `<button className="tile" aria-pressed>`. A tile is disabled while `disabled` is set, and stays disabled once it is matched.
    - Left tiles render `<span className="tile-text"><InlineMarkdown>`.
    - Right tiles render plain text and are keyed by index. A repeated right text therefore gives separate tiles, which the server judges by text.
  - **Picks.** Pick one tile on each side, in either order. Then call `check({ left, right: deal.rights[index] })`:
    - `{ correct: true }`: the left tile and that right index become `.is-matched`.
    - `{ correct: false }`: both tiles get `.is-wrong` for 600 ms, and the miss count goes up by 1. Clear that timer on unmount.
    - `null`: nothing is recorded.

    Every resolved pick (correct, wrong or `null`) clears both selections at once; the 600 ms timer only removes `.is-wrong`. Clicking a pressed tile unpresses it. After each resolved pick, focus moves to the first unmatched left tile. Do not call `.focus()` straight after `await check(…)`: Game's `setPending(false)` has not been committed yet, so every tile is still disabled and the call does nothing. Instead, a resolved pick records a focus request in state, and an effect keyed on that request and on `disabled` focuses the tile once `disabled` is false.
  - **Progress.** `<p className="meta" aria-live="polite">` reads `{k} of {n} matched · {m} miss|misses`.
  - **End.** When every left is matched, call `onDone()` once. Distractors are simply rights that are never correct.
  - **CSS.**
    - `.tile` follows `.opt` (:373-387): `min-height: 2.75rem`, a paper background and a rule border.
    - `[aria-pressed="true"]` copies `.opt:has(input:checked)` (:394-398).
    - `.is-matched` uses `--marker-wash`, `--on-wash` and `--marker-edge`.
    - `.is-wrong` uses a `--pen-red` border, a `--pen-red-soft` background and a short shake. `base.css:223-232` already handles reduced motion.
- [ ] **Step 4: Run tests and confirm they pass.**
  - `npm test` passes.
  - `npm run typecheck` exits 0.
  - `npm run e2e` passes smoke and all thirteen play tests (14 passed).
  - The stage's e2e gate:
    - Note N, the number of leftover temp dirs: `node -e "const fs=require('fs'),os=require('os');console.log(fs.readdirSync(os.tmpdir()).filter(n=>n.startsWith('study-e2e-')).length)"`.
    - Run `npm run e2e` twice. Each run reports 14 passed across 2 files: 1 in smoke and 13 in play.
    - Run the count again. It still prints N.
    - `git diff main -- e2e/smoke.spec.ts` prints nothing.
- [ ] **Step 5: Commit**
```bash
git add web/src/components/MatchingBoard.tsx web/src/pages/Game.tsx web/src/styles/components.css web/src/styles/math.css web/test/rendering.test.tsx e2e/play.spec.ts
git commit -m "feat: add the matching board"
```

---

### Task 26: Docs — spec §2.4/§2.5/§2.6/§5/§8 and status, content/README.md, README.md

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-study-app-design.md`:
  - the status line (:4)
  - §2.4, after the type-level constraints paragraph (:180-182)
  - §2.5, after its code block (:186-197)
  - §2.6, after the compatibility paragraph (:215-217)
  - the §5 route list (:281-290)
  - §8 (:320-325)
- Modify: `content/README.md`:
  - add a `## Quizzes and games` section between Authoring notes (:58-76) and `## Math` (:78)
  - add a math-table row after :108
- Modify: `README.md`:
  - the status (:3-7)
  - add an `## API` section after Packages (:31-35)
  - the Tests line (:40)

**Interfaces:**
- Consumes: the rules as built.
  - `GAME_DEFAULTS`, `MAX_MATCH_DISTRACTORS` and the source rules of `resolveGameItems` (Task 4)
  - the regex rules, `MAX_PATTERN_LENGTH` and `MAX_ANSWER_TEXT` (Task 2)
  - the `'back'` grade rule (Task 11)
  - the duplicate rules (Task 5)
  - the size caps, `MAX_PLAY_ITEMS` and `MAX_MATCH_TEXT` (Task 6)
  - scoring (Tasks 7 and 9)
  - routes (Tasks 13–18)
  - timers (Tasks 23–24)
- Produces: the spec text that Stage 3 plans against.

- [ ] **Step 1: Write the failing checks**
```bash
grep -c "GET /lessons/:id" docs/superpowers/specs/2026-08-03-study-app-design.md                   # before 1, after 0
grep -c "Stages 1–2 implemented" docs/superpowers/specs/2026-08-03-study-app-design.md             # before 0, after 1
grep -c "backreferences" docs/superpowers/specs/2026-08-03-study-app-design.md                     # before 0, after 1
grep -c "POST /games/:packageId/:gameId/check" docs/superpowers/specs/2026-08-03-study-app-design.md README.md   # before 0/0, after ≥1 each
grep -c "^## Quizzes and games" content/README.md                                                   # before 0, after 1
```
- [ ] **Step 2: Run them and confirm the "before" values.**
- [ ] **Step 3: Write the amendments.**
  - **Spec, status line (:4).** `**Status:** Approved; Stages 1–2 implemented`.
  - **Spec, §2.4.** After the type-level constraints paragraph (:180-182), add one paragraph:
    - A short-answer `match: "regex"` pattern may be at most 200 characters, may not use backreferences, and may not have nested repetition. A group followed by `*`, `+` or `{n,}` (lazy forms included) may not contain `*`, `+`, `{n,}`, `{n,m}` with m > 1, or an alternation. A group followed by `{n}` with n > 1, or `{n,m}` with m > 1, may not contain `*`, `+` or `{n,}`.
    - Typed answers (short-answer text and fill-blank values) are capped at 200 characters.
    - A matching item's pair texts and distractors are at most 2000 characters each.
    - Lesson frontmatter `activities` may not list the same item twice. Repeated `::activity` directives in a lesson body stay allowed.
  - **Spec, §2.5.**
    - Items run in listed order; `shuffle` defaults to false. When `shuffle` is true, the order is shuffled once per run. An item's own `shuffle` still sets its option order.
    - A quiz may not list the same item twice, and lists at most 200 items.
    - The score is the mean item score over every quiz item. Partial credit counts, and an unanswered item scores 0.
    - A run passes when its score is ≥ `passThreshold`. A quiz with no threshold has no pass or fail.
    - `timeLimitSeconds` counts down from Start. At expiry the answers lock, the quiz is submitted as it stands, and the stored time is capped at the limit.
    - Each run is one `attempts` row of kind `quiz`.
  - **Spec, §2.6.** Add this table:

    | template | `roundSize` counts | default `roundSize` | default `timeLimitSeconds` |
    |---|---|---|---|
    | `matching` | pairs | 6 | none (stopwatch) |
    | `timed-round` | questions | 10 | 60 |
    | `order-it` | ordering items | 3 | none (stopwatch) |

    Then add these rules:
    - A `tags` source takes every item that carries any of the listed tags, in items.json order. An `itemIds` source keeps the listed order. Both then keep only the template's compatible types.
    - A play is one round of `min(roundSize, available units)`. `roundSize` is at most 200.
    - Matching pools the pairs of every resolved matching item. A repeated left keeps its first pair.
    - Up to 2 of the dealt items' distractors join the right column. A distractor equal to a dealt right is never dealt.
    - Matching scores matched ÷ (dealt pairs + misses).
    - Timed-round and order-it score the mean question score. Multi-select partial credit and ordering positions count, and an unanswered question scores 0.
    - Time is recorded and shown, never scored. Expiry ends the round, and the round is still logged.
    - Each play is one `attempts` row of kind `game` (`ref_id` = the game id). Its stored time is capped at the game's limit when it has one.
    - The server checks every move. Duplicate `itemIds` in a source are ignored.
  - **Spec, §5.** The first line below replaces :285. The second goes after :287, the end of the review bullet. The rest replace :288. Keep the other lines.
```
- `GET /lessons/:packageId/:lessonId`, `POST /lessons/:packageId/:lessonId/progress`
- `POST /review/grade` with `direction: "back"` on a card without `reverse: true` returns 404 and writes nothing.
- `GET /quizzes/:packageId/:quizId` (quiz + its items), `GET /games/:packageId/:gameId` (game, effective settings,
  resolved pool), `POST /games/:packageId/:gameId/check` (one move; writes nothing)
- `POST /attempts`: `{packageId, itemId, answer}` (exercise) | `{kind:"quiz", packageId, quizId, answers:[{itemId,
  answer|null}], elapsedSeconds}` | `{kind:"game", packageId, gameId, play, elapsedSeconds}`;
  `GET /attempts?packageId&kind&refId&limit` (refId needs kind quiz|game; limit 1–200, default 50; newest first;
  rows for removed content are hidden)
- `GET /packages` also lists each package's quizzes and games with `runs` and `best`
- Errors: 400 `invalid_request`, 404 `not_found`, 422 `not_checkable` / `invalid_package`; a rejected request writes nothing.
```
  - **Spec, §8 (:320-325).** Append "*(done)*" to stages 1 and 2.
  - **`content/README.md`, the `## Quizzes and games` section.**
    - The §2.5 and §2.6 rules in short form, including the defaults table.
    - The import errors `quiz lists item "<id>" more than once` and `activities lists item "<id>" more than once`. Repeated `::activity` directives in a lesson body are still allowed.
    - The size import errors `quiz lists more than 200 items`, `roundSize may be at most 200` and `matching text may be at most 2000 characters`, which keep every run and play within what the server accepts.
    - The rules for short-answer `match: "regex"`:
      - A pattern may be at most 200 characters.
      - Backreferences are not allowed.
      - A group followed by `*`, `+` or `{n,}` (lazy forms included) may not contain `*`, `+`, `{n,}`, `{n,m}` with m > 1, or an alternation. A group followed by `{n}` with n > 1, or `{n,m}` with m > 1, may not contain `*`, `+` or `{n,}`. So `(a+)+`, `(a|aa)+` and `(a+){2,5}` are refused, while `^colou?r$` and `(\d{1,3}\.){3}` are fine. Write alternatives as separate `accept` entries instead.
    - Typed answers are capped at 200 characters.
  - **`content/README.md`, the math-table row.** ``| quiz `title`/`description`, game `title` | none |``.
  - **`README.md`.**
    - The status says Stages 1–2 are complete and Stage 3 (notes, explain-back, Home) is next.
    - The `## API` section lists the routes that exist after Stage 2, one line per route: packages, lessons, review, quizzes, games (including `/check`) and attempts. It leaves out `/notes` and `/explanations`, which Stage 3 adds. Routes are written as in spec §5, relative to `/api`, under one line saying "All routes are under `/api`", e.g. `POST /games/:packageId/:gameId/check`. The Step 1 grep depends on that form.
    - The Tests line (:40) becomes `npm run e2e     # Playwright smoke + play specs (builds web first)`.
- [ ] **Step 4: Run the checks and confirm the "after" values.**
  - The Step 1 greps print their "after" values.
  - `npm run validate:content -- content/web-app-reference content/matching-and-recommendation` reports no errors, which shows the documented rules hold for both packages.
  - `npm test` passes.
- [ ] **Step 5: Commit**
```bash
git add docs/superpowers/specs/2026-08-03-study-app-design.md content/README.md README.md
git commit -m "docs: record Stage 2 quiz and game rules in the spec and READMEs"
```

---

## Post-plan checklist

- [ ] `npm test` passes every Vitest suite: shared, server and web.
- [ ] `npm run typecheck` exits 0 for shared, server and web. Since Task 1, `web/test` is typechecked too.
- [ ] `npm run e2e`, run twice, passes 14 tests across 2 files: `smoke.spec.ts` (1 test) and `play.spec.ts` (13 tests).
- [ ] Before and after those two runs, count the leftover temp dirs with `node -e "const fs=require('fs'),os=require('os');console.log(fs.readdirSync(os.tmpdir()).filter(n=>n.startsWith('study-e2e-')).length)"`. The count must not change.
- [ ] `npm run validate:content -- content/web-app-reference content/matching-and-recommendation` reports no errors.
- [ ] `grep -rnE "\b(checkAnswer|scoreQuiz|scoreGame|checkGameMove)\b" web/src` prints nothing. `web/test/serverChecking.test.ts` enforces this.
- [ ] `git diff main -- e2e/smoke.spec.ts` is empty.
- [ ] Check by hand at 375 px and at ≥ 60rem, in light and dark mode:
  - Below 40rem the nav shows only icons.
  - Matched tiles show the marker colour, and wrong tiles show the red pen.
  - The quiz bar stays pinned to the bottom.
- [ ] Check by hand under `npm run dev -w web`, where StrictMode is on (port 4321 free, as in Task 24 Step 4): a timed game expires once and logs one History row.
- [ ] Deferred to Stage 3. Do NOT build now: notes, explain-back, Home, the orphan purge, and moving the Library to `/library`.
- [ ] Rejected for Stage 2. Do NOT build: localStorage resume, server game sessions, answer-key redaction, server-side dealing, pausable clocks and run ids.

## Self-review

I ran the writing-plans self-review on the whole plan.

**Spec coverage.** Each spec requirement maps to tasks:

| Spec | Requirement | Tasks |
|---|---|---|
| spec:267-268 | A quiz is scored at the end, shows pass or fail, and keeps a history | 7, 15, 17, 23 |
| spec:269-271 | Three game templates, with scores logged | 4, 8, 9, 14, 16, 24, 25 |
| spec:288 | `POST` and `GET /attempts` | 15–17 |
| spec:292-293 | Answers are checked on the server | 14–16, plus the guard in 21 |
| spec:295-296 | Quiz and Games pages | 22–25 |
| spec:252-253 | Orphaned content stays hidden | 17, 18 |
| — | The spec amendments | 26 |

**Step scan.** No step contains "TBD", "handle edge cases", "add appropriate validation" or "write tests for the above". All 26 tasks have the five steps (130 in all). Every run step names its command and the output that means it passed, and every test step gives exact values. Every commit step has a conventional subject and no attribution line. Every `file:line` cited for existing code was checked against the current tree, and the e2e locators were checked against the sample content and today's DOM. Two "Check" button locators needed `exact: true`, because the sample step "Check and correct" puts "Check" into two Move buttons' names (Tasks 20 and 24).

**Type consistency.** Each name has exactly one producing task, and every task that uses it cites that producer:

| Producer | Names |
|---|---|
| Task 2 | `regexHazard`, `MAX_PATTERN_LENGTH`, `MAX_ANSWER_TEXT` |
| Task 3 | `CheckableItem`, `expectedAnswer` |
| Task 4 | `shuffle`, `scramble` (both `random: () => number = Math.random`), `GAME_COMPAT`, `GAME_DEFAULTS`, `MAX_MATCH_DISTRACTORS`, `GameSettings`, `gameSettings`, `resolveGameItems`, `matchingPairs`, `unitCount`, `roundSizeFor` |
| Task 5 | `lessonExtras` |
| Task 6 | `MAX_ELAPSED_SECONDS`, `MAX_PLAY_ITEMS`, `MAX_MATCH_TEXT`, the request schemas and types, `AttemptRecord` |
| Task 7 | `QuizResult`, `QuizItemResult`, `quizItemIds`, `isPassing`, `scoreQuiz` |
| Task 8 | `GameDeal`, `dealGame`, `GameMoveResult`, `checkGameMove` |
| Task 9 | `GameResult`, `scoreGame` |
| Task 10 | `Parsed<T>`, `apiError`, `parseJsonBody`, `parseQuery` (failure `{ ok: false; response: Response }`) |
| Task 12 | `getItem`, `getPackageItems`, `getQuiz`, `getGame`, `listQuizzes`, `listGames`, `PLAY_FILES` |
| Tasks 15–18 | `QuizRunRecord`, `GameRunRecord`, the three inserts, `AttemptRow`, `toAttemptRecord`, `listAttempts`, `attemptStats`, the server-local `QuizSummary`/`GameSummary` |
| Task 20 | `Task`, `TYPE_LABEL`, `ItemPrompt`, `Verdict` (with `children`), `AnswerForm`, the five draft rules |
| Task 21 | the `api.ts` types (mirroring Tasks 13 and 18), `checkMove`, `isStale`, `formatClock`, `remainingSeconds`, `percent`, `useClock`, `expiryDue`, `Clock` |
| Task 22 | `TEMPLATE_LABEL`, `QuizList`, `GameList`, `History` |
| Task 23 | `quizOrder`, `answeredCount`, `buildQuizSubmission`, `quizSummary`, `QuizQuestion`, `PlaySummary`, the e2e helpers `runs` and `historyRows` |
| Task 24 | `ItemRun`, `GameResultSummary`, and `Game()`'s `check`, `finish`, `over`, `pending`, `stale` and `round`, which `MatchingBoard` (Task 25) uses |

Three names were changed while the drafts were merged:
- The web client is `checkMove`, not the decision set's `checkGameMove`, so the guard (Task 21) can ban that shared name outright.
- The game result component is `GameResultSummary`, so it cannot clash with the `GameSummary` list type in `rendering.test.tsx`.
- Task 20's `shuffle`/`scramble` signatures now match Task 4's.

Two cross-task seams were also fixed. `useClock` reads 0 once its start is null, so the quiz bar (Task 23) and the game bar (Task 24) hide the `Clock` once the run is frozen or over. And `e2e/play.spec.ts` is created in Task 20, not Task 23; the File Structure, Task 1 and Task 19 now say so. The entry-points e2e test now sits in Task 22, which owns the code it pins, so it fails first there. The former test-only Task 26 is gone, its two-run e2e gate moved to Task 25 Step 4 and the Post-plan checklist, and the docs task is now Task 26.

**Review Focus.** Five lines. Each line's pinning test sits in the task that owns the code:

| Review Focus line | Pinning tests |
|---|---|
| Double submits, expiry and late responses | e2e: Task 23 (a failed submit, a double "Submit again", expiry with no prompt, expiry during an in-flight submit, a submit held across expiry, double Submit quiz/Submit anyway), Task 24 (a check held across expiry and a failed save, a check held past Play again that lands while the new board's check is out, a double Check after a failed one), Task 25 (a double tile click); `expiryDue` in Task 21; StrictMode by hand in Task 24 Step 4 |
| Rejected requests write nothing | Server tests in Tasks 10, 11, 14, 15 and 16. Task 15 now also plants a hazardous stored regex and expects 422 with no row, and sends an exercise and a quiz for an unknown item or package and expects 404 with no row. |
| Unanswered and partial answers are sent as null | Tasks 7 and 15 (null scores 0, `expected` returned, `passed`/`correct` null), 20 (`answerRules`), 21 (`percent(0.7467)` is 74) and 23 (`buildQuizSubmission`, and `quizSummary` reading "74% · Not passed") |
| Game pools and deals | Tasks 4, 8 and 9. Task 6 refuses content beyond the request caps at import. Task 19 now checks the sample round sizes (game-speed deals 2, game-match deals 3). Task 25 covers repeated right tiles. |
| Lesson exercises are unchanged | Task 4 (`scramble`); Task 20's rendering tests, including the empty-form enable-rules test, and its e2e tests: the ordering one, which also checks that Try again keeps the order, and the lesson Enter-to-check one; Task 23's `QuizQuestion` test and quiz Enter press; the unchanged smoke spec |

**Proportion.** The plan is about 3,340 lines. Half of that is code blocks, and nearly all of those are test code with the decision set's exact values. The rest of the code blocks are the regex scanner, the `VISIBLE_ATTEMPT` SQL, the `PLAY_FILES` and sample fixtures, and the exact UI copy. No component or route body is transcribed. The plan is shorter than the code and tests it describes.
