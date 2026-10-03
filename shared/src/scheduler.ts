export type Rating = "again" | "hard" | "good" | "easy";

export interface CardState {
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  dueAt: string;
}

const DAY_MS = 86_400_000;

export function schedule(prev: CardState | null, rating: Rating, now: Date): CardState {
  const p = prev ?? { intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, dueAt: now.toISOString() };
  let { intervalDays, ease, reps, lapses } = p;

  switch (rating) {
    case "again":
      if (prev) lapses += 1;
      reps = 0;
      ease = Math.max(1.3, ease - 0.2);
      intervalDays = 0;
      break;
    case "hard":
      intervalDays = reps === 0 ? 1 : Math.max(intervalDays + 1, Math.round(intervalDays * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      reps += 1;
      break;
    case "good":
      intervalDays = reps === 0 ? 1 : Math.max(intervalDays + 1, Math.round(intervalDays * ease));
      reps += 1;
      break;
    case "easy":
      intervalDays = reps === 0 ? 3 : Math.max(intervalDays + 2, Math.round(intervalDays * ease * 1.3));
      ease = ease + 0.15;
      reps += 1;
      break;
  }

  const dueAt = new Date(now.getTime() + intervalDays * DAY_MS).toISOString();
  return { intervalDays, ease: Math.round(ease * 100) / 100, reps, lapses, dueAt };
}
