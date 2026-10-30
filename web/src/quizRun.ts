import { MAX_ELAPSED_SECONDS, quizItemIds, shuffle } from "@study/shared";
import type { Answer, Quiz, QuizResult, QuizSubmission } from "@study/shared";
import { formatClock, percent } from "./format.js";

export function quizOrder(quiz: Quiz, random: () => number = Math.random): string[] {
  const ids = quizItemIds(quiz);
  return quiz.shuffle === true ? shuffle(ids, random) : ids;
}

export function answeredCount(ids: readonly string[], drafts: Readonly<Record<string, Answer | null>>): number {
  return ids.filter((id) => Object.hasOwn(drafts, id) && drafts[id] != null).length;
}

export function buildQuizSubmission(packageId: string, quiz: Quiz, drafts: Readonly<Record<string, Answer | null>>, elapsedMs: number): QuizSubmission {
  return {
    kind: "quiz", packageId, quizId: quiz.id,
    answers: quizItemIds(quiz).map((itemId) => ({ itemId, answer: Object.hasOwn(drafts, itemId) ? drafts[itemId] ?? null : null })),
    elapsedSeconds: Math.min(Math.max(0, Math.floor(elapsedMs / 1000)), MAX_ELAPSED_SECONDS, quiz.timeLimitSeconds ?? Infinity),
  };
}

export function quizSummary(result: QuizResult): string {
  return [
    `${percent(result.score)}%`,
    ...(result.passed === null ? [] : [result.passed ? "Passed" : `Not passed (needs ${percent(result.passThreshold!)}%)`]),
    `${result.correctCount} of ${result.total} correct`, formatClock(result.elapsedSeconds),
    ...(result.timedOut ? ["Time’s up"] : []),
  ].join(" · ");
}
