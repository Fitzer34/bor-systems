import { useEffect, useState } from "react";

/**
 * Forces the calling component to re-render every `intervalMs` milliseconds.
 * Used by anything that computes a time-relative value from cached data —
 * e.g. "is this hanger offline?" — so the indicator flips the moment the
 * threshold is crossed, without waiting for the next React Query refetch.
 *
 * The cost is one setInterval callback per mount; tiny.
 */
export function useTicker(intervalMs: number = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}
