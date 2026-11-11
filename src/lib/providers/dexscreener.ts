import { ProviderError, fetchJson } from "./fetchJson";
import { TtlCache } from "./fetchJson";
import type { ChainId } from "../chains";
import { CHAINS } from "../chains";
import type { TokenSummary } from "../types";

/**
 * DexScreener public API adapter (free, no key; ~300 req/min).
 * Docs: https://docs.dexscreener.com/api/reference
 * Endpoints verified against the v2 reference:
 *   GET /latest/dex/search?q=
 *   GET /tokens/v1/{chainId}/{addresses}   (comma-separated, max 30)
 */

const BASE = process.env.DEXSCREENER_BASE || "https://api.dexscreener.com";
const PROVIDER = "DexScreener";

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[];
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceNative: string;
  priceUsd?: string;
  txns: Record<string, { buys: number; sells: number } | undefined>;
  volume: Record<string, number | undefined>;
  priceChange: Record<string, number | undefined>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { url: string }[];
    socials?: { type: string; url: string }[];
  };
  boosted?: boolean;
}

interface SearchResponse {
  schemaVersion?: string;
  pairs: DexPair[] | null;
}

export async function dexSearch(query: string): Promise<DexPair[]> {
  const data = await fetchJson<SearchResponse>(`${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`, {
    provider: PROVIDER,
    retries: 1,
  });
  return data.pairs ?? [];
}

export async function dexTokens(chainIds: string[], addresses: string[]): Promise<DexPair[]> {
  if (addresses.length === 0) return [];
  const addrStr = addresses.slice(0, 30).join(",");
  const data = await fetchJson<DexPair[]>(`${BASE}/tokens/v1/${chainIds.join(",")}/${addrStr}`, {
    provider: PROVIDER,
    retries: 1,
  });
  return Array.isArray(data) ? data : [];
}

function num(v: number | string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Map a DexScreener pair into the app's TokenSummary model. */
export function dexPairToSummary(p: DexPair, fetchedAt: number): TokenSummary | null {
  const chain = Object.values(CHAINS).find((c) => c.dexscreenerChain === p.chainId);
  if (!chain) return null; // chain we do not support — never fabricate
  const tx24 = p.txns?.h24;
  return {
    chain: chain.id as ChainId,
    address: p.baseToken.address,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    image: p.info?.imageUrl ?? null,
    priceUsd: num(p.priceUsd),
    priceChange: {
      m5: num(p.priceChange?.m5) ?? null,
      h1: num(p.priceChange?.h1) ?? null,
      h6: num(p.priceChange?.h6) ?? null,
      h24: num(p.priceChange?.h24) ?? null,
    },
    marketCapUsd: num(p.marketCap),
    fdvUsd: num(p.fdv),
    liquidityUsd: num(p.liquidity?.usd),
    volume24hUsd: num(p.volume?.h24),
    txns24h: { buys: tx24?.buys ?? null, sells: tx24?.sells ?? null },
    traders24h: null, // DexScreener does not expose unique traders
    createdAt: p.pairCreatedAt ?? null,
    creationSource: p.pairCreatedAt ? "pool" : null,
    venue: p.labels?.length ? `${p.dexId} (${p.labels.join(", ")})` : p.dexId,
    poolAddress: p.pairAddress,
    dataSource: PROVIDER,
    fetchedAt,
  };
}

/** Map a GT-style pool to TokenSummary lives in geckoterminal.ts; shared helpers here. */
export function bestPairForToken(
  pairs: DexPair[],
  chainId: string,
  tokenAddress: string,
): DexPair | null {
  const candidates = pairs.filter(
    (p) =>
      p.chainId === chainId &&
      p.baseToken.address.toLowerCase() === tokenAddress.toLowerCase() &&
      (p.liquidity?.usd ?? 0) > 0,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return candidates[0];
}

const searchCache = new TtlCache<DexPair[]>(20_000);

export async function dexSearchCached(query: string): Promise<DexPair[]> {
  return searchCache.wrap(`search:${query.toLowerCase()}`, () => dexSearch(query));
}

export function assertDexScreenerBase(): string {
  if (!BASE) throw new ProviderError("base url missing", PROVIDER);
  return BASE;
}

/* --------------------------- live price polling --------------------------- */
/*
 * Verified against docs.dexscreener.com/api/reference (free public API):
 *  - GET /tokens/v1/{chainId}/{addresses} → 300 req/min, returns ALL pairs for
 *    the token including current priceUsd, liquidity, volume, txn counts,
 *    price-change windows, FDV/marketCap.
 *  - No websocket / trade stream on the free tier → live updates are periodic
 *    snapshots. SIGHT labels them as snapshots, never as trade ticks.
 */

/** One pair's live data, already restricted to fields the UI can render honestly. */
export interface DexPairSnapshot {
  poolAddress: string;
  dexId: string;
  labels: string[];
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  txns: {
    m5: { buys: number; sells: number } | null;
    h1: { buys: number; sells: number } | null;
    h24: { buys: number; sells: number } | null;
  };
  fdvUsd: number | null;
  marketCapUsd: number | null;
}

export interface DexTokenSnapshot {
  chainId: string;
  tokenAddress: string;
  pairs: DexPairSnapshot[];
  fetchedAt: number;
}

/**
 * Fetch a fresh (bypass-cache) snapshot for one token across one chain.
 * A short shared TTL lets multiple SSE subscribers of the same token reuse a
 * single upstream request per poll interval.
 */
const snapshotCache = new TtlCache<DexTokenSnapshot>(1_500, 200);

export async function dexTokenSnapshot(
  dexChainId: string,
  tokenAddress: string,
): Promise<DexTokenSnapshot> {
  const key = `${dexChainId}:${tokenAddress.toLowerCase()}`;
  return snapshotCache.wrap(key, async () => {
    const data = await fetchJson<DexPair[]>(
      `${BASE}/tokens/v1/${dexChainId}/${encodeURIComponent(tokenAddress)}`,
      { provider: PROVIDER, retries: 1, timeoutMs: 8_000 },
    );
    const rows = Array.isArray(data) ? data : [];
    const pairs = rows
      .filter((p) => p.chainId === dexChainId)
      .map<DexPairSnapshot>((p) => {
        const w = (k: string) => {
          const t = p.txns?.[k];
          return t ? { buys: t.buys ?? 0, sells: t.sells ?? 0 } : null;
        };
        return {
          poolAddress: p.pairAddress,
          dexId: p.dexId,
          labels: p.labels ?? [],
          priceUsd: num(p.priceUsd),
          liquidityUsd: num(p.liquidity?.usd),
          volume24hUsd: num(p.volume?.h24),
          priceChange: {
            m5: num(p.priceChange?.m5),
            h1: num(p.priceChange?.h1),
            h6: num(p.priceChange?.h6),
            h24: num(p.priceChange?.h24),
          },
          txns: { m5: w("m5"), h1: w("h1"), h24: w("h24") },
          fdvUsd: num(p.fdv),
          marketCapUsd: num(p.marketCap),
        };
      });
    return { chainId: dexChainId, tokenAddress: tokenAddress.toLowerCase(), pairs, fetchedAt: Date.now() };
  });
}