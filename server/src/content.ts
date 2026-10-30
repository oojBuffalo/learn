import { GAME_COMPAT, quizItemIds, resolveGameItems } from "@study/shared";
import type { CheckableItem, Game, Item, ItemType, Quiz } from "@study/shared";
import type { Db } from "./db.js";

interface ContentRow { data: string }

/**
 * Reads one stored item.
 * Args:
 *   db: The database. packageId: Package id. itemId: Item id.
 * Returns:
 *   The item, or null when absent.
 * Raises:
 *   Error: Stored content is invalid JSON or a database read fails.
 */
export function getItem(db: Db, packageId: string, itemId: string): Item | null {
  const row = db.prepare("SELECT data FROM items WHERE package_id = ? AND id = ?").get(packageId, itemId) as ContentRow | undefined;
  return row ? JSON.parse(row.data) as Item : null;
}

/**
 * Reads a package's items in authored order.
 * Args:
 *   db: The database. packageId: Package id. types: Optional allowed item types.
 * Returns:
 *   The matching items; an empty type list selects nothing.
 * Raises:
 *   Error: Stored content is invalid JSON or a database read fails.
 */
export function getPackageItems(db: Db, packageId: string, types?: readonly ItemType[]): Item[] {
  if (types?.length === 0) return [];
  const filter = types ? ` AND type IN (${types.map(() => "?").join(", ")})` : "";
  const rows = db.prepare(`SELECT data FROM items WHERE package_id = ?${filter} ORDER BY ord`).all(packageId, ...(types ?? [])) as ContentRow[];
  return rows.map((row) => JSON.parse(row.data) as Item);
}

/**
 * Reads a quiz and its available items in quiz order.
 * Args:
 *   db: The database. packageId: Package id. quizId: Quiz id.
 * Returns:
 *   The quiz and item map, or null; missing stored items stay absent for scoring validation.
 * Raises:
 *   Error: Stored content is invalid JSON or a database read fails.
 */
export function getQuiz(db: Db, packageId: string, quizId: string): { quiz: Quiz; items: Map<string, Item> } | null {
  const row = db.prepare("SELECT data FROM quizzes WHERE package_id = ? AND id = ?").get(packageId, quizId) as ContentRow | undefined;
  if (!row) return null;
  const quiz = JSON.parse(row.data) as Quiz;
  const items = new Map<string, Item>();
  for (const id of quizItemIds(quiz)) {
    const item = getItem(db, packageId, id);
    if (item) items.set(id, item);
  }
  return { quiz, items };
}

/**
 * Reads a game and resolves its compatible item pool.
 * Args:
 *   db: The database. packageId: Package id. gameId: Game id.
 * Returns:
 *   The game and resolved pool, or null when absent.
 * Raises:
 *   Error: Stored content is invalid JSON or a database read fails.
 */
export function getGame(db: Db, packageId: string, gameId: string): { game: Game; pool: CheckableItem[] } | null {
  const row = db.prepare("SELECT data FROM games WHERE package_id = ? AND id = ?").get(packageId, gameId) as ContentRow | undefined;
  if (!row) return null;
  const game = JSON.parse(row.data) as Game;
  return { game, pool: resolveGameItems(game, getPackageItems(db, packageId, GAME_COMPAT[game.template])) };
}

/**
 * Lists quizzes in authored order.
 * Args:
 *   db: The database. packageId: Package id.
 * Returns:
 *   The package's quizzes.
 * Raises:
 *   Error: Stored content is invalid JSON or a database read fails.
 */
export function listQuizzes(db: Db, packageId: string): Quiz[] {
  return (db.prepare("SELECT data FROM quizzes WHERE package_id = ? ORDER BY ord").all(packageId) as ContentRow[]).map((row) => JSON.parse(row.data) as Quiz);
}

/**
 * Lists games in authored order.
 * Args:
 *   db: The database. packageId: Package id.
 * Returns:
 *   The package's games.
 * Raises:
 *   Error: Stored content is invalid JSON or a database read fails.
 */
export function listGames(db: Db, packageId: string): Game[] {
  return (db.prepare("SELECT data FROM games WHERE package_id = ? ORDER BY ord").all(packageId) as ContentRow[]).map((row) => JSON.parse(row.data) as Game);
}
