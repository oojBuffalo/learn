import { describe, expect, it } from "vitest";
import { schedule } from "../src/index.js";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const day = 86_400_000;

describe("schedule", () => {
  it("new card graded good → 1 day out", () => {
    const s = schedule(null, "good", NOW);
    expect(s).toMatchObject({ intervalDays: 1, reps: 1, lapses: 0, ease: 2.5 });
    expect(s.dueAt).toBe(new Date(NOW.getTime() + day).toISOString());
  });

  it("new card graded easy → 3 days, ease up", () => {
    const s = schedule(null, "easy", NOW);
    expect(s).toMatchObject({ intervalDays: 3, ease: 2.65 });
  });

  it("mature card graded good multiplies by ease", () => {
    const prev = { intervalDays: 10, ease: 2.5, reps: 3, lapses: 0, dueAt: NOW.toISOString() };
    expect(schedule(prev, "good", NOW).intervalDays).toBe(25);
  });

  it("again resets reps, bumps lapses, floors ease at 1.3, due immediately", () => {
    const prev = { intervalDays: 10, ease: 1.35, reps: 3, lapses: 1, dueAt: NOW.toISOString() };
    const s = schedule(prev, "again", NOW);
    expect(s).toMatchObject({ intervalDays: 0, reps: 0, lapses: 2, ease: 1.3 });
    expect(s.dueAt).toBe(NOW.toISOString());
  });

  it("hard grows slowly and always at least +1 day", () => {
    const prev = { intervalDays: 2, ease: 2.5, reps: 2, lapses: 0, dueAt: NOW.toISOString() };
    expect(schedule(prev, "hard", NOW).intervalDays).toBe(3); // max(3, round(2.4)) = 3
  });
});
