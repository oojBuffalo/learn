export const FORMAT_VERSION = "1.0.0";
export { idSchema, ID_RE } from "./ids.js";
export { itemSchema, difficultySchema } from "./items.js";
export type {
  Item, ItemType, McItem, MsItem, FillBlankItem, ShortAnswerItem,
  OrderingItem, MatchingItem, FlashcardItem, CheckableItem,
} from "./items.js";
export {
  manifestSchema,
  lessonFrontmatterSchema,
  quizSchema,
  gameSchema,
  KNOWN_FORMAT_VERSIONS,
} from "./packageSchema.js";
export type { Manifest, LessonFrontmatter, Quiz, Game } from "./packageSchema.js";
export { activityIdsInBody, directiveId } from "./lessonBody.js";
export { validatePackage } from "./validatePackage.js";
export type { LoadedPackage, LoadedLesson, PackageError } from "./validatePackage.js";
export { shuffle, scramble } from "./random.js";
export {
  GAME_COMPAT,
  GAME_DEFAULTS,
  MAX_MATCH_DISTRACTORS,
  gameSettings,
  resolveGameItems,
  matchingPairs,
  unitCount,
  roundSizeFor,
} from "./games.js";
export type { GameSettings, MatchPair } from "./games.js";
export { dealGame, checkGameMove, scoreGame } from "./games.js";
export type { GameDeal, GameMoveResult, GameResult } from "./games.js";
export { quizItemIds, isPassing, scoreQuiz } from "./quiz.js";
export type { QuizItemResult, QuizResult } from "./quiz.js";
export {
  MAX_ELAPSED_SECONDS, MAX_PLAY_ITEMS, MAX_MATCH_TEXT, MAX_MATCH_PICKS, ratingSchema,
  progressRequestSchema, gradeRequestSchema, quizAnswerSchema, quizSubmissionSchema,
  matchPickSchema, gameItemAnswerSchema, gameMoveSchema, gamePlaySchema,
  gameSubmissionSchema, attemptBodySchema, attemptsQuerySchema,
} from "./requests.js";
export type {
  QuizAnswer, QuizSubmission, GameMove, GamePlay, GameSubmission, AttemptsQuery, AttemptRecord,
} from "./requests.js";
export {
  MATH_OPTIONS,
  KATEX_OPTIONS,
  prosePassages,
  fillBlankParts,
  fillBlankSegments,
  stripMath,
} from "./mathSource.js";
export type { FillBlankPart, ProseMode, Passage } from "./mathSource.js";
export { MAX_ANSWER_TEXT, answerSchema, attemptRequestSchema, checkAnswer, expectedAnswer, fold } from "./checking.js";
export type { Answer, CheckResult } from "./checking.js";
export { MAX_PATTERN_LENGTH, regexHazard } from "./regexSafety.js";
export { schedule } from "./scheduler.js";
export type { Rating, CardState } from "./scheduler.js";
export {
  BODY_MAX, CONFIDENCE_LEVELS, LOW_CONFIDENCE_MAX, noteTargetSchema,
  noteCreateSchema, notePatchSchema, confidenceSchema, explanationCreateSchema,
  explanationPatchSchema, isLowConfidence,
} from "./notes.js";
export type {
  Confidence, NoteTarget, NoteCreate, NotePatch, ExplanationCreate,
  ExplanationPatch, NoteTargetView, Note, Explanation,
} from "./notes.js";
export { ORPHAN_KINDS, WRITING_KINDS, purgedKinds, orphanCountsSchema, purgeOrphansRequestSchema } from "./maintenance.js";
export type { OrphanKind, OrphanCounts, PurgeOrphansRequest, OrphanGroup } from "./maintenance.js";
