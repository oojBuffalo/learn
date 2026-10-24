import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { getQuiz } from "../content.js";
import { apiError } from "../http.js";

/**
 * Creates the quiz read routes.
 * Args:
 *   None.
 * Returns:
 *   Routes serving whole quiz items or a not-found response.
 * Raises:
 *   Error: A database read or stored-content decode fails.
 */
export function quizRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  r.get("/:packageId/:quizId", (c) => {
    const { packageId, quizId } = c.req.param();
    const found = getQuiz(c.get("db"), packageId, quizId);
    if (!found) return apiError(c, 404, "not_found", "unknown quiz");
    return c.json({ quiz: found.quiz, items: Object.fromEntries(found.items) });
  });
  return r;
}
