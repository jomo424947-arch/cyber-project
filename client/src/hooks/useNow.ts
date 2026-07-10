import { useState, useEffect } from 'react';

/**
 * Re-renders the component every `intervalMs` (default 1000ms).
 * Used to drive the live session timers on the dashboard / devices grid.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
