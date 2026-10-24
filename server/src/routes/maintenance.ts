import { Hono } from "hono";
import { purgeOrphansRequestSchema } from "@study/shared";
import type { AppEnv } from "../app.js";
import { apiError, parseJsonBody } from "../http.js";
import { orphanReport, purgeOrphans } from "../orphans.js";

/**
 * Builds the orphan-report and guarded per-package purge routes.
 * Args:
 *   None.
 * Returns:
 *   Routes mounted beneath /api/maintenance.
 * Raises:
 *   Database errors propagate to the app handler; purge writes are transactional.
 */
export function maintenanceRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get("/orphans", (c) => c.json({ packages: orphanReport(c.get("db")) }));
  routes.post("/orphans/purge", async (c) => {
    const parsed = await parseJsonBody(c, purgeOrphansRequestSchema, "request body is not a valid purge request");
    if (!parsed.ok) return parsed.response;
    const result = purgeOrphans(c.get("db"), parsed.data);
    return result.ok ? c.json({ purged: result.purged })
      : apiError(c, 409, "orphans_changed", "leftover progress changed since it was counted; review it and confirm again");
  });
  return routes;
}
