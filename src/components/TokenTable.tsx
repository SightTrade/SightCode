"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { CHAINS, TRADABLE_CHAINS, type ChainId } from "@/lib/chains";
import { useWatchlists, useUi } from "@/lib/store";
import { cn, fmtAge, fmtCompact, fmtPct, fmtPrice, fmtNum, deltaColor, timeAgo, shortAddr } from "@/lib/format";
import { isStale } from "@/hooks/usePolling";
import type { TokenSummary } from "@/lib/types";

export type SortKey =
  | "liquidityUsd"
  | "volume24hUsd"
  | "priceUsd"
  | "marketCap"
  | "createdAt"
  | "buys24"
  | "sells24"
  | "traders24h"
  | "h1"
  | "h24";

export interface TokenFilters {
  chain: ChainId | "all";
  /** max age in hours for the pool ("any" = no filter) */
  maxAgeHours: number | null;
  minLiquidityUsd: number | null;
  minVolumeUsd: number | null;
  minMcUsd: number | null;
  minBuys24: number | null;
  hideUntracked: boolean;
}

export const DEFAULT_FILTERS: TokenFilters = {
  chain: "all",
  maxAgeHours: null,
  minLiquidityUsd: null,
  minVolumeUsd: null,
  minMcUsd: null,
  minBuys24: null,
  hideUntracked: true,
};

export function applyFilters(rows: TokenSummary[], f: TokenFilters, now = Date.now()): TokenSummary[] {
  return rows.filter((r) => {
    if (f.chain !== "all" && r.chain !== f.chain) return false;
    if (f.maxAgeHours !== null) {
      if (r.createdAt === null) return f.hideUntracked ? false : true;
      if (now - r.createdAt > f.maxAgeHours * 3_600_000) return false;
    }
    if (f.minLiquidityUsd !== null && (r.liquidityUsd ?? 0) < f.minLiquidityUsd) return false;
    if (f.minVolumeUsd !== null && (r.volume24hUsd ?? 0) < f.minVolumeUsd) return false;
    if (f.minMcUsd !== null && (r.marketCapUsd ?? 0) < f.minMcUsd) return false;
    if (f.minBuys24 !== null && (r.txns24h.buys ?? 0) < f.minBuys24) return false;
    return true;
  });
}

export function sortRows(rows: TokenSummary[], key: SortKey, desc: boolean): TokenSummary[] {
  const val = (r: TokenSummary): number | null => {
    switch (key) {
      case "liquidityUsd": return r.liquidityUsd;
      case "volume24hUsd": return r.volume24hUsd;
      case "priceUsd": return r.priceUsd;
      case "marketCap": return r.marketCapUsd ?? r.fdvUsd;
      case "createdAt": return r.createdAt;
      case "buys24": return r.txns24h.buys;
      case "sells24": return r.txns24h.sells;
      case "traders24h": return r.traders24h;
      case "h1": return r.priceChange.h1;
      case "h24": return r.priceChange.h24;
    }
  };
  const sorted = [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // nulls sink to the bottom regardless of direction
    if (vb === null) return -1;
    return desc ? vb - va : va - vb;
  });
  return sorted;
}

function CapLabel({ r }: { r: TokenSummary }) {
  return r.marketCapUsd !== null ? (
    <span title="Market capitalization reported by the data provider">MC</span>
  ) : (
    <span title="Fully diluted valuation (total supply × price) — provider does not report market cap for this pool">FDV</span>
  );
}

const COLUMNS: { key: SortKey | null; label: string; align?: string; title?: string }[] = [
  { key: null, label: "Token" },
  { key: "createdAt", label: "Age", title: "Time since the liquidity pool was created (not token deployment)" },
  { key: "priceUsd", label: "Price" },
  { key: "h1", label: "1h" },
  { key: "h24", label: "24h" },
  { key: "marketCap", label: "MC/FDV", align: "text-right" },
  { key: "liquidityUsd", label: "Liquidity", align: "text-right", title: "Total pooled liquidity in USD" },
  { key: "volume24hUsd", label: "Vol 24h", align: "text-right" },
  { key: "buys24", label: "Buys", align: "text-right" },
  { key: "sells24", label: "Sells", align: "text-right" },
  { key: null, label: "Venue" },
  { key: null, label: "" },
];

