import type { CheckableItem, Item } from "./items.js";
import type { Game } from "./packageSchema.js";

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
