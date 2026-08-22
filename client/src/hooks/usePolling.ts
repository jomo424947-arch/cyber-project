import { useEffect, useRef } from 'react';

/**
 * Auto-polling hook — calls the given `refetch` function at a regular interval.
 * Used to keep data in sync across Desktop and Web instances.
 *
 * @param refetch  The function to call periodically (typically from useAsync).
 * @param intervalMs  Polling interval in milliseconds (default: 15000 = 15s).
 * @param enabled  Whether polling is active (default: true). Set false to pause.
 */
export function usePolling(
  refetch: () => void,
  intervalMs: number = 15000,
  enabled: boolean = true
): void {
  const refetchRef = useRef(refetch);

  // Keep the ref updated with the latest refetch function
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      refetchRef.current();
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
