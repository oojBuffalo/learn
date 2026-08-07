export const FORMAT_VERSION = "1.0.0";
export { idSchema, ID_RE } from "./ids.js";
export { itemSchema, difficultySchema } from "./items.js";
export type {
  Item, ItemType, McItem, MsItem, FillBlankItem, ShortAnswerItem,
  OrderingItem, MatchingItem, FlashcardItem,
} from "./items.js";
export {
  manifestSchema,
  lessonFrontmatterSchema,
  quizSchema,
  gameSchema,
  KNOWN_FORMAT_VERSIONS,
} from "./packageSchema.js";
export type { Manifest, LessonFrontmatter, Quiz, Game } from "./packageSchema.js";
export { splitLessonBody, activityIdsInBody } from "./lessonBody.js";
export type { BodySegment } from "./lessonBody.js";
export { validatePackage } from "./validatePackage.js";
export type { LoadedPackage, LoadedLesson, PackageError } from "./validatePackage.js";
export { answerSchema, attemptRequestSchema, checkAnswer, fold } from "./checking.js";
export type { Answer, CheckResult } from "./checking.js";
export { schedule } from "./scheduler.js";
export type { Rating, CardState } from "./scheduler.js";
