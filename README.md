# Study App

Local-first study platform: lessons with inline exercises, spaced-repetition
flashcards, quizzes and games (Stage 2), all driven by a portable package format.

Stages 1–2 are complete: foundation, the quiz runner and the three game-template
players. Stage 3 (notes, explain-back and Home) is next.

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

Deleting a package keeps your progress; re-importing a package updates content
in place.

## Packages

A package is a zip: `manifest.json` + `lessons/*.md` (+ optional `items.json`,
`quizzes.json`, `games.json`, `assets/`). See `server/sample/` for a working
example and `docs/superpowers/specs/2026-08-03-study-app-design.md` for the full format.

## API

All routes are under `/api`:

- `GET /packages` — package, lesson, quiz and game summaries, including runs and best scores.
- `POST /packages/import` — import a validated package zip.
- `GET /packages/:id/export` — export package content.
- `DELETE /packages/:id` — delete content while keeping progress.
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

## Tests

    npm test        # unit + integration
    npm run e2e     # Playwright smoke + play specs (builds web first)
