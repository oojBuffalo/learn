import type { Answer } from "@study/shared";

export function optionsDraft(multi: boolean, picked: readonly string[]): Answer | null {
  if (!picked.length) return null;
  return multi ? { type: "multi-select", optionIds: [...picked] } : { type: "multiple-choice", optionId: picked[0]! };
}

export function fillBlankDraft(answers: Readonly<Record<string, string>>): Answer | null {
  return Object.values(answers).some((text) => text.trim()) ? { type: "fill-blank", answers: { ...answers } } : null;
}

export function shortAnswerDraft(text: string): Answer | null {
  return text.trim() ? { type: "short-answer", text } : null;
}

export function orderingDraft(ids: readonly string[], touched: boolean): Answer | null {
  return touched ? { type: "ordering", orderedIds: [...ids] } : null;
}

export function matchingDraft(lefts: readonly string[], choices: Readonly<Record<string, string>>): Answer | null {
  return lefts.every((left) => Object.hasOwn(choices, left))
    ? { type: "matching", pairs: lefts.map((left) => ({ left, right: choices[left]! })) }
    : null;
}
