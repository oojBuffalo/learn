# Study App

Local-first study platform: lessons with inline exercises, spaced-repetition
flashcards, quizzes and games (Stage 2), all driven by a portable package format.

Stage 1 (foundation) is complete. The next planned objective is Stage 2: the quiz
runner and the three game-template players described in the design document.

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

## Tests

    npm test        # unit + integration
    npm run e2e     # Playwright smoke (builds web first)
