"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/chains";
import { useWatchlists } from "@/lib/store";
import { cn, deltaColor, fmtCompact, fmtPct, fmtPrice, shortAddr, timeAgo } from "@/lib/format";
import type { TokenDetail } from "@/lib/types";
import PriceChart from "./PriceChart";
import { TradePanel } from "./TradePanel";
import { TokenInfoTabs } from "./TokenInfoTabs";

/** Full token detail workspace: header stats, chart, info tabs, trade panel. */
export function TokenDetailPage({ chain, address }: { chain: string; address: string }) {
  const [detail, setDetail] = useState<TokenDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const watched = useWatchlists();
  const [isWatched, setIsWatched] = useState(false);
  /** Selected chart pair (pool address). Defaults to the best pair per liquidity. */
  const [selectedPool, setSelectedPool] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedPool(null);
    fetch(`/api/token/${chain}/${encodeURIComponent(address)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setDetail(body as TokenDetail);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chain, address]);

  useEffect(() => {
    setIsWatched(watched.isTokenWatched(chain as never, address));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, address, watched.tokens.length]);

  const chainCfg = CHAINS[chain as keyof typeof CHAINS];

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="panel h-[600px] animate-pulse" />
          <div className="panel h-[600px] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-[1600px] p-3 sm:p-4">
        <div className="panel p-6 text-center">
          <p className="text-sm text-neg">Token data unavailable: {error}</p>
          <p className="mt-2 text-xs text-muted">
            The token may not be indexed yet, or the address may not exist on this network.
          </p>
          <Link href="/discover" className="btn-ghost mt-4 inline-flex">
            Back to Discover
          </Link>
        </div>
      </div>
    );
  }

  const r = detail.summary;
  const chartPool = selectedPool ?? r.poolAddress;
  const selectedVenue = detail.venues.find((v) => v.poolAddress && chartPool && v.poolAddress.toLowerCase() === chartPool.toLowerCase());
  const mCapLabel = r.marketCapUsd !== null ? "MCap" : r.fdvUsd !== null ? "FDV" : null;
  const mCapValue = r.marketCapUsd ?? r.fdvUsd;

  return (
    <div className="mx-auto max-w-[1600px] p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              {r.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image} alt="" className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-line bg-surface object-cover" referrerPolicy="no-referrer" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-fg">{r.symbol}</h1>
                  <span className="chip" title={chainCfg?.name}>{chainCfg?.shortName}</span>
                  <button
                    onClick={() =>
                      isWatched ? watched.removeToken(chain as never, address) : watched.addToken({ chain: chain as never, address, symbol: r.symbol })
                    }
                    className={cn("focus-ring rounded p-1", isWatched ? "text-accent" : "text-muted hover:text-fg")}
                    aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill={isWatched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                      <path d="M10 3.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14.2l-4.2 2.3.8-4.7-3.4-3.3 4.7-.7L10 3.5z" />
                    </svg>
                  </button>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {r.name} · <span className="font-mono">{shortAddr(r.address, 8, 8)}</span>
                  {chainCfg?.explorer && (
                    <>
                      {" · "}
                      <a className="underline hover:no-underline" href={chainCfg.explorer.token(r.address)} target="_blank" rel="noopener noreferrer">
                        {chainCfg.explorer.name} ↗
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-right">
              <div>
                <p className="tabular text-xl font-bold text-fg">{fmtPrice(r.priceUsd)}</p>
                <div className="flex items-center justify-end gap-1.5">
                  {(
                    [
                      ["5m", r.priceChange.m5],
                      ["1h", r.priceChange.h1],
                      ["6h", r.priceChange.h6],
                      ["24h", r.priceChange.h24],
                    ] as [string, number | null][]
                  ).map(([label, v]) => (
                    <span key={label} className={cn("tabular text-xs", v === null ? "text-muted" : deltaColor(v))}>
                      {v === null ? "—" : fmtPct(v)} <span className="text-2xs text-muted">{label}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="hidden sm:block">
                <p className="text-2xs text-muted">{mCapLabel ?? "MCap"}</p>
                <p className="tabular text-sm text-fg">{mCapValue === null ? "—" : fmtCompact(mCapValue)}</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-2xs text-muted">Liquidity</p>
                <p className="tabular text-sm text-fg">{fmtCompact(r.liquidityUsd)}</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-2xs text-muted">Vol 24h</p>
                <p className="tabular text-sm text-fg">{fmtCompact(r.volume24hUsd)}</p>
              </div>
              <div className="hidden sm:block">
                <p className="text-2xs text-muted">Age</p>
                <p className="text-xs text-muted">{r.createdAt ? timeAgo(r.createdAt) : "—"}</p>
              </div>
            </div>
          </div>

          {detail.venues.length > 1 && (
            <div className="panel flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
              <label className="text-2xs text-muted" htmlFor="pair-select">
                Pair / venue
              </label>
              <select
                id="pair-select"
                value={chartPool ?? ""}
                onChange={(e) => setSelectedPool(e.target.value || null)}
                className="input h-8 w-auto min-w-[240px] max-w-full py-1 text-xs"
              >
                {(chartPool && !detail.venues.some((v) => v.poolAddress === chartPool)
                  ? [
                      { venue: r.venue ?? "Primary pool", poolAddress: chartPool, liquidityUsd: r.liquidityUsd, volume24hUsd: r.volume24hUsd, url: null },
                      ...detail.venues,
                    ]
                  : detail.venues
                ).map((v) => (
                  <option key={v.poolAddress ?? "none"} value={v.poolAddress ?? ""}>
                    {v.venue} · Liq {v.liquidityUsd === null ? "—" : fmtCompact(v.liquidityUsd)} · Vol24h {v.volume24hUsd === null ? "—" : fmtCompact(v.volume24hUsd)}
                  </option>
                ))}
              </select>
              {selectedVenue && (
                <span className="text-2xs text-muted" title={selectedVenue.poolAddress ?? undefined}>
                  Charting <span className="text-fg">{selectedVenue.venue}</span>
                  {selectedVenue.liquidityUsd !== null && <> · liq {fmtCompact(selectedVenue.liquidityUsd)}</>}
                  {selectedVenue.volume24hUsd !== null && <> · vol24h {fmtCompact(selectedVenue.volume24hUsd)}</>}
                </span>
              )}
              <span className="text-2xs text-muted/70">
                Bonding-curve markets and AMM pools are listed separately — history differs per pair.
              </span>
            </div>
          )}

          <PriceChart chain={chain} poolAddress={chartPool} tokenAddress={r.address} tokenSymbol={r.symbol} />
          <TokenInfoTabs detail={detail} chain={chain} />
        </div>

        <div className="min-w-0">
          <TradePanel detail={detail} />
        </div>
      </div>
    </div>
  );
}