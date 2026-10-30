import { useEffect, useRef, useState } from "react";

export function expiryDue(firedFor: number | null, startedAt: number, nowMs: number, limitSeconds: number | null): boolean {
  return limitSeconds !== null && firedFor !== startedAt && nowMs - startedAt >= limitSeconds * 1000;
}

export function useClock(startedAt: number | null, limitSeconds: number | null, onExpire: () => void): number {
  const [now, setNow] = useState(Date.now);
  const fired = useRef<number | null>(null);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    if (startedAt === null) return;
    // Wall time survives background throttling; click-created starts survive StrictMode effect replay.
    const timer = setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (expiryDue(fired.current, startedAt, next, limitSeconds)) {
        fired.current = startedAt;
        clearInterval(timer);
        expire.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [startedAt, limitSeconds]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}
