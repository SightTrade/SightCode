"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rate-limited client polling with visible freshness, staleness, error and
 * retry states. Used by discovery tables and the terminal instead of
 * per-component fetches, so a single poll feeds the whole page.
 */
export interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** ms epoch of the last successful fetch (server-provided or client clock). */
  fetchedAt: number | null;
  refresh: () => void;
}

export function usePolling<T>(
  url: string | null,
  intervalMs: number,
  extractFetchedAt?: (data: T) => number,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const inFlight = useRef(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const run = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          // API errors keep prior data visible and mark it stale via error.
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as T;
        if (!cancelled) {
          setData(json);
          setError(null);
          setFetchedAt(extractFetchedAt ? extractFetchedAt(json) : Date.now());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    run();
    const id = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs, tick]);

  return { data, error, loading, fetchedAt, refresh };
}

export const STALE_MS = 90_000;

export function isStale(fetchedAt: number | null): boolean {
  return fetchedAt === null || Date.now() - fetchedAt > STALE_MS;
}