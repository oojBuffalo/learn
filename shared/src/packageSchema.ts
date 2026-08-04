import { z } from "zod";
import { idSchema } from "./ids.js";
import { difficultySchema } from "./items.js";

export const KNOWN_FORMAT_VERSIONS = ["1.0.0"];
const metaSchema = z.record(z.unknown());

export const manifestSchema = z
  .object({
    formatVersion: z
      .string()
      .refine((v) => KNOWN_FORMAT_VERSIONS.includes(v), {
        message: `unsupported formatVersion (known: ${KNOWN_FORMAT_VERSIONS.join(", ")})`,
      }),
    id: idSchema,
    title: z.string().min(1),
    version: z.string().min(1),
    description: z.string().optional(),
    language: z.string().optional(),
    tags: z.array(z.string()).optional(),
    authors: z.array(z.string()).optional(),
    license: z.string().optional(),
    objectives: z.array(z.string()).optional(),
    prerequisites: z.array(z.string()).optional(),
    units: z
      .array(z.object({ id: idSchema, title: z.string(), lessonIds: z.array(idSchema) }).strict())
      .optional(),
    meta: metaSchema.optional(),
  })
  .strict();

export const lessonFrontmatterSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    summary: z.string().optional(),
    objectives: z.array(z.string()).optional(),
    estimatedMinutes: z.number().positive().optional(),
    difficulty: difficultySchema.optional(),
    prerequisites: z.array(idSchema).optional(),
    tags: z.array(z.string()).optional(),
    activities: z.array(idSchema).optional(),
  })
  .strict();

export const quizSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    items: z.array(idSchema).min(1),
    shuffle: z.boolean().optional(),
    timeLimitSeconds: z.number().int().positive().optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    meta: metaSchema.optional(),
  })
  .strict();

export const gameSchema = z
  .object({
    id: idSchema,
    template: z.enum(["matching", "timed-round", "order-it"]),
    title: z.string().min(1),
    source: z.union([
      z.object({ itemIds: z.array(idSchema).min(1) }).strict(),
      z.object({ tags: z.array(z.string()).min(1) }).strict(),
    ]),
    settings: z
      .object({
        timeLimitSeconds: z.number().int().positive().optional(),
        roundSize: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    meta: metaSchema.optional(),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
export type LessonFrontmatter = z.infer<typeof lessonFrontmatterSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type Game = z.infer<typeof gameSchema>;
