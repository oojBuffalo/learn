import { z } from "zod";
import { idSchema } from "./ids.js";

export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
const mediaSchema = z.object({ src: z.string(), alt: z.string().optional() }).strict();
const metaSchema = z.record(z.unknown());

const itemBase = {
  id: idSchema,
  hints: z.array(z.string()).optional(),
  explanation: z.string().optional(),
  difficulty: difficultySchema.optional(),
  tags: z.array(z.string()).optional(),
  media: z.array(mediaSchema).optional(),
  meta: metaSchema.optional(),
};
const prompted = { ...itemBase, prompt: z.string() };

const optionSchema = z
  .object({
    id: idSchema,
    text: z.string(),
    correct: z.boolean().optional(),
    feedback: z.string().optional(),
  })
  .strict();

const mcSchema = z
  .object({
    ...prompted,
    type: z.literal("multiple-choice"),
    options: z.array(optionSchema).min(2),
    shuffle: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.options.filter((o) => o.correct).length === 1, {
    message: "multiple-choice requires exactly one correct option",
    path: ["options"],
  });

const msSchema = z
  .object({
    ...prompted,
    type: z.literal("multi-select"),
    options: z.array(optionSchema).min(2),
    shuffle: z.boolean().optional(),
    partialCredit: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.options.some((o) => o.correct), {
    message: "multi-select requires at least one correct option",
    path: ["options"],
  });

const blankSchema = z
  .object({
    slot: z.number().int().positive(),
    accept: z.array(z.string()).min(1),
    caseSensitive: z.boolean().optional(),
  })
  .strict();

const fillBlankSchema = z
  .object({
    ...prompted,
    type: z.literal("fill-blank"),
    template: z.string(),
    blanks: z.array(blankSchema).min(1),
  })
  .strict()
  .refine(
    (v) => {
      const slots = [...v.template.matchAll(/\{\{(\d+)\}\}/g)]
        .map((m) => Number(m[1]))
        .sort((a, b) => a - b);
      const declared = v.blanks.map((b) => b.slot).sort((a, b) => a - b);
      return (
        slots.length === declared.length &&
        slots.every((s, i) => s === declared[i])
      );
    },
    { message: "blanks must match the {{n}} placeholders in template", path: ["blanks"] },
  );

const shortAnswerSchema = z
  .object({
    ...prompted,
    type: z.literal("short-answer"),
    accept: z.array(z.string()).min(1),
    match: z.enum(["exact", "fold", "regex"]).optional(),
  })
  .strict();

const orderingSchema = z
  .object({
    ...prompted,
    type: z.literal("ordering"),
    steps: z.array(z.object({ id: idSchema, text: z.string() }).strict()).min(2),
  })
  .strict();

const matchingSchema = z
  .object({
    ...prompted,
    type: z.literal("matching"),
    pairs: z.array(z.object({ left: z.string(), right: z.string() }).strict()).min(2),
    distractors: z.array(z.string()).optional(),
  })
  .strict();

const flashcardSchema = z
  .object({
    ...itemBase,
    type: z.literal("flashcard"),
    front: z.string(),
    back: z.string(),
    reverse: z.boolean().optional(),
    examples: z.array(z.string()).optional(),
  })
  .strict();

export const itemSchema = z.union([
  mcSchema,
  msSchema,
  fillBlankSchema,
  shortAnswerSchema,
  orderingSchema,
  matchingSchema,
  flashcardSchema,
]);

export type Item = z.infer<typeof itemSchema>;
export type ItemType = Item["type"];
export type McItem = Extract<Item, { type: "multiple-choice" }>;
export type MsItem = Extract<Item, { type: "multi-select" }>;
export type FillBlankItem = Extract<Item, { type: "fill-blank" }>;
export type ShortAnswerItem = Extract<Item, { type: "short-answer" }>;
export type OrderingItem = Extract<Item, { type: "ordering" }>;
export type MatchingItem = Extract<Item, { type: "matching" }>;
export type FlashcardItem = Extract<Item, { type: "flashcard" }>;
