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
  ord INTEGER NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,               -- full Item JSON
  PRIMARY KEY (package_id, id)
);
CREATE TABLE IF NOT EXISTS quizzes (
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (package_id, id)
);
CREATE TABLE IF NOT EXISTS games (
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (package_id, id)
);
CREATE TABLE IF NOT EXISTS assets (
  package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  ord INTEGER NOT NULL,
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
