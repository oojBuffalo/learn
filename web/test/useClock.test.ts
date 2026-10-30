import { expect, it } from "vitest";
import { expiryDue } from "../src/useClock.js";

it("expiryDue fires once per start, at the limit, and never without one", () => {
  expect(expiryDue(null, 1_000, 60_999, 60)).toBe(false);
  expect(expiryDue(null, 1_000, 61_000, 60)).toBe(true);
  expect(expiryDue(1_000, 1_000, 90_000, 60)).toBe(false);
  expect(expiryDue(1_000, 5_000, 65_000, 60)).toBe(true);
  expect(expiryDue(null, 1_000, 10 ** 9, null)).toBe(false);
});
