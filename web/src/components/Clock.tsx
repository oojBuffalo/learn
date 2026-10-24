import { formatClock, remainingSeconds } from "../format.js";

export default function Clock({ elapsedMs, limitSeconds }: { elapsedMs: number; limitSeconds: number | null }) {
  return <p className="clock" role="timer" aria-label={limitSeconds === null ? "Time taken" : "Time left"}>
    {formatClock(limitSeconds === null ? elapsedMs / 1000 : remainingSeconds(limitSeconds, elapsedMs))}
  </p>;
}
