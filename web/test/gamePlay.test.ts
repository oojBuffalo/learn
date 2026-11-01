import { expect, it } from "vitest";
import { gameSubmissionSchema, MAX_MATCH_PICKS } from "@study/shared";
import type { GamePlay } from "@study/shared";
import { recordMove } from "../src/gamePlay.js";

const miss = { left: "cat", right: "woof" };
const submission = (play: GamePlay) => ({ kind: "game", packageId: "p", gameId: "g", play, elapsedSeconds: 1 });

it("recordMove adds a checked move to its play", () => {
  const matching: GamePlay = { template: "matching", lefts: ["cat"], picks: [] };
  expect(recordMove(matching, miss)).toBe(false);
  expect(matching).toEqual({ template: "matching", lefts: ["cat"], picks: [miss] });
  const answer = { itemId: "q1", answer: { type: "multiple-choice" as const, optionId: "a" } };
  const timed: GamePlay = { template: "timed-round", itemIds: ["q1"], answers: [] };
  expect(recordMove(timed, answer)).toBe(false);
  expect(timed).toEqual({ template: "timed-round", itemIds: ["q1"], answers: [answer] });
});
it("recordMove ends a matching play at the last pick one submission carries", () => {
  const play: GamePlay = { template: "matching", lefts: ["cat"], picks: Array.from({ length: MAX_MATCH_PICKS - 2 }, () => miss) };
  expect(recordMove(play, miss)).toBe(false);
  expect(recordMove(play, miss)).toBe(true);
  expect(gameSubmissionSchema.safeParse(submission(play)).success).toBe(true);   // the full play is still savable
  const over: GamePlay = { ...play, picks: [...play.picks, miss] };
  expect(gameSubmissionSchema.safeParse(submission(over)).success).toBe(false); // one more pick would fail on every retry
});
