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
export {
  MATH_OPTIONS,
  KATEX_OPTIONS,
  prosePassages,
  fillBlankParts,
  fillBlankSegments,
  stripMath,
} from "./mathSource.js";
export type { FillBlankPart, ProseMode, Passage } from "./mathSource.js";
export { answerSchema, attemptRequestSchema, checkAnswer, expectedAnswer, fold } from "./checking.js";
export type { Answer, CheckResult } from "./checking.js";
export { schedule } from "./scheduler.js";
export type { Rating, CardState } from "./scheduler.js";
