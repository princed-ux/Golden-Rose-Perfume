
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

type Status =
  | 'idle'
  | 'refreshing'
  | 'up-to-date'
  | 'error';

export function useStockAutoRefresh(
  fetchLatestCatalogue: () => Promise<void>,
  enabled = true,
  intervalMs = 15_000
) {
  const latestFetcher = useRef(fetchLatestCatalogue);
  const inFlight = useRef(false);
  const alive = useRef(false);

  const [status, setStatus] =
    useState<Status>('idle');

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null);

  useEffect(() => {
    latestFetcher.current = fetchLatestCatalogue;
  }, [fetchLatestCatalogue]);

  const refreshNow = useCallback(async () => {
    if (inFlight.current || !navigator.onLine) {
      return;
    }

    inFlight.current = true;

    if (alive.current) {
      setStatus('refreshing');
    }

    try {
      await latestFetcher.current();

      if (alive.current) {
        setStatus('up-to-date');
        setLastUpdated(new Date());
      }
    } catch {
      if (alive.current) {
        setStatus('error');
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    alive.current = true;

    if (!enabled) {
      return () => {
        alive.current = false;
      };
    }

    const onResume = () => {
      if (!document.hidden) {
        void refreshNow();
      }
    };

    const timer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) {
        void refreshNow();
      }
    }, Math.max(intervalMs, 5_000));

    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener(
      'visibilitychange',
      onResume
    );

    void refreshNow();

    return () => {
      window.clearInterval(timer);

      window.removeEventListener(
        'focus',
        onResume
      );

      window.removeEventListener(
        'online',
        onResume
      );

      document.removeEventListener(
        'visibilitychange',
        onResume
      );

      alive.current = false;
    };
  }, [enabled, intervalMs, refreshNow]);

  return {
    refreshNow,
    status,
    lastUpdated,
    refreshing: status === 'refreshing',
  };
}
