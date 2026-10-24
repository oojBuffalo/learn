import { Hono } from "hono";
import { checkGameMove, gameMoveSchema, gameSettings } from "@study/shared";
import type { AppEnv } from "../app.js";
import { getGame } from "../content.js";
import { apiError, parseJsonBody } from "../http.js";

/**
 * Creates the game read routes.
 * Args:
 *   None.
 * Returns:
 *   Routes serving resolved game pools and effective settings.
 * Raises:
 *   Error: A database read or stored-content decode fails.
 */
export function gameRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get("/:packageId/:gameId", (c) => {
    const { packageId, gameId } = c.req.param();
    const found = getGame(c.get("db"), packageId, gameId);
    if (!found) return apiError(c, 404, "not_found", "unknown game");
    return c.json({ game: found.game, settings: gameSettings(found.game), items: found.pool });
  });
  r.post("/:packageId/:gameId/check", async (c) => {
    const parsed = await parseJsonBody(c, gameMoveSchema, "request body is not a valid game move");
    if (!parsed.ok) return parsed.response;
    const { packageId, gameId } = c.req.param();
    const found = getGame(c.get("db"), packageId, gameId);
    if (!found) return apiError(c, 404, "not_found", "unknown game");
    try {
      return c.json(checkGameMove(found.game, found.pool, parsed.data));
    } catch (error) {
      return apiError(c, 422, "not_checkable", (error as Error).message);
    }
  });
  return r;
}
