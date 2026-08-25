import { useEffect, useRef } from 'react';

/**
 * Auto-polling hook — calls the given `refetch` function at a regular interval.
 * Used to keep data in sync across Desktop, Mobile, and Web instances.
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

    let id: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (!id) {
        id = setInterval(() => {
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

    const triggerInstantRefresh = () => {
      refetchRef.current();
      stopInterval();
      startInterval();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        if (document.visibilityState === 'visible') {
          triggerInstantRefresh();
        } else {
          stopInterval();
        }
      }
    };

    startInterval();

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', triggerInstantRefresh);
      window.addEventListener('online', triggerInstantRefresh);
    }

    return () => {
      stopInterval();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', triggerInstantRefresh);
        window.removeEventListener('online', triggerInstantRefresh);
      }
    };
  }, [intervalMs, enabled]);
}
