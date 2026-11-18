import { useEffect, useRef } from "react";

/**
 * Refreshes the real POS catalogue without reloading the
 * desktop application or disrupting the cashier's basket.
 *
 * The callback triggers the register's existing authenticated
 * catalogue loader. It never creates or changes stock.
 */
export function useStockAutoRefresh(
  triggerRefresh: () => void,
  enabled = true,
  intervalMs = 15_000,
) {
  const latest = useRef(triggerRefresh);

  useEffect(() => {
    latest.current = triggerRefresh;
  }, [triggerRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => {
      if (
        !document.hidden &&
        navigator.onLine
      ) {
        latest.current();
      }
    };

    const timer = window.setInterval(
      refresh,
      Math.max(5_000, intervalMs),
    );

    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener(
      "visibilitychange",
      refresh,
    );

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener(
        "visibilitychange",
        refresh,
      );
    };
  }, [enabled, intervalMs]);
}