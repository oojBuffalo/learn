import { checkAnswer, expectedAnswer } from "./checking.js";
import type { CheckResult } from "./checking.js";
import type { Item } from "./items.js";
import type { Quiz } from "./packageSchema.js";
import type { QuizAnswer } from "./requests.js";

/**
 * Returns a quiz's distinct ids in first-occurrence order.
 *
 * Args:
 *   quiz: The quiz listing the items.
 * Returns:
 *   Each listed id once.
 * Raises:
 *   None.
 */
export function quizItemIds(quiz: Quiz): string[] {
  return [...new Set(quiz.items)];
}

/**
 * Compares a score with a threshold, tolerating floating-point rounding.
 *
 * Args:
 *   score: The mean score.
 *   threshold: The optional passing score.
 * Returns:
 *   Whether the score passes, or null without a threshold.
 * Raises:
 *   None.
 */
export function isPassing(score: number, threshold: number | undefined): boolean | null {
  return threshold === undefined ? null : score >= threshold - 1e-9;
}

/** A checked quiz item, including whether the learner submitted an answer. */
export interface QuizItemResult extends CheckResult {
  itemId: string;
  answered: boolean;
}

/** The server-computed aggregate and per-item results for one quiz run. */
export interface QuizResult {
  score: number;
  correctCount: number;
  answeredCount: number;
  total: number;
  passThreshold: number | null;
  passed: boolean | null;
  timedOut: boolean;
  elapsedSeconds: number;
  results: QuizItemResult[];
}

/**
 * Checks a complete quiz submission, counting unanswered items as zero.
 *
 * Args:
 *   quiz: The validated quiz whose order and settings apply.
 *   items: Package items keyed by id.
 *   answers: Exactly one answer or null for each distinct quiz item.
 *   elapsedSeconds: The request-validated elapsed time.
 * Returns:
 *   The mean item score, verdicts in quiz order and clamped elapsed time.
 * Raises:
 *   Error: Answers do not exactly cover the quiz, an item is missing or not
 *     checkable, or checkAnswer rejects an answer or unsafe stored regex.
 */
export function scoreQuiz(quiz: Quiz, items: ReadonlyMap<string, Item>, answers: readonly QuizAnswer[], elapsedSeconds: number): QuizResult {
  const ids = quizItemIds(quiz);
  const byId = new Map(answers.map((a) => [a.itemId, a.answer]));
  if (answers.length !== ids.length || byId.size !== ids.length || ids.some((id) => !byId.has(id))) {
    throw new Error("quiz answers must list every quiz item exactly once");
  }
  const results: QuizItemResult[] = ids.map((itemId) => {
    const item = items.get(itemId);
    if (!item) throw new Error(`quiz item "${itemId}" is missing`);
    if (item.type === "flashcard") throw new Error(`quiz item "${itemId}" is not checkable`);
    const answer = byId.get(itemId)!;
    return answer === null
      ? { itemId, answered: false, correct: false, score: 0, expected: expectedAnswer(item) }
      : { ...checkAnswer(item, answer), itemId, answered: true };
  });
  const score = results.reduce((sum, r) => sum + r.score, 0) / ids.length;
  const limit = quiz.timeLimitSeconds;
  return {
    score,
    correctCount: results.filter((r) => r.correct).length,
    answeredCount: results.filter((r) => r.answered).length,
    total: ids.length,
    passThreshold: quiz.passThreshold ?? null,
    passed: isPassing(score, quiz.passThreshold),
    timedOut: limit !== undefined && elapsedSeconds >= limit,
    elapsedSeconds: limit === undefined ? elapsedSeconds : Math.min(elapsedSeconds, limit),
    results,
  };
}
