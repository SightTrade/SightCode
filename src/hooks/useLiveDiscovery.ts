"use client";

import { useEffect, useRef, useState } from "react";
import type { AdapterHealth, DiscoveryEvent, DiscoveryPool, DiscoveryToken } from "@/lib/discovery/model";

/**
 * Client-side live discovery stream (SSE /api/discover/stream).
 * - Applies the server snapshot on connect, then live token/pool events.
 * - Deduplicates by record id (server already dedupes; this is a safety net).
 * - Reconnects automatically (EventSource auto-reconnects; explicit reconnect
 *   with backoff+jitter when the stream errors repeatedly).
 * - Bounded buffers (same caps as the server) to prevent unbounded growth.
 */

const MAX_TOKENS = 800;
const MAX_POOLS = 800;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

function dedupe<T extends { id: string }>(list: T[], incoming: T, cap: number): T[] {
  const idx = list.findIndex((t) => t.id === incoming.id);
  if (idx === -1) {
    const next = [incoming, ...list];
    return next.length > cap ? next.slice(0, cap) : next;
  }
  const next = [...list];
  next[idx] = incoming;
  return next;
}

export function useLiveDiscovery(enabled: boolean) {
  const [tokens, setTokens] = useState<DiscoveryToken[]>([]);
  const [pools, setPools] = useState<DiscoveryPool[]>([]);
  const [health, setHealth] = useState<AdapterHealth[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backoffRef = useRef(RECONNECT_BASE_MS);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    let disposed = false;

    const connect = () => {
      if (disposed || esRef.current) return;
      const es = new EventSource("/api/discover/stream");
      esRef.current = es;
      es.onopen = () => {
        setConnected(true);
        setError(null);
        backoffRef.current = RECONNECT_BASE_MS;
      };
      es.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as DiscoveryEvent;
          if (parsed.type === "snapshot") {
            setTokens(parsed.tokens);
            setPools(parsed.pools);
            setHealth(parsed.health);
            setConnected(true);
            setLastEventAt(Date.now());
          } else if (parsed.type === "token") {
            setTokens((prev) => dedupe(prev, parsed.token, MAX_TOKENS));
            setLastEventAt(Date.now());
          } else if (parsed.type === "pool") {
            setPools((prev) => dedupe(prev, parsed.pool, MAX_POOLS));
            setLastEventAt(Date.now());
          } else if (parsed.type === "health") {
            setHealth(parsed.health);
          }
        } catch {
          // malformed frame — skip
        }
      };
      es.onerror = () => {
        setConnected(false);
        setError("Live discovery connection lost — reconnecting…");
        es.close();
        esRef.current = null;
        if (disposed) return;
        const jitter = backoffRef.current * 0.2;
        const delay = Math.round(backoffRef.current + (Math.random() * 2 - 1) * jitter);
        retryRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, RECONNECT_MAX_MS);
          connect();
        }, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = null;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled]);

  return { tokens, pools, health, connected, lastEventAt, error };
}
