import type { Answer, AttemptRecord, AttemptsQuery, CheckResult, Game, GamePlay, GameResult, GameSubmission, QuizAnswer, QuizResult, QuizSubmission } from "@study/shared";
import type { Db } from "./db.js";

/** The versioned payload retained for one quiz attempt. */
export interface QuizRunRecord {
  v: 1;
  answers: QuizAnswer[];
  results: { itemId: string; answered: boolean; correct: boolean; score: number }[];
  correctCount: number;
  answeredCount: number;
  total: number;
  passThreshold: number | null;
  timedOut: boolean;
  elapsedSeconds: number;
}

/** The versioned payload retained for one game attempt. */
export interface GameRunRecord {
  v: 1;
  template: Game["template"];
  play: GamePlay;
  correctCount: number;
  total: number;
  mistakes: number;
  completed: boolean;
  timedOut: boolean;
  elapsedSeconds: number;
}

/** A persisted attempt row before its raw payload is removed from the response. */
export interface AttemptRow {
  id: number;
  package_id: string;
  kind: "exercise" | "quiz" | "game";
  ref_id: string | null;
  item_id: string | null;
  answer: string | null;
  correct: 0 | 1 | null;
  score: number | null;
  at: string;
}

const VISIBLE_ATTEMPT = `((a.kind = 'exercise' AND EXISTS (SELECT 1 FROM items i WHERE i.package_id = a.package_id AND i.id = a.item_id))
  OR (a.kind = 'quiz' AND EXISTS (SELECT 1 FROM quizzes q WHERE q.package_id = a.package_id AND q.id = a.ref_id))
  OR (a.kind = 'game' AND EXISTS (SELECT 1 FROM games g WHERE g.package_id = a.package_id AND g.id = a.ref_id)))`;

/**
 * Maps a stored result to a summary, excluding submitted answers and answer keys.
 * Args:
 *   row: An attempt whose referenced content still exists.
 * Returns:
 *   The public summary for the stored kind.
 * Raises:
 *   SyntaxError: A quiz or game record contains malformed JSON.
 */
export function toAttemptRecord(row: AttemptRow): AttemptRecord {
  const common = { id: row.id, packageId: row.package_id, score: row.score ?? 0, at: row.at };
  if (row.kind === "exercise") {
    return { ...common, kind: "exercise", itemId: row.item_id!, correct: row.correct === 1 };
  }
  if (row.kind === "quiz") {
    const record = JSON.parse(row.answer!) as QuizRunRecord;
    return {
      ...common, kind: "quiz", quizId: row.ref_id!, passed: row.correct === null ? null : row.correct === 1,
      correctCount: record.correctCount, total: record.total, timedOut: record.timedOut, elapsedSeconds: record.elapsedSeconds,
    };
  }
  const record = JSON.parse(row.answer!) as GameRunRecord;
  return {
    ...common, kind: "game", gameId: row.ref_id!, template: record.template,
    correctCount: record.correctCount, total: record.total, mistakes: record.mistakes,
    completed: record.completed, timedOut: record.timedOut, elapsedSeconds: record.elapsedSeconds,
  };
}

/**
 * Lists recent attempts while retaining, but hiding, orphaned history.
 * Args:
 *   db: The database. query: Validated optional filters and a bounded limit.
 * Returns:
 *   Summaries in descending attempt-id order.
 * Raises:
 *   Error: The database read or stored-record decoding fails.
 */
export function listAttempts(db: Db, query: AttemptsQuery): AttemptRecord[] {
  const conditions = [VISIBLE_ATTEMPT];
  const params: (string | number)[] = [];
  if (query.packageId !== undefined) { conditions.push("a.package_id = ?"); params.push(query.packageId); }
  if (query.kind !== undefined) { conditions.push("a.kind = ?"); params.push(query.kind); }
  if (query.refId !== undefined) { conditions.push("a.ref_id = ?"); params.push(query.refId); }
  const rows = db.prepare(
    `SELECT a.id, a.package_id, a.kind, a.ref_id, a.item_id, a.answer, a.correct, a.score, a.at
     FROM attempts a WHERE ${conditions.join(" AND ")} ORDER BY a.id DESC LIMIT ?`,
  ).all(...params, query.limit) as AttemptRow[];
  return rows.map(toAttemptRecord);
}

/**
 * Aggregates quiz and game history for the package's content summaries.
 * Args:
 *   db: The database. packageId: The package whose run statistics are needed.
 * Returns:
 *   Counts and best scores keyed by kind and referenced content id.
 * Raises:
 *   Error: The database read fails.
 */
export function attemptStats(db: Db, packageId: string): Map<`quiz:${string}` | `game:${string}`, { runs: number; best: number | null }> {
  const rows = db.prepare(
    "SELECT kind, ref_id, COUNT(*) AS runs, MAX(score) AS best FROM attempts WHERE package_id = ? AND kind IN ('quiz','game') GROUP BY kind, ref_id",
  ).all(packageId) as { kind: "quiz" | "game"; ref_id: string; runs: number; best: number | null }[];
  return new Map(rows.map((row) => [`${row.kind}:${row.ref_id}`, { runs: row.runs, best: row.best }]));
}

/**
 * Logs one checked exercise without changing its existing storage contract.
 * Args:
 *   db: The database. packageId: Package id. itemId: Item id.
 *   answer: The submitted answer. result: The server-computed verdict.
 * Returns:
 *   Nothing.
 * Raises:
 *   Error: The database insert fails.
 */
export function insertExerciseAttempt(db: Db, packageId: string, itemId: string, answer: Answer, result: CheckResult): void {
  db.prepare(
    "INSERT INTO attempts (package_id, kind, item_id, answer, correct, score, at) VALUES (?, 'exercise', ?, ?, ?, ?, ?)",
  ).run(packageId, itemId, JSON.stringify(answer), result.correct ? 1 : 0, result.score, new Date().toISOString());
}

/**
 * Logs a quiz only after every answer has been checked.
 * Args:
 *   db: The database. submission: The validated submitted run.
 *   result: The server-computed quiz result.
 * Returns:
 *   Nothing.
 * Raises:
 *   Error: Serialization or the database insert fails.
 */
export function insertQuizAttempt(db: Db, submission: QuizSubmission, result: QuizResult): void {
  const record: QuizRunRecord = {
    v: 1,
    answers: submission.answers,
    results: result.results.map(({ itemId, answered, correct, score }) => ({ itemId, answered, correct, score })),
    correctCount: result.correctCount,
    answeredCount: result.answeredCount,
    total: result.total,
    passThreshold: result.passThreshold,
    timedOut: result.timedOut,
    elapsedSeconds: result.elapsedSeconds,
  };
  db.prepare(
    "INSERT INTO attempts (package_id, kind, ref_id, item_id, answer, correct, score, at) VALUES (?, 'quiz', ?, NULL, ?, ?, ?, ?)",
  ).run(submission.packageId, submission.quizId, JSON.stringify(record),
    result.passed === null ? null : result.passed ? 1 : 0, result.score, new Date().toISOString());
}

/**
 * Logs a game only after replay has validated and scored its play.
 * Args:
 *   db: The database. submission: The validated submitted play.
 *   result: The server-computed game result.
 * Returns:
 *   Nothing.
 * Raises:
 *   Error: Serialization or the database insert fails.
 */
export function insertGameAttempt(db: Db, submission: GameSubmission, result: GameResult): void {
  const record: GameRunRecord = {
    v: 1,
    template: result.template,
    play: submission.play,
    correctCount: result.correctCount,
    total: result.total,
    mistakes: result.mistakes,
    completed: result.completed,
    timedOut: result.timedOut,
    elapsedSeconds: result.elapsedSeconds,
  };
  db.prepare(
    "INSERT INTO attempts (package_id, kind, ref_id, item_id, answer, correct, score, at) VALUES (?, 'game', ?, NULL, ?, NULL, ?, ?)",
  ).run(submission.packageId, submission.gameId, JSON.stringify(record), result.score, new Date().toISOString());
}