export function TokenTable(props: {
  rows: TokenSummary[];
  fetchedAt: number | null;
  error: string | null;
  loading: boolean;
  warnings?: string[];
  onRefresh: () => void;
  sortKey: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
  filters: TokenFilters;
  onFilters: (f: TokenFilters) => void;
  emptyHint?: string;
  maxRows?: number;
  showFilters?: boolean;
}) {
  const {
    rows, fetchedAt, error, loading, warnings, onRefresh,
    sortKey, sortDesc, onSort, filters, onFilters,
    emptyHint, maxRows = 100, showFilters = true,
  } = props;
  const { tokens, addToken, removeToken } = useWatchlists();
  const [visible, setVisible] = useState(maxRows);
  const setActiveChain = useUi((s) => s.setActiveChain);

  const filtered = useMemo(() => sortRows(applyFilters(rows, filters), sortKey, sortDesc), [rows, filters, sortKey, sortDesc]);
  const shown = filtered.slice(0, visible);
  const stale = isStale(fetchedAt);
  const watchedSet = useMemo(() => new Set(tokens.map((t) => `${t.chain}:${t.address}`)), [tokens]);

  return (
    <div className="panel flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        {showFilters && <FilterBar filters={filters} onFilters={onFilters} />}
        <div className="ml-auto flex items-center gap-2 text-2xs text-muted">
          {warnings?.map((w, i) => (
            <span key={i} className="chip border-warn/40 text-warn" title={w}>
              partial data
            </span>
          ))}
          <span className={cn(stale && "text-warn")} title={stale ? "Data may be stale" : "Data freshness"}>
            {fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : "—"}
            {stale && " · stale"}
          </span>
          {loading && <span className="animate-live-pulse text-info">●</span>}
          <button onClick={onRefresh} className="focus-ring rounded px-1.5 py-0.5 hover:text-fg" aria-label="Refresh data" title="Refresh">
            ↻
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-neg/30 bg-neg/10 px-3 py-2 text-xs text-neg">
          Live data unavailable: {error}. Values below are from the last successful load and may be stale.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line text-2xs uppercase tracking-wider text-muted">
              {COLUMNS.map((c, i) => (
                <th
                  key={i}
                  className={cn("px-2.5 py-2 font-medium text-left", c.align, c.key && "cursor-pointer select-none hover:text-fg")}
                  onClick={c.key ? () => onSort(c.key!) : undefined}
                  title={c.title}
                  scope="col"
                >
                  {c.label}
                  {c.key === sortKey && <span className="ml-0.5 text-accent">{sortDesc ? "▼" : "▲"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const watched = watchedSet.has(`${r.chain}:${r.address}`);
              return (
                <tr key={`${r.chain}:${r.address}:${r.poolAddress ?? ""}`} className="group border-b border-line/60 transition-colors hover:bg-surface/70">
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-2.5">
                      <TokenIcon image={r.image} symbol={r.symbol} />
                      <div className="min-w-0">
                        <Link
                          href={`/token/${r.chain}/${r.address}`}
                          onClick={() => setActiveChain(r.chain)}
                          className="block max-w-[160px] truncate font-medium text-fg hover:text-accent"
                        >
                          {r.symbol}
                        </Link>
                        <span className="flex items-center gap-1.5 text-2xs text-muted">
                          <span className="max-w-[110px] truncate">{r.name}</span>
                          <span className="chip shrink-0" title={CHAINS[r.chain].name}>{CHAINS[r.chain].shortName}</span>
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="tabular px-2.5 py-2 text-muted" title={
                    r.createdAt
                      ? r.creationSource === "launch" || r.creationSource === "token"
                        ? `Token created ${new Date(r.createdAt).toLocaleString()} (launchpad event)`
                        : `Pool created ${new Date(r.createdAt).toLocaleString()} (pool creation time)`
                      : "Creation time unavailable"
                  }>
                    {r.createdAt ? fmtAge(Date.now() - r.createdAt) : "—"}
                  </td>
                  <td className="tabular px-2.5 py-2 text-fg">{fmtPrice(r.priceUsd)}</td>
                  <td className={cn("tabular px-2.5 py-2", deltaColor(r.priceChange.h1))}>{fmtPct(r.priceChange.h1)}</td>
                  <td className={cn("tabular px-2.5 py-2", deltaColor(r.priceChange.h24))}>{fmtPct(r.priceChange.h24)}</td>
                  <td className="tabular px-2.5 py-2 text-right text-fg" title={r.bondingCurveMcSol != null ? `Bonding-curve market cap: ${r.bondingCurveMcSol.toFixed(1)} SOL (pre-AMM token — no USD pool yet)` : undefined}>
                    <CapLabel r={r} /> {fmtCompact(r.marketCapUsd ?? r.fdvUsd)}
                    {r.marketCapUsd === null && r.fdvUsd === null && r.bondingCurveMcSol != null && (
                      <span className="text-muted"> ({r.bondingCurveMcSol.toFixed(0)} SOL)</span>
                    )}
                  </td>
                  <td className="tabular px-2.5 py-2 text-right text-fg">{fmtCompact(r.liquidityUsd)}</td>
                  <td className="tabular px-2.5 py-2 text-right text-fg">{fmtCompact(r.volume24hUsd)}</td>
                  <td className="tabular px-2.5 py-2 text-right text-pos">{r.txns24h.buys !== null ? fmtNum(r.txns24h.buys) : "—"}</td>
                  <td className="tabular px-2.5 py-2 text-right text-neg">{r.txns24h.sells !== null ? fmtNum(r.txns24h.sells) : "—"}</td>
                  <td className="px-2.5 py-2">
                    <span className="chip max-w-[120px] truncate" title={r.venue ?? undefined}>{r.venue ?? "—"}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <WatchButton watched={watched} token={r} add={addToken} remove={removeToken} />
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && !loading && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-10 text-center">
                  <p className="text-sm text-muted">{emptyHint ?? "No tokens match the current filters."}</p>
                  <p className="mt-1 text-xs text-muted/70">Try widening the filters, or wait for the next data refresh.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > visible && (
        <div className="border-t border-line px-3 py-2 text-center">
          <button onClick={() => setVisible((v) => v + maxRows)} className="btn-ghost h-7 px-3 text-xs">
            Show more ({filtered.length - visible} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

function TokenIcon({ image, symbol }: { image: string | null; symbol: string }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        width={26}
        height={26}
        loading="lazy"
        className="h-[26px] w-[26px] shrink-0 rounded-full bg-surface object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  return (
    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-surface text-[9px] font-bold text-muted">
      {symbol.slice(0, 3).toUpperCase()}
    </span>
  );
}

function WatchButton(props: {
  watched: boolean;
  token: TokenSummary;
  add: (t: { chain: ChainId; address: string; symbol?: string }) => void;
  remove: (chain: ChainId, address: string) => void;
}) {
  const { watched, token, add, remove } = props;
  return (
    <button
      onClick={() =>
        watched ? remove(token.chain, token.address) : add({ chain: token.chain, address: token.address, symbol: token.symbol })
      }
      className={cn("focus-ring rounded p-1", watched ? "text-accent" : "text-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100")}
      aria-label={watched ? `Remove ${token.symbol} from watchlist` : `Add ${token.symbol} to watchlist`}
      title={watched ? "Remove from watchlist" : "Add to watchlist"}
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill={watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
        <path d="M10 3.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14.2l-4.2 2.3.8-4.7-3.4-3.3 4.7-.7L10 3.5z" />
      </svg>
    </button>
  );
}

const CHAIN_OPTIONS: (ChainId | "all")[] = ["all", ...TRADABLE_CHAINS];

export function FilterBar({ filters, onFilters }: { filters: TokenFilters; onFilters: (f: TokenFilters) => void }) {
  const set = (patch: Partial<TokenFilters>) => onFilters({ ...filters, ...patch });
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v) || null);
  const open = useState(true)[0];
  void open;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={filters.chain}
        onChange={(e) => set({ chain: e.target.value as ChainId | "all" })}
        className="input h-7 w-auto py-0 text-xs"
        aria-label="Filter by chain"
      >
        {CHAIN_OPTIONS.map((c) => (
          <option key={c} value={c}>{c === "all" ? "All chains" : CHAINS[c].name}</option>
        ))}
      </select>
      <select
        value={filters.maxAgeHours ?? ""}
        onChange={(e) => set({ maxAgeHours: e.target.value === "" ? null : Number(e.target.value) })}
        className="input h-7 w-auto py-0 text-xs"
        aria-label="Filter by pool age"
        title="Pool creation age — token deployment time is not available from the provider"
      >
        <option value="">Any age</option>
        <option value="1">≤ 1h old</option>
        <option value="6">≤ 6h old</option>
        <option value="24">≤ 24h old</option>
        <option value="168">≤ 7d old</option>
      </select>
      <input
        type="number"
        min={0}
        placeholder="Min $ liq"
        value={filters.minLiquidityUsd ?? ""}
        onChange={(e) => set({ minLiquidityUsd: numOrNull(e.target.value) })}
        className="input h-7 w-24 py-0 text-xs"
        aria-label="Minimum liquidity in USD"
      />
      <input
        type="number"
        min={0}
        placeholder="Min $ vol 24h"
        value={filters.minVolumeUsd ?? ""}
        onChange={(e) => set({ minVolumeUsd: numOrNull(e.target.value) })}
        className="input h-7 w-28 py-0 text-xs"
        aria-label="Minimum 24h volume in USD"
      />
      <input
        type="number"
        min={0}
        placeholder="Min $ MC"
        value={filters.minMcUsd ?? ""}
        onChange={(e) => set({ minMcUsd: numOrNull(e.target.value) })}
        className="input h-7 w-24 py-0 text-xs"
        aria-label="Minimum market cap in USD"
      />
      <input
        type="number"
        min={0}
        placeholder="Min buys 24h"
        value={filters.minBuys24 ?? ""}
        onChange={(e) => set({ minBuys24: numOrNull(e.target.value) })}
        className="input h-7 w-24 py-0 text-xs"
        aria-label="Minimum buys in the last 24 hours"
      />
      {filters.maxAgeHours !== null && (
        <label className="chip cursor-pointer select-none" title="Rows whose pool age is unknown are hidden unless disabled">
          <input
            type="checkbox"
            checked={filters.hideUntracked}
            onChange={(e) => set({ hideUntracked: e.target.checked })}
            className="h-3 w-3"
          />
          hide unknown-age
        </label>
      )}
    </div>
  );
}

export function shortChainName(id: ChainId): string {
  return CHAINS[id].shortName;
}

export function addrShort(a: string): string {
  return shortAddr(a);
}