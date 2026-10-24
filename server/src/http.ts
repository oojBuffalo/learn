import type { Context } from "hono";
import type { z } from "zod";
import type { AppEnv } from "./app.js";

/** A parsed request value or the response explaining its rejection. */
export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Builds an API error using the shared response shape.
 *
 * Args:
 *   c: The request context.
 *   status: The HTTP error status.
 *   code: The machine-readable error code.
 *   message: The explanation for the caller.
 *
 * Returns:
 *   A JSON error response.
 *
 * Raises:
 *   None.
 */
export function apiError(
  c: Context,
  status: 400 | 404 | 422,
  code: "invalid_request" | "not_found" | "not_checkable",
  message: string,
): Response {
  return c.json({ error: { code, message } }, status);
}

/**
 * Parses and validates a JSON body before a route looks up or writes data.
 *
 * Args:
 *   c: The request context.
 *   schema: The contract for the body.
 *   invalidMessage: The explanation for a schema rejection.
 *
 * Returns:
 *   The parsed body or a 400 response, including for malformed JSON.
 *
 * Raises:
 *   None for malformed JSON or a schema rejection.
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  c: Context<AppEnv>,
  schema: S,
  invalidMessage: string,
): Promise<Parsed<z.output<S>>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: apiError(c, 400, "invalid_request", "request body must be valid JSON") };
  }
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: apiError(c, 400, "invalid_request", invalidMessage) };
}

/**
 * Validates query parameters using the route's request contract.
 *
 * Args:
 *   c: The request context.
 *   schema: The contract for the query.
 *   invalidMessage: The explanation for a schema rejection.
 *
 * Returns:
 *   The parsed query or a 400 response.
 *
 * Raises:
 *   None for a schema rejection.
 */
export function parseQuery<S extends z.ZodTypeAny>(
  c: Context<AppEnv>,
  schema: S,
  invalidMessage: string,
): Parsed<z.output<S>> {
  const parsed = schema.safeParse(c.req.query());
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: apiError(c, 400, "invalid_request", invalidMessage) };
}
