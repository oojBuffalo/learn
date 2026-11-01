import { z } from "zod";
import { idSchema } from "./ids.js";

/** Maximum length of a note or explanation without discarding entered text. */
export const BODY_MAX = 100_000;
/** The five self-assessed confidence levels. */
export const CONFIDENCE_LEVELS = [1, 2, 3, 4, 5] as const;
/** A confidence rating from lost to able to teach the topic. */
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
/** The highest confidence that prompts a lesson revisit. */
export const LOW_CONFIDENCE_MAX = 2;

const bodySchema = z.string().max(BODY_MAX, "body must be at most 100000 characters")
  .refine((body) => body.trim().length > 0, { message: "body must not be blank" });
/** A package target, with a null lesson for a whole-package note. */
export const noteTargetSchema = z.object({ packageId: idSchema, lessonId: idSchema.nullable() }).strict();
/** A new note explicitly attached to content or made standalone. */
export const noteCreateSchema = z.object({ body: bodySchema, target: noteTargetSchema.nullable() }).strict();
/** A nonempty note change; an omitted target keeps the existing attachment. */
export const notePatchSchema = z.object({ body: bodySchema.optional(), target: noteTargetSchema.nullable().optional() }).strict()
  .refine((patch) => patch.body !== undefined || patch.target !== undefined, { message: "patch must change body or target" });
/** A whole-number confidence rating with one stable validation message. */
export const confidenceSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)], {
  errorMap: () => ({ message: "confidence must be a whole number from 1 to 5" }),
});
/** An explanation of a specific lesson and its self-rated confidence. */
export const explanationCreateSchema = z.object({ packageId: idSchema, lessonId: idSchema, body: bodySchema, confidence: confidenceSchema }).strict();
/** An explanation change; its original lesson attachment never changes. */
export const explanationPatchSchema = z.object({ body: bodySchema.optional(), confidence: confidenceSchema.optional() }).strict()
  .refine((patch) => patch.body !== undefined || patch.confidence !== undefined, { message: "patch must change body or confidence" });

export type NoteTarget = z.infer<typeof noteTargetSchema>;
export type NoteCreate = z.infer<typeof noteCreateSchema>;
export type NotePatch = z.infer<typeof notePatchSchema>;
export type ExplanationCreate = z.infer<typeof explanationCreateSchema>;
export type ExplanationPatch = z.infer<typeof explanationPatchSchema>;

/** A note attachment with currently available content titles. */
export interface NoteTargetView extends NoteTarget { packageTitle: string | null; lessonTitle: string | null }
/** A saved note, including retained writing on removed content. */
export interface Note { id: number; body: string; target: NoteTargetView | null; orphaned: boolean; createdAt: string; updatedAt: string }
/** A saved explanation with server-computed visibility and revisit flags. */
export interface Explanation {
  id: number; packageId: string; lessonId: string; packageTitle: string | null; lessonTitle: string | null;
  body: string; confidence: Confidence; revisit: boolean; orphaned: boolean; createdAt: string; updatedAt: string;
}

/**
 * Tests whether a confidence rating calls for revisiting a lesson.
 * Args:
 *   confidence: A validated self-rating.
 * Returns:
 *   True for ratings 1 and 2.
 * Raises:
 *   None.
 */
export function isLowConfidence(confidence: number): boolean { return confidence <= LOW_CONFIDENCE_MAX; }
