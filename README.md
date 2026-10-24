# Study App

Local-first study platform, driven by a portable package format.

Stages 1–3 are complete: lessons with inline exercises, spaced-repetition
flashcards, quizzes and games, notes and explain-back, and a Home dashboard at `/`
(the Library is at `/library`).

## Run

    npm install
    npm run build -w web
    npm start -w server        # http://localhost:4321

Dev mode: `npm start -w server` + `npm run dev -w web` (Vite on :5173, proxies /api).

## Data

Everything lives in `data/study.db` (override dir: `STUDY_DATA_DIR`). Because the
database uses SQLite WAL mode, do not copy that file while the app is running.
Create a consistent live backup instead:

    npm run backup -w server -- ./backups/study.db

Existing installs that created `server/data/study.db` are detected and continue to
use that database until moved deliberately.

Deleting a package keeps its progress, notes and explanations, hidden until you
re-import it. Library → Leftover progress permanently deletes orphaned progress;
notes and explanations are deleted only when you opt in. Re-importing a package
updates content in place. Notes and explanations are never part of a package
export; `npm run backup -w server -- <dest>` includes them.

## Packages

A package is a zip: `manifest.json` + `lessons/*.md` (+ optional `items.json`,
`quizzes.json`, `games.json`, `assets/`). See `server/sample/` for a working
example and `docs/superpowers/specs/2026-08-03-study-app-design.md` for the full format.

## API

All routes are under `/api`:

- `GET /packages` — package, lesson, quiz and game summaries, including runs, best scores and started lessons' last-opened times.
- `POST /packages/import` — import a validated package zip.
- `GET /packages/:id/export` — export package content.
- `DELETE /packages/:id` — delete content while keeping progress, notes and explanations.
- `GET /packages/:id/assets/…` — serve a package asset.
- `GET /lessons/:packageId/:lessonId` — lesson, items and progress.
- `POST /lessons/:packageId/:lessonId/progress` — update lesson progress.
- `GET /review/due` — due flashcards.
- `POST /review/grade` — grade a flashcard direction; a back grade needs a reverse card.
- `GET /review/free-study?packageId=…` — flashcards without schedule writes.
- `GET /quizzes/:packageId/:quizId` — quiz and whole items.
- `GET /games/:packageId/:gameId` — game, effective settings and resolved items.
- `POST /games/:packageId/:gameId/check` — check one move without writing.
- `POST /attempts` — check and log an exercise, quiz run or game play.
- `GET /attempts?packageId&kind&refId&limit` — newest summaries, with removed content hidden.
- `GET /notes` — all notes, including removed-content notes flagged as orphaned.
- `POST /notes` — create a standalone, package or lesson note.
- `GET/PATCH/DELETE /notes/:id` — read, edit or delete a note.
- `GET /explanations` — all explanations; `?revisit=1` returns revisit prompts only.
- `POST /explanations` — explain a lesson with a 1–5 confidence rating.
- `GET/PATCH /explanations/:id` — read or edit an explanation; no individual delete route.
- `GET /maintenance/orphans` — per-package counts of retained state on removed content.
- `POST /maintenance/orphans/purge` — purge confirmed orphan counts; writing requires opt-in and changed counts return 409 with no deletion.

## Tests

    npm test        # unit + integration
    npm run e2e     # Playwright smoke + play + notes specs (builds web first)
