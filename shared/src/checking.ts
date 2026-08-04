import type { Item } from "./items.js";

export type Answer =
  | { type: "multiple-choice"; optionId: string }
  | { type: "multi-select"; optionIds: string[] }
  | { type: "fill-blank"; answers: Record<string, string> }
  | { type: "short-answer"; text: string }
  | { type: "ordering"; orderedIds: string[] }
  | { type: "matching"; pairs: { left: string; right: string }[] };

export interface CheckResult {
  correct: boolean;
  score: number;
  expected: unknown;
  feedback?: string;
}

export function fold(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function checkAnswer(item: Item, answer: Answer): CheckResult {
  if (item.type === "flashcard") throw new Error("flashcards are self-graded, not checked");
  if (item.type !== answer.type) throw new Error(`answer/item type mismatch: ${answer.type} vs ${item.type}`);

  switch (item.type) {
    case "multiple-choice": {
      const a = answer as Extract<Answer, { type: "multiple-choice" }>;
      const correctOpt = item.options.find((o) => o.correct)!;
      const picked = item.options.find((o) => o.id === a.optionId);
      const correct = a.optionId === correctOpt.id;
      return {
        correct,
        score: correct ? 1 : 0,
        expected: correctOpt.id,
        feedback: correct ? undefined : picked?.feedback,
      };
    }
    case "multi-select": {
      const a = answer as Extract<Answer, { type: "multi-select" }>;
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
      const right = want.filter((id, i) => a.orderedIds[i] === id).length;
      const score = right / want.length;
      return { correct: score === 1, score, expected: want };
    }
    case "matching": {
      const a = answer as Extract<Answer, { type: "matching" }>;
      const want = new Map(item.pairs.map((p) => [p.left, p.right]));
      const seenLeft = new Set<string>();
      const deduped = a.pairs.filter((p) => {
        if (seenLeft.has(p.left)) return false;
        seenLeft.add(p.left);
        return true;
      });
      const right = deduped.filter((p) => want.get(p.left) === p.right).length;
      const score = right / item.pairs.length;
      return { correct: score === 1, score, expected: item.pairs };
    }
  }
}
