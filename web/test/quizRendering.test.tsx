import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ShortAnswerItem } from "@study/shared";
import QuizQuestion from "../src/components/QuizQuestion.js";
const html = renderToStaticMarkup;
const CHECK = />Check<\/button>/;
const sa: ShortAnswerItem = { id: "sa", type: "short-answer", prompt: "Recall", accept: ["recall"], hints: ["Hint"] };
it("QuizQuestion has a numbered kicker, no Check and no hints", () => {
  const out = html(<QuizQuestion packageId="p" item={sa} index={1} total={4} locked={false} result={null} onChange={() => {}} />);
  expect(out).toContain("Question 2 of 4 · Short answer"); expect(out).not.toMatch(CHECK); expect(out).not.toContain("Show a hint");
});
it("a locked QuizQuestion shows its unanswered verdict", () => {
  const out = html(<QuizQuestion packageId="p" item={sa} index={0} total={4} locked onChange={() => {}}
    result={{ itemId: "sa", answered: false, correct: false, score: 0, expected: "recall" }} />);
  expect(out).toContain("— Not answered"); expect(out).toContain('disabled=""');
});
