"use client";

import { useMemo, useState } from "react";
import { usePolling } from "@/hooks/usePolling";
import { useLiveDiscovery } from "@/hooks/useLiveDiscovery";
import { discoveryPoolToSummary, discoveryTokenToSummary } from "@/lib/discovery/toSummary";
import { cn, timeAgo } from "@/lib/format";
import { TokenTable, DEFAULT_FILTERS, type SortKey, type TokenFilters } from "./TokenTable";
import type { TokenSummary } from "@/lib/types";

/**
 * Shared discovery feed used by /discover, /trending, /new-pairs,
 * /launch-radar and the /terminal market panel. One poll per page feeds the
 * whole view; filters and sorting run client-side over the polled payload.
 *
 * With `live` enabled, the page additionally connects to the server-side
 * discovery stream (one SSE connection per page, shared upstream adapters):
 * live token launches and new pools appear without waiting for the next poll
 * cycle, and an adapter health strip reports connection status per provider.
 */
export function DiscoveryView(props: {
  /** API query string, e.g. "mode=trending" */
  query: string;
  intervalMs?: number;
  title: string;
  subtitle?: string;
  defaultSort?: SortKey;
  filters?: Partial<TokenFilters>;
  emptyHint?: string;
  /** Enable the real-time discovery stream. */
  live?: boolean;
  /** Which live feeds the tabs expose: "pools" | "tokens" | "both". */
  liveFeeds?: "pools" | "tokens" | "both";
}) {
  const { query, intervalMs = 30_000, title, subtitle, defaultSort = "volume24hUsd", emptyHint, live = false, liveFeeds = "both" } = props;
  const [feed, setFeed] = useState<"pools" | "tokens">(liveFeeds === "tokens" ? "tokens" : "pools");
  const [filters, setFilters] = useState<TokenFilters>({ ...DEFAULT_FILTERS, ...props.filters });
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort);
  const [sortDesc, setSortDesc] = useState(true);

  const { data, error, loading, fetchedAt, refresh } = usePolling<{ tokens: TokenSummary[]; fetchedAt: number; warnings?: string[] }>(
    `/api/discover?${query}`,
    intervalMs,
    (d) => d.fetchedAt,
  );

  const { tokens: liveTokens, pools: livePools, health, connected, lastEventAt, error: liveError } = useLiveDiscovery(live);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const liveRows = useMemo(() => {
    if (!live) return [];
    const tokenRows = liveTokens.map(discoveryTokenToSummary);
    const poolRows = livePools.map(discoveryPoolToSummary);
    return feed === "tokens" ? tokenRows : [...poolRows, ...tokenRows];
  }, [live, feed, liveTokens, livePools]);

  // Live rows win for the same pool/token identity; polled snapshot fills in.
  const rows = useMemo(() => {
    if (!live) return data?.tokens ?? [];
    const key = (r: TokenSummary) => `${r.chain}:${r.address.toLowerCase()}:${r.poolAddress ?? ""}`;
    const liveKeys = new Set(liveRows.map(key));
    const polled = (data?.tokens ?? []).filter((r) => !liveKeys.has(key(r)));
    return [...liveRows, ...polled];
  }, [live, data, liveRows]);

  const warnings = data?.warnings;
  void useMemo; // placeholder to keep imports aligned
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {live && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span
            className={cn("chip", connected ? "border-pos/40 text-pos" : "border-neg/40 text-neg")}
            title={connected ? "Live discovery stream connected" : `Live stream disconnected: ${liveError ?? "reconnecting…"}`}
          >
            {connected ? "● live" : "○ reconnecting"}
          </span>
          {liveFeeds === "both" && (
            <span className="flex gap-1">
              <button
                onClick={() => setFeed("pools")}
                className={cn("chip", feed === "pools" ? "border-accent text-accent" : "text-muted")}
              >
                New Pairs
              </button>
              <button
                onClick={() => setFeed("tokens")}
                className={cn("chip", feed === "tokens" ? "border-accent text-accent" : "text-muted")}
              >
                New Tokens
              </button>
            </span>
          )}
          {health.map((h) => (
            <span
              key={h.id}
              className={cn(
                "chip",
                h.status === "live" ? "border-pos/40 text-pos"
                  : h.status === "connecting" ? "border-warn/40 text-warn"
                  : h.status === "down" ? "border-neg/40 text-neg"
                  : "border-line text-muted",
              )}
              title={`${h.label} — ${h.status}. ${h.limits}${h.lastError ? ` Last error: ${h.lastError}` : ""}${h.lastEventAt ? ` Last event: ${new Date(h.lastEventAt).toLocaleTimeString()}` : ""}`}
            >
              {h.status === "live" ? "●" : h.status === "connecting" ? "◐" : "○"} {h.label}
            </span>
          ))}
          {lastEventAt !== null && (
            <span className="text-2xs text-muted" title="Last live event received from any provider">
              last event {timeAgo(lastEventAt)} ago
            </span>
          )}
        </div>
      )}
      <TokenTable
        rows={rows}
        fetchedAt={fetchedAt}
        error={live && !connected ? liveError ?? error : error}
        loading={loading}
        warnings={warnings}
        onRefresh={refresh}
        sortKey={sortKey}
        sortDesc={sortDesc}
        onSort={onSort}
        filters={filters}
        onFilters={setFilters}
        emptyHint={emptyHint}
      />
    </div>
  );
}