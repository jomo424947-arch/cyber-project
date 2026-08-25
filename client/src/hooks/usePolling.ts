import { useEffect, useRef } from 'react';

/**
 * Auto-polling hook — calls the given `refetch` function at a regular interval.
 * Used to keep data in sync across Desktop, Mobile, and Web instances.
 *
 * @param refetch  The function to call periodically (typically from useAsync).
 * @param intervalMs  Polling interval in milliseconds (default: 60000 = 60s / 1 min).
 * @param enabled  Whether polling is active (default: true). Set false to pause.
 */
export function usePolling(
  refetch: () => void,
  intervalMs: number = 60000,
  enabled: boolean = true
): void {
  const refetchRef = useRef(refetch);

  // Keep the ref updated with the latest refetch function
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (!id) {
        id = setInterval(() => {
          // Only poll if window/tab is visible
          if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
            refetchRef.current();
          }
        }, intervalMs);
      }
    };

    const stopInterval = () => {
      if (id) {
        clearInterval(id);
        id = null;
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        if (document.visibilityState === 'visible') {
          // Refetch immediately when coming back to the tab/app
          refetchRef.current();
          startInterval();
        } else {
          stopInterval();
        }
      }
    };

    startInterval();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      stopInterval();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [intervalMs, enabled]);
}
