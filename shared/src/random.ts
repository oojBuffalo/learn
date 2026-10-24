/**
 * Returns a shuffled copy of a list, using a descending Fisher–Yates shuffle.
 *
 * For `i` from the last index down to 1, the item at `i` swaps with the item at
 * `Math.floor(random() * (i + 1))`. Pass a seeded `random` to make the order
 * reproducible, for example in tests.
 *
 * Args:
 *   items: The list to shuffle. It is never modified.
 *   random: Returns a number in [0, 1). Defaults to `Math.random`.
 *
 * Returns:
 *   A new array holding the same items in a random order.
 *
 * Raises:
 *   None. A `random` that returns 1 or more is out of contract and gives an undefined result.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Returns a shuffled copy of a list that is never in its original order.
 *
 * It shuffles the index list `0…n−1`. When there are at least two items and the
 * shuffle comes out as the identity, it swaps positions 0 and 1, then maps the
 * indices back to the items. An ordering exercise uses this so it never starts solved.
 *
 * Args:
 *   items: The list to scramble. It is never modified.
 *   random: Returns a number in [0, 1). Defaults to `Math.random`.
 *
 * Returns:
 *   A new array holding the same items. For two or more items, the order differs
 *   from the input's. A list of fewer than two items comes back as it is.
 *
 * Raises:
 *   None. A `random` that returns 1 or more is out of contract and gives an undefined result.
 */
export function scramble<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const order = shuffle(
    items.map((_, index) => index),
    random,
  );
  if (order.length >= 2 && order.every((value, index) => value === index)) {
    [order[0], order[1]] = [order[1] as number, order[0] as number];
  }
  return order.map((index) => items[index] as T);
}
