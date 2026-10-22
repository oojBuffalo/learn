import { z } from "zod";

export const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;
export const idSchema = z
  .string()
  .max(64)
  .regex(ID_RE, "id must match /^[a-z0-9][a-z0-9_-]*$/i");
