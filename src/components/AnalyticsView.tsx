"use client";

import { useMemo } from "react";
import { usePolling } from "@/hooks/usePolling";
import { CHAINS, TRADABLE_CHAINS } from "@/lib/chains";
import { cn, fmtCompact, fmtPct, fmtPrice, deltaColor, timeAgo } from "@/lib/format";
import type { TokenSummary } from "@/lib/types";

/**
 * Market analytics — aggregates computed from the same live discovery data
 * used across the app. Totals only cover pools surfaced by the provider for
 * the requested pages; this is a window on the market, not a full census.
 */
export function AnalyticsView() {
  const { data, fetchedAt, error, loading, refresh } = usePolling<{ tokens: TokenSummary[]; fetchedAt: number; warnings?: string[] }>(
    "/api/discover?mode=trending&page=2",
    60_000,
    (d) => d.fetchedAt,
  );
  const tokens = data?.tokens ?? [];

  const byChain = useMemo(() => {
    const map = new Map<string, { vol: number; liq: number; count: number; up: number; down: number }>();
    for (const t of tokens) {
      const entry = map.get(t.chain) ?? { vol: 0, liq: 0, count: 0, up: 0, down: 0 };
      entry.vol += t.volume24hUsd ?? 0;
      entry.liq += t.liquidityUsd ?? 0;
      entry.count += 1;
      if ((t.priceChange.h24 ?? 0) > 0) entry.up += 1;
      else if ((t.priceChange.h24 ?? 0) < 0) entry.down += 1;
      map.set(t.chain, entry);
    }
    return map;
  }, [tokens]);

  const topGainers = useMemo(
    () =>
      [...tokens]
        .filter((t) => t.priceChange.h24 !== null)
        .sort((a, b) => (b.priceChange.h24 ?? 0) - (a.priceChange.h24 ?? 0))
        .slice(0, 5),
    [tokens],
  );
  const topLosers = useMemo(
    () =>
      [...tokens]
        .filter((t) => t.priceChange.h24 !== null)
        .sort((a, b) => (a.priceChange.h24 ?? 0) - (b.priceChange.h24 ?? 0))
        .slice(0, 5),
    [tokens],
  );
  const deepest = useMemo(() => [...tokens].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)).slice(0, 8), [tokens]);

  const totals = useMemo(
    () => ({
      vol: tokens.reduce((a, t) => a + (t.volume24hUsd ?? 0), 0),
      liq: tokens.reduce((a, t) => a + (t.liquidityUsd ?? 0), 0),
      count: tokens.length,
      buys: tokens.reduce((a, t) => a + (t.txns24h.buys ?? 0), 0),
      sells: tokens.reduce((a, t) => a + (t.txns24h.sells ?? 0), 0),
    }),
    [tokens],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-fg">Analytics</h1>
          <p className="mt-1 text-xs text-muted">
            Aggregates over the trending-pool window supplied by GeckoTerminal — a live cross-section, not a full market
            census. {fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : ""}
          </p>
        </div>
        <button onClick={refresh} className="btn-ghost focus-ring ml-auto h-8 px-3 text-2xs">
          ↻ Refresh
        </button>
      </div>

      {error && <div className="panel border-neg/40 p-3 text-xs text-neg">Data unavailable: {error}</div>}
      {loading && tokens.length === 0 && <div className="panel h-40 animate-pulse" />}

      {tokens.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="24h volume (window)" value={fmtCompact(totals.vol)} />
            <Stat label="Pooled liquidity (window)" value={fmtCompact(totals.liq)} />
            <Stat label="Pools tracked" value={String(totals.count)} />
            <Stat label="Buy/sell pressure" value={`${totals.buys.toLocaleString()} / ${totals.sells.toLocaleString()}`} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="panel p-3">
              <h2 className="text-sm font-semibold text-fg">By network</h2>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-2xs uppercase text-muted">
                    <th className="py-1.5 pr-2">Chain</th>
                    <th className="py-1.5 pr-2 text-right">Pools</th>
                    <th className="py-1.5 pr-2 text-right">Vol 24h</th>
                    <th className="py-1.5 pr-2 text-right">Liquidity</th>
                    <th className="py-1.5 text-right">Up/Down</th>
                  </tr>
                </thead>
                <tbody>
                  {TRADABLE_CHAINS.filter((c) => byChain.has(c)).map((c) => {
                    const s = byChain.get(c)!;
                    return (
                      <tr key={c} className="border-b border-line/60">
                        <td className="py-1.5 pr-2">
                          <span className="chip">{CHAINS[c].shortName}</span> {CHAINS[c].name}
                        </td>
                        <td className="tabular py-1.5 pr-2 text-right">{s.count}</td>
                        <td className="tabular py-1.5 pr-2 text-right">{fmtCompact(s.vol)}</td>
                        <td className="tabular py-1.5 pr-2 text-right">{fmtCompact(s.liq)}</td>
                        <td className="tabular py-1.5 text-right">
                          <span className="text-pos">{s.up}</span>/<span className="text-neg">{s.down}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="panel p-3">
              <h2 className="text-sm font-semibold text-fg">Top movers (24h, window)</h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-2xs uppercase text-pos">Gainers</p>
                  {topGainers.map((t) => (
                    <p key={t.address} className="flex justify-between py-1 text-xs">
                      <span className="text-fg">{t.symbol}</span>
                      <span className={cn("tabular", deltaColor(t.priceChange.h24))}>{fmtPct(t.priceChange.h24)}</span>
                    </p>
                  ))}
                </div>
                <div>
                  <p className="text-2xs uppercase text-neg">Losers</p>
                  {topLosers.map((t) => (
                    <p key={t.address} className="flex justify-between py-1 text-xs">
                      <span className="text-fg">{t.symbol}</span>
                      <span className={cn("tabular", deltaColor(t.priceChange.h24))}>{fmtPct(t.priceChange.h24)}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="panel p-3">
            <h2 className="text-sm font-semibold text-fg">Deepest liquidity pools</h2>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase text-muted">
                  <th className="py-1.5 pr-2">Token</th>
                  <th className="py-1.5 pr-2">Venue</th>
                  <th className="py-1.5 pr-2 text-right">Price</th>
                  <th className="py-1.5 pr-2 text-right">Liquidity</th>
                  <th className="py-1.5 text-right">Vol 24h</th>
                </tr>
              </thead>
              <tbody>
                {deepest.map((t) => (
                  <tr key={`${t.chain}:${t.address}`} className="border-b border-line/60">
                    <td className="py-1.5 pr-2 text-fg">
                      {t.symbol} <span className="chip">{CHAINS[t.chain].shortName}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-muted">{t.venue ?? "—"}</td>
                    <td className="tabular py-1.5 pr-2 text-right">{fmtPrice(t.priceUsd)}</td>
                    <td className="tabular py-1.5 pr-2 text-right">{fmtCompact(t.liquidityUsd)}</td>
                    <td className="tabular py-1.5 text-right">{fmtCompact(t.volume24hUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-3">
      <p className="text-2xs text-muted">{label}</p>
      <p className="tabular mt-1 text-lg font-bold text-fg">{value}</p>
    </div>
  );
}