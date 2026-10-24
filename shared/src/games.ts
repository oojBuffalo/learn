import type { CheckableItem, Item } from "./items.js";
import type { Game } from "./packageSchema.js";
import { checkAnswer } from "./checking.js";
import type { CheckResult } from "./checking.js";
import { shuffle } from "./random.js";
import type { GameMove, GamePlay } from "./requests.js";

/** The item types each game template can play. A source item of any other type is dropped. */
export const GAME_COMPAT: Record<Game["template"], Item["type"][]> = {
  matching: ["matching"],
  "timed-round": ["multiple-choice", "multi-select"],
  "order-it": ["ordering"],
};

/** A game's effective settings, after its own `settings` overlay the template defaults. */
export interface GameSettings {
  /** The most units dealt in one round. A round is smaller when the pool has fewer units. */
  roundSize: number;
  /** The round's countdown in seconds, or null for a stopwatch that is shown but not scored. */
  timeLimitSeconds: number | null;
}

/** The settings a game gets for each field it leaves unset. */
export const GAME_DEFAULTS: Record<Game["template"], GameSettings> = {
  matching: { roundSize: 6, timeLimitSeconds: null },
  "timed-round": { roundSize: 10, timeLimitSeconds: 60 },
  "order-it": { roundSize: 3, timeLimitSeconds: null },
};

/** The most authored distractors a matching board adds to the dealt pairs' right-hand texts. */
export const MAX_MATCH_DISTRACTORS = 2;

/**
 * Resolves a game's settings, overlaying its own on the template defaults field by field.
 *
 * Args:
 *   game: The game whose `settings` may leave either field unset.
 *
 * Returns:
 *   The effective `roundSize` and `timeLimitSeconds`.
 *
 * Raises:
 *   None.
 */
export function gameSettings(game: Game): GameSettings {
  const defaults = GAME_DEFAULTS[game.template];
  return {
    roundSize: game.settings?.roundSize ?? defaults.roundSize,
    timeLimitSeconds: game.settings?.timeLimitSeconds ?? defaults.timeLimitSeconds,
  };
}

/**
 * Resolves a game's source to the items it can play.
 *
 * An `itemIds` source walks the listed order, keeps the first occurrence of each id
 * and skips ids that name no item. A `tags` source takes every item that carries any
 * listed tag, in `items` order. Either way, only items of a type the template can play
 * (`GAME_COMPAT`) are kept.
 *
 * Args:
 *   game: The game whose `source` and `template` select the items.
 *   items: Every item of the game's package, in items.json order.
 *
 * Returns:
 *   The compatible items, possibly none.
 *
 * Raises:
 *   None.
 */
export function resolveGameItems(game: Game, items: readonly Item[]): CheckableItem[] {
  let picked: Item[];
  if ("itemIds" in game.source) {
    const byId = new Map<string, Item>();
    for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
    const seen = new Set<string>();
    picked = [];
    for (const id of game.source.itemIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const item = byId.get(id);
      if (item) picked.push(item);
    }
  } else {
    const { tags } = game.source;
    picked = items.filter((i) => i.tags?.some((t) => tags.includes(t)));
  }
  const compatible = GAME_COMPAT[game.template];
  return picked.filter((i): i is CheckableItem => i.type !== "flashcard" && compatible.includes(i.type));
}

/** One matching pair, pooled from a matching item, with the item it came from. */
export interface MatchPair {
  /** The id of the matching item that authored the pair. */
  itemId: string;
  /** The left-hand text. Unique across a pool. */
  left: string;
  /** The right-hand text that belongs with `left`. It may repeat across pairs. */
  right: string;
}

/**
 * Pools the pairs of a game's matching items.
 *
 * Pairs are flattened in pool order. A pair whose left text was already seen is skipped,
 * so the first pair for a repeated left wins.
 *
 * Args:
 *   pool: The game's resolved items, as `resolveGameItems` returns them.
 *
 * Returns:
 *   The pooled pairs, each tagged with its source item. Items of other types add none.
 *
 * Raises:
 *   None.
 */
export function matchingPairs(pool: readonly CheckableItem[]): MatchPair[] {
  const seen = new Set<string>();
  const pairs: MatchPair[] = [];
  for (const item of pool) {
    if (item.type !== "matching") continue;
    for (const { left, right } of item.pairs) {
      if (seen.has(left)) continue;
      seen.add(left);
      pairs.push({ itemId: item.id, left, right });
    }
  }
  return pairs;
}

/**
 * Counts the units a round deals from: pooled pairs for matching, items for the other templates.
 *
 * Args:
 *   game: The game whose template decides what a unit is.
 *   pool: The game's resolved items.
 *
 * Returns:
 *   The number of units available to deal.
 *
 * Raises:
 *   None.
 */
export function unitCount(game: Game, pool: readonly CheckableItem[]): number {
  return game.template === "matching" ? matchingPairs(pool).length : pool.length;
}

/**
 * Sizes a round: the configured round size, capped by the units the pool has.
 *
 * Args:
 *   game: The game whose settings give the round size.
 *   pool: The game's resolved items.
 *
 * Returns:
 *   `min(roundSize, unitCount)`, the number of units one play deals.
 *
 * Raises:
 *   None.
 */
export function roundSizeFor(game: Game, pool: readonly CheckableItem[]): number {
  return Math.min(gameSettings(game).roundSize, unitCount(game, pool));
}

/** The dealt matching tiles or item ids for one round. */
export type GameDeal =
  | { template: "matching"; lefts: string[]; rights: string[] }
  | { template: "timed-round" | "order-it"; itemIds: string[] };

/**
 * Deals a random round from a resolved game pool without mutating it.
 *
 * Args:
 *   game: The game whose template and effective round size apply.
 *   pool: Its resolved compatible items, in package/source order.
 *   random: An injectable random source returning values in [0, 1).
 * Returns:
 *   Distinct playable units and, for matching, shuffled right-hand tiles.
 * Raises:
 *   None.
 */
export function dealGame(game: Game, pool: readonly CheckableItem[], random: () => number = Math.random): GameDeal {
  const n = roundSizeFor(game, pool);
  if (game.template !== "matching") {
    return { template: game.template, itemIds: shuffle(pool, random).slice(0, n).map((i) => i.id) };
  }
  const dealt = shuffle(matchingPairs(pool), random).slice(0, n);
  const sourceIds = new Set(dealt.map((pair) => pair.itemId));
  const dealtRights = new Set(dealt.map((pair) => pair.right));
  const candidates = new Set<string>();
  for (const item of pool) {
    if (item.type !== "matching" || !sourceIds.has(item.id)) continue;
    for (const text of item.distractors ?? []) if (!dealtRights.has(text)) candidates.add(text);
  }
  const distractors = shuffle([...candidates], random).slice(0, MAX_MATCH_DISTRACTORS);
  return {
    template: "matching",
    lefts: dealt.map((pair) => pair.left),
    rights: shuffle([...dealt.map((pair) => pair.right), ...distractors], random),
  };
}

/** A complete item verdict, or a matching verdict that reveals no answer key. */
export type GameMoveResult = CheckResult | { correct: boolean };

/**
 * Checks one move against a game's full resolved pool, without writing state.
 *
 * Args:
 *   game: The game whose template selects the move shape.
 *   pool: Its resolved compatible items.
 *   move: A matching text pick or an item answer.
 * Returns:
 *   A matching correctness flag or the item's CheckResult.
 * Raises:
 *   Error: The move has the wrong shape, the matching left/right or item is
 *     outside the pool, or checkAnswer rejects the answer.
 */
export function checkGameMove(game: Game, pool: readonly CheckableItem[], move: GameMove): GameMoveResult {
  if (game.template === "matching") {
    if (!("left" in move)) throw new Error("matching games take { left, right } picks");
    const pair = matchingPairs(pool).find((p) => p.left === move.left);
    if (!pair) throw new Error(`unknown matching left "${move.left}"`);
    const allowed = pool.some((item) => item.type === "matching" &&
      (item.pairs.some((p) => p.right === move.right) || item.distractors?.includes(move.right)));
    if (!allowed) throw new Error(`unknown matching choice "${move.right}"`);
    return { correct: pair.right === move.right };
  }
  if (!("itemId" in move)) throw new Error(`${game.template} games take { itemId, answer } moves`);
  const item = pool.find((i) => i.id === move.itemId);
  if (!item) throw new Error(`item "${move.itemId}" is not in this game`);
  return checkAnswer(item, move.answer);
}

/** The server-computed score and summary of one completed or interrupted game. */
export interface GameResult {
  template: Game["template"];
  score: number;
  correctCount: number;
  total: number;
  mistakes: number;
  completed: boolean;
  timedOut: boolean;
  elapsedSeconds: number;
}

/**
 * Replays a game's moves and scores a valid dealt round, counting unanswered units as zero.
 *
 * Args:
 *   game: The validated game whose settings and template apply.
 *   pool: Its resolved compatible items.
 *   play: The dealt units and ordered moves submitted by the learner.
 *   elapsedSeconds: The request-validated elapsed time.
 * Returns:
 *   The score, progress counts and elapsed time clamped to the game's limit.
 * Raises:
 *   Error: The play template differs, its deal cannot come from this pool,
 *     a move repeats or names an undealt unit, or checkGameMove rejects it.
 */
export function scoreGame(game: Game, pool: readonly CheckableItem[], play: GamePlay, elapsedSeconds: number): GameResult {
  if (play.template !== game.template) {
    throw new Error(`play template "${play.template}" does not match game template "${game.template}"`);
  }
  const total = roundSizeFor(game, pool);
  const units = play.template === "matching" ? play.lefts : play.itemIds;
  const available = new Set(play.template === "matching" ? matchingPairs(pool).map((p) => p.left) : pool.map((i) => i.id));
  if (units.length !== total || new Set(units).size !== total || units.some((id) => !available.has(id))) {
    throw new Error(`the deal must hold ${total} distinct units of this game`);
  }
  const dealt = new Set(units);
  const answered = new Set<string>();
  let correctCount = 0;
  let mistakes = 0;
  let points = 0;
  if (play.template === "matching") {
    for (const pick of play.picks) {
      if (!dealt.has(pick.left) || answered.has(pick.left)) {
        throw new Error(`pick for an undealt or already matched left "${pick.left}"`);
      }
      if (checkGameMove(game, pool, pick).correct) {
        answered.add(pick.left);
        correctCount++;
      } else {
        mistakes++;
      }
    }
    points = correctCount / (total + mistakes);
  } else {
    for (const answer of play.answers) {
      if (!dealt.has(answer.itemId) || answered.has(answer.itemId)) {
        throw new Error(`answer for an undealt or already answered item "${answer.itemId}"`);
      }
      const result = checkGameMove(game, pool, answer) as CheckResult;
      answered.add(answer.itemId);
      points += result.score;
      if (result.correct) correctCount++;
      else mistakes++;
    }
    points /= total;
  }
  const limit = gameSettings(game).timeLimitSeconds;
  return {
    template: game.template,
    score: points,
    correctCount,
    total,
    mistakes,
    completed: answered.size === total,
    timedOut: limit !== null && elapsedSeconds >= limit,
    elapsedSeconds: limit === null ? elapsedSeconds : Math.min(elapsedSeconds, limit),
  };
}
