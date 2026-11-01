import { expect, it } from "vitest";
import { formatClock, formatDay, remainingSeconds, percent } from "../src/format.js";

it("formatClock shows m:ss and floors", () => {
  expect(formatClock(0)).toBe("0:00"); expect(formatClock(61)).toBe("1:01");
  expect(formatClock(600)).toBe("10:00"); expect(formatClock(59.9)).toBe("0:59");
});
it("remainingSeconds rounds up and stops at 0", () => {
  expect(remainingSeconds(60, 0)).toBe(60); expect(remainingSeconds(60, 500)).toBe(60); expect(remainingSeconds(60, 59_001)).toBe(1);
  expect(remainingSeconds(60, 60_000)).toBe(0); expect(remainingSeconds(60, 61_000)).toBe(0);
});
it("percent floors, with a float-error guard", () => {
  expect(percent(0.29)).toBe(29); expect(percent(0.7467)).toBe(74); expect(percent(2 / 3)).toBe(66);
  expect(percent(1)).toBe(100); expect(percent(0)).toBe(0);
});
it("formatDay prints a local calendar day", () => {
  expect(formatDay(new Date(2026, 9, 22, 12).toISOString())).toBe("22 Oct 2026"); expect(formatDay("not a date")).toBe("");
});
