import { expect, it } from "vitest";
import { optionsDraft, fillBlankDraft, shortAnswerDraft, orderingDraft, matchingDraft } from "../src/components/answerRules.js";

it("options: nothing picked is unanswered", () => {
  expect(optionsDraft(false, [])).toBeNull(); expect(optionsDraft(true, [])).toBeNull();
  expect(optionsDraft(false, ["b"])).toEqual({ type: "multiple-choice", optionId: "b" });
  expect(optionsDraft(true, ["a", "c"])).toEqual({ type: "multi-select", optionIds: ["a", "c"] });
});
it("fill-blank: answered once any blank holds non-space text", () => {
  expect(fillBlankDraft({})).toBeNull(); expect(fillBlankDraft({ "1": "  ", "2": "" })).toBeNull();
  expect(fillBlankDraft({ "1": "Again", "2": "" })).toEqual({ type: "fill-blank", answers: { "1": "Again", "2": "" } });
});
it("short answer: whitespace only is unanswered; text is sent as typed", () => {
  expect(shortAnswerDraft("   ")).toBeNull();
  expect(shortAnswerDraft(" recall ")).toEqual({ type: "short-answer", text: " recall " });
});
it("ordering: untouched is unanswered", () => {
  expect(orderingDraft(["s2", "s1"], false)).toBeNull();
  expect(orderingDraft(["s2", "s1"], true)).toEqual({ type: "ordering", orderedIds: ["s2", "s1"] });
});
it("matching: unanswered until every left is chosen", () => {
  expect(matchingDraft(["L1", "L2"], { L1: "R1" })).toBeNull();
  expect(matchingDraft(["L1", "L2"], { L1: "R1", L2: "R2" }))
    .toEqual({ type: "matching", pairs: [{ left: "L1", right: "R1" }, { left: "L2", right: "R2" }] });
});
it("matching: inherited properties do not count as chosen lefts", () => {
  expect(matchingDraft(["toString", "L2"], { L2: "R2" })).toBeNull();
});
