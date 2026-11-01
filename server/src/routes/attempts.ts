import { Hono } from "hono";
import { attemptBodySchema, attemptsQuerySchema, checkAnswer, scoreGame, scoreQuiz } from "@study/shared";
import type { AppEnv } from "../app.js";
import { apiError, parseJsonBody, parseQuery } from "../http.js";
import { getGame, getItem, getQuiz } from "../content.js";
import { insertExerciseAttempt, insertGameAttempt, insertQuizAttempt, listAttempts } from "../attemptLog.js";

export function attemptRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/", (c) => {
    const query = parseQuery(c, attemptsQuerySchema, "query is not a valid attempts filter");
    if (!query.ok) return query.response;
    return c.json({ attempts: listAttempts(c.get("db"), query.data) });
  });

  r.post("/", async (c) => {
    const db = c.get("db");
    const request = await parseJsonBody(c, attemptBodySchema, "request body is not a valid attempt");
    if (!request.ok) return request.response;
    const body = request.data;
    if ("quizId" in body) {
      const found = getQuiz(db, body.packageId, body.quizId);
      if (!found) return apiError(c, 404, "not_found", "unknown quiz");
      let result;
      try {
        result = scoreQuiz(found.quiz, found.items, body.answers, body.elapsedSeconds);
      } catch (e) {
        return apiError(c, 422, "not_checkable", (e as Error).message);
      }
      insertQuizAttempt(db, body, result);
      return c.json(result);
    }
    if ("gameId" in body) {
      const found = getGame(db, body.packageId, body.gameId);
      if (!found) return apiError(c, 404, "not_found", "unknown game");
      let result;
      try {
        result = scoreGame(found.game, found.pool, body.play, body.elapsedSeconds);
      } catch (e) {
        return apiError(c, 422, "not_checkable", (e as Error).message);
      }
      insertGameAttempt(db, body, result);
      return c.json(result);
    }
    const { packageId, itemId, answer } = body;
    const item = getItem(db, packageId, itemId);
    if (!item) return apiError(c, 404, "not_found", "unknown item");
    let result;
    try {
      result = checkAnswer(item, answer);
    } catch (e) {
      return apiError(c, 422, "not_checkable", (e as Error).message);
    }
    insertExerciseAttempt(db, packageId, itemId, answer, result);
    return c.json(result);
  });

  return r;
}
