import { Hono } from "hono";
import type { Db } from "./db.js";
import { packageRoutes } from "./routes/packages.js";
import { lessonRoutes } from "./routes/lessons.js";
import { attemptRoutes } from "./routes/attempts.js";

export type AppEnv = { Variables: { db: Db } };

export function createApp(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });
  app.onError((err, c) =>
    c.json({ error: { code: "internal", message: err.message } }, 500),
  );
  app.notFound((c) => c.json({ error: { code: "not_found", message: "no such route or resource" } }, 404));
  app.route("/api/packages", packageRoutes());
  app.route("/api/lessons", lessonRoutes());
  app.route("/api/attempts", attemptRoutes());
  return app;
}
