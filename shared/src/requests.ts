import { z } from "zod";
import { answerSchema, attemptRequestSchema } from "./checking.js";
import { idSchema } from "./ids.js";
import type { Game } from "./packageSchema.js";

/** The longest elapsed time carried by a run, in seconds. */
export const MAX_ELAPSED_SECONDS = 86400;
/** The most items or matching lefts carried by one run. */
export const MAX_PLAY_ITEMS = 200;
/** The longest matching left or right carried by one pick. */
export const MAX_MATCH_TEXT = 2000;

/** A flashcard's self-assessed recall rating. */
export const ratingSchema = z.enum(["again", "hard", "good", "easy"]);
/** A lesson's requested progress state. */
export const progressRequestSchema = z.object({ status: z.enum(["in-progress", "completed"]) }).strict();
/** A grade for one flashcard direction. */
export const gradeRequestSchema = z.object({
  packageId: idSchema,
  itemId: idSchema,
  direction: z.enum(["front", "back"]),
  rating: ratingSchema,
}).strict();
/** One quiz answer, with null for an unanswered item. */
export const quizAnswerSchema = z.object({ itemId: idSchema, answer: answerSchema.nullable() }).strict();
/** A complete quiz submission for server-side scoring. */
export const quizSubmissionSchema = z.object({
  kind: z.literal("quiz"),
  packageId: idSchema,
  quizId: idSchema,
  answers: z.array(quizAnswerSchema).max(MAX_PLAY_ITEMS),
  elapsedSeconds: z.number().int().min(0).max(MAX_ELAPSED_SECONDS),
}).strict();
/** A chosen pair in a matching game. */
export const matchPickSchema = z.object({
  left: z.string().max(MAX_MATCH_TEXT),
  right: z.string().max(MAX_MATCH_TEXT),
}).strict();
/** An answer to a timed-round or order-it game item. */
export const gameItemAnswerSchema = z.object({ itemId: idSchema, answer: answerSchema }).strict();
/** Either kind of game move, without mixing their fields. */
export const gameMoveSchema = z.union([gameItemAnswerSchema, matchPickSchema]);
/** A dealt game round and the moves made during it. */
export const gamePlaySchema = z.discriminatedUnion("template", [
  z.object({
    template: z.literal("matching"),
    lefts: z.array(z.string().max(MAX_MATCH_TEXT)).min(1).max(MAX_PLAY_ITEMS),
    picks: z.array(matchPickSchema).max(2000),
  }).strict(),
  z.object({
    template: z.literal("timed-round"),
    itemIds: z.array(idSchema).min(1).max(MAX_PLAY_ITEMS),
    answers: z.array(gameItemAnswerSchema).max(MAX_PLAY_ITEMS),
  }).strict(),
  z.object({
    template: z.literal("order-it"),
    itemIds: z.array(idSchema).min(1).max(MAX_PLAY_ITEMS),
    answers: z.array(gameItemAnswerSchema).max(MAX_PLAY_ITEMS),
  }).strict(),
]);
/** A game submission for server-side replay and scoring. */
export const gameSubmissionSchema = z.object({
  kind: z.literal("game"),
  packageId: idSchema,
  gameId: idSchema,
  play: gamePlaySchema,
  elapsedSeconds: z.number().int().min(0).max(MAX_ELAPSED_SECONDS),
}).strict();
/** The legacy exercise body or a quiz or game submission. */
export const attemptBodySchema = z.union([attemptRequestSchema, quizSubmissionSchema, gameSubmissionSchema]);
/** Filters for attempt history, with a bounded default page size. */
export const attemptsQuerySchema = z.object({
  packageId: idSchema.optional(),
  kind: z.enum(["exercise", "quiz", "game"]).optional(),
  refId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict().refine((q) => q.refId === undefined || q.kind === "quiz" || q.kind === "game", {
  message: "refId needs kind quiz or game", path: ["refId"],
});

export type QuizAnswer = z.infer<typeof quizAnswerSchema>;
export type QuizSubmission = z.infer<typeof quizSubmissionSchema>;
export type GameMove = z.infer<typeof gameMoveSchema>;
export type GamePlay = z.infer<typeof gamePlaySchema>;
export type GameSubmission = z.infer<typeof gameSubmissionSchema>;
export type AttemptsQuery = z.infer<typeof attemptsQuerySchema>;

/** A persisted exercise, quiz or game result without its raw answer payload. */
export type AttemptRecord =
  | { id: number; kind: "exercise"; packageId: string; itemId: string; correct: boolean; score: number; at: string }
  | { id: number; kind: "quiz"; packageId: string; quizId: string; score: number; passed: boolean | null;
      correctCount: number; total: number; timedOut: boolean; elapsedSeconds: number; at: string }
  | { id: number; kind: "game"; packageId: string; gameId: string; template: Game["template"]; score: number;
      correctCount: number; total: number; mistakes: number; completed: boolean; timedOut: boolean; elapsedSeconds: number; at: string };
