import { z } from "zod";
import { idSchema } from "./ids.js";
import type { Item } from "./items.js";

export const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("multiple-choice"), optionId: z.string() }).strict(),
  z.object({ type: z.literal("multi-select"), optionIds: z.array(z.string()) }).strict(),
  z.object({ type: z.literal("fill-blank"), answers: z.record(z.string()) }).strict(),
  z.object({ type: z.literal("short-answer"), text: z.string() }).strict(),
  z.object({ type: z.literal("ordering"), orderedIds: z.array(z.string()) }).strict(),
  z.object({
    type: z.literal("matching"),
    pairs: z.array(z.object({ left: z.string(), right: z.string() }).strict()),
  }).strict(),
]);

export type Answer = z.infer<typeof answerSchema>;

export const attemptRequestSchema = z.object({
  packageId: idSchema,
  itemId: idSchema,
  answer: answerSchema,
}).strict();

export interface CheckResult {
  correct: boolean;
  score: number;
  expected: unknown;
  feedback?: string;
}

export function fold(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function checkAnswer(item: Item, input: Answer): CheckResult {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) throw new Error(`invalid answer: ${parsed.error.issues[0]?.message ?? "wrong shape"}`);
  const answer = parsed.data;
  if (item.type === "flashcard") throw new Error("flashcards are self-graded, not checked");
  if (item.type !== answer.type) throw new Error(`answer/item type mismatch: ${answer.type} vs ${item.type}`);

  switch (item.type) {
    case "multiple-choice": {
      const a = answer as Extract<Answer, { type: "multiple-choice" }>;
      const correctOpt = item.options.find((o) => o.correct)!;
      const picked = item.options.find((o) => o.id === a.optionId);
      if (!picked) throw new Error(`unknown option id "${a.optionId}"`);
      const correct = a.optionId === correctOpt.id;
      return {
        correct,
        score: correct ? 1 : 0,
        expected: correctOpt.id,
        feedback: correct ? undefined : picked.feedback,
      };
    }
    case "multi-select": {
      const a = answer as Extract<Answer, { type: "multi-select" }>;
      if (new Set(a.optionIds).size !== a.optionIds.length) {
        throw new Error("multi-select answer contains a duplicate option id");
      }
      const validIds = new Set(item.options.map((o) => o.id));
      const unknownId = a.optionIds.find((id) => !validIds.has(id));
      if (unknownId) throw new Error(`unknown option id "${unknownId}"`);
      const correctIds = new Set(item.options.filter((o) => o.correct).map((o) => o.id));
      const chosen = new Set(a.optionIds);
      const right = [...chosen].filter((id) => correctIds.has(id)).length;
      const wrong = chosen.size - right;
      const exact = right === correctIds.size && wrong === 0;
      const partial = Math.max(0, (right - wrong) / correctIds.size);
      return {
        correct: exact,
        score: exact ? 1 : item.partialCredit ? partial : 0,
        expected: [...correctIds],
      };
    }
    case "fill-blank": {
      const a = answer as Extract<Answer, { type: "fill-blank" }>;
      const slots = new Set(item.blanks.map((b) => String(b.slot)));
      const unknownSlot = Object.keys(a.answers).find((slot) => !slots.has(slot));
      if (unknownSlot) throw new Error(`unknown blank slot "${unknownSlot}"`);
      let right = 0;
      for (const b of item.blanks) {
        const given = a.answers[String(b.slot)] ?? "";
        const ok = b.caseSensitive
          ? b.accept.some((acc) => acc === given.trim())
          : b.accept.some((acc) => fold(acc) === fold(given));
        if (ok) right += 1;
      }
      const score = right / item.blanks.length;
      return { correct: score === 1, score, expected: Object.fromEntries(item.blanks.map((b) => [b.slot, b.accept[0]])) };
    }
    case "short-answer": {
      const a = answer as Extract<Answer, { type: "short-answer" }>;
      const mode = item.match ?? "fold";
      const ok =
        mode === "exact"
          ? item.accept.some((acc) => acc === a.text.trim())
          : mode === "regex"
            ? item.accept.some((acc) => new RegExp(acc).test(a.text.trim()))
            : item.accept.some((acc) => fold(acc) === fold(a.text));
      return { correct: ok, score: ok ? 1 : 0, expected: item.accept[0] };
    }
    case "ordering": {
      const a = answer as Extract<Answer, { type: "ordering" }>;
      const want = item.steps.map((s) => s.id);
      const submitted = new Set(a.orderedIds);
      if (
        a.orderedIds.length !== want.length ||
        submitted.size !== want.length ||
        want.some((id) => !submitted.has(id))
      ) {
        throw new Error("ordering answer must contain every step id exactly once");
      }
      const right = want.filter((id, i) => a.orderedIds[i] === id).length;
      const score = right / want.length;
      return { correct: score === 1, score, expected: want };
    }
    case "matching": {
      const a = answer as Extract<Answer, { type: "matching" }>;
      const want = new Map(item.pairs.map((p) => [p.left, p.right]));
      const submittedLefts = new Set(a.pairs.map((pair) => pair.left));
      if (
        a.pairs.length !== item.pairs.length ||
        submittedLefts.size !== item.pairs.length ||
        item.pairs.some((pair) => !submittedLefts.has(pair.left))
      ) {
        throw new Error("matching answer must contain every left-hand value exactly once");
      }
      const allowedRights = new Set([
        ...item.pairs.map((pair) => pair.right),
        ...(item.distractors ?? []),
      ]);
      const unknownRight = a.pairs.find((pair) => !allowedRights.has(pair.right));
      if (unknownRight) throw new Error(`unknown matching choice "${unknownRight.right}"`);
      const right = a.pairs.filter((p) => want.get(p.left) === p.right).length;
      const score = right / item.pairs.length;
      return { correct: score === 1, score, expected: item.pairs };
    }
  }
}
