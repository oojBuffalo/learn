import type { Game } from "@study/shared";

export function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function remainingSeconds(limitSeconds: number, elapsedMs: number): number {
  return Math.max(0, Math.ceil((limitSeconds * 1000 - elapsedMs) / 1000));
}

export function percent(score: number): number {
  return Math.floor(score * 100 + 1e-6);
}

export const TEMPLATE_LABEL: Record<Game["template"], string> = {
  matching: "Matching", "timed-round": "Timed round", "order-it": "Order it",
};
