import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic async-data loader. Returns { data, loading, isRefetching, error, refetch }.
 * Prevents full-screen teardown and spinner flash on background updates/refetches.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<T | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (!isMountedRef.current) return;
    // Only show full loading state if we don't have data yet
    if (dataRef.current === null) {
      setLoading(true);
    } else {
      setIsRefetching(true);
    }
    setError(null);
    try {
      const result = await fnRef.current();
      if (!isMountedRef.current) return;
      dataRef.current = result;
      setData(result);
    } catch (err) {
      if (!isMountedRef.current) return;
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to load data';
      setError(msg);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setIsRefetching(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, isRefetching, error, refetch: run };
}

