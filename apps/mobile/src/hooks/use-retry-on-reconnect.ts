import { useEffect } from "react";
import { onRequestRecovered } from "../lib/firepit/http";

/**
 * When `active` is true (the screen is showing a load error), re-run `retry`
 * the next time any request succeeds after the connection was degraded, so a
 * stale timeout error clears itself once connectivity returns.
 */
export function useRetryOnReconnect(active: boolean, retry: () => void): void {
  useEffect(() => {
    if (!active) return;
    return onRequestRecovered(retry);
  }, [active, retry]);
}
