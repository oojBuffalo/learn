import { MAX_MATCH_PICKS } from "@study/shared";
import type { GameMove, GamePlay } from "@study/shared";

/**
 * Adds a move the server has checked to the play it belongs to.
 *
 * Args:
 *   play: The play being built for submission; it is changed in place.
 *   move: The checked move. A move of the other template's shape is ignored.
 * Returns:
 *   True once a matching play holds `MAX_MATCH_PICKS` picks, the most one submission carries.
 *   The play must then end, or its next pick would make a payload the server rejects on every retry.
 */
export function recordMove(play: GamePlay, move: GameMove): boolean {
  if (play.template === "matching" && "left" in move) play.picks.push(move);
  else if (play.template !== "matching" && "itemId" in move) play.answers.push(move);
  return play.template === "matching" && play.picks.length >= MAX_MATCH_PICKS;
}
