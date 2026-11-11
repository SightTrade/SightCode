import { fetchJson, TtlCache } from "./fetchJson";
import type { ChainId } from "../chains";
import { CHAINS } from "../chains";
import type { TokenSummary } from "../types";

/**
 * GeckoTerminal DEX API adapter (free, no key; ~30 req/min — cached aggressively).
 * Docs: https://www.geckoterminal.com/dex-api — base: https://api.geckoterminal.com/api/v2
 * Endpoints used:
 *   GET /networks/{network}/new_pools?page=
 *   GET /networks/{network}/trending_pools?page=
 *   GET /networks/{network}/pools/{pool_address}
 *   GET /networks/{network}/pools/{pool_address}/ohlcv/{timeframe}?aggregate=&limit=&currency=usd
 *   GET /networks/{network}/tokens/{address}
 *   GET /networks/{network}/tokens/{address}/info
 */

const BASE = process.env.GECKOTERMINAL_BASE || "https://api.geckoterminal.com";
const API = `${BASE}/api/v2`;
const PROVIDER = "GeckoTerminal";

export interface GtTokenAttrs {
  address: string;
  name: string | null;
  symbol: string | null;
  image_url?: string | null;
  coingecko_coin_id?: string | null;
}

export interface GtPoolAttrs {
  address: string;
  name: string;
  dex_id?: string;
  base_token_price_usd?: string;
  reserve_in_usd?: string;
  fdv_usd?: string | null;
  market_cap_usd?: string | null;
  pool_created_at?: string | null;
  h24_volume_usd?: string;
  h24_tx_count?: number;
  h24_buy_count?: number;
  h24_sell_count?: number;
  price_change_percentage?: { m5?: string; h1?: string; h6?: string; h24?: string };
  transactions?: Record<string, { buys?: number; sells?: number; buyers?: number; sellers?: number } | undefined>;
  volume_usd?: Record<string, string | undefined>;
}

export interface GtPool {
  id: string; // e.g. "eth_0x..."
  type: "pool";
  attributes: GtPoolAttrs;
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
    dex: { data: { id: string } };
  };
}

export interface GtResponse {
  data: GtPool[] | GtPool;
  included?: { id: string; type: string; attributes: GtTokenAttrs & Record<string, unknown> }[];
}

export interface GtTokenResponse {
  data: { id: string; attributes: GtTokenAttrs & { price_usd?: string; total_reserve_in_usd?: string } };
  included?: GtPool[];
}

const poolCache = new TtlCache<TokenSummary[]>(45_000);

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pctOrNull(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function prettyDex(dexId: string | undefined): string {
  if (!dexId) return "DEX";
  const map: Record<string, string> = {
    pancake_v3: "PancakeSwap V3",
    pancake_v2: "PancakeSwap V2",
    uniswap_v3: "Uniswap V3",
    uniswap_v2: "Uniswap V2",
    uniswap_v4: "Uniswap V4",
    raydium: "Raydium",
    raydium_clmm: "Raydium CLMM",
    raydium_cpmm: "Raydium CPMM",
    raydium_launchlab: "Raydium LaunchLab",
    pumpswap: "PumpSwap (Pump.fun AMM)",
    "pump-fun": "Pump.fun AMM",
    "pumpfun-amm": "Pump.fun AMM",
    "pump-fun-amm": "Pump.fun AMM",
    fourmeme: "Four.meme",
    "four-meme": "Four.meme",
    meteora_dlmm: "Meteora DLMM",
    meteora_pamm: "Meteora",
    orca_whirlpool: "Orca",
    aerodrome_slipstream: "Aerodrome Slipstream",
    aerodrome: "Aerodrome",
  };
  return map[dexId] ?? dexId.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function parsePools(res: GtResponse, fetchedAt: number): TokenSummary[] {
  const included = res.included ?? [];
  const tokenById = new Map<string, GtTokenAttrs>();
  for (const inc of included) {
    if (inc.type === "token") tokenById.set(inc.id, inc.attributes);
  }
  const pools = Array.isArray(res.data) ? res.data : [res.data];
  const out: TokenSummary[] = [];
  for (const pool of pools) {
    if (!pool.attributes || !pool.relationships) continue;
    const baseRel = pool.relationships.base_token?.data?.id;
    const baseAttrs = tokenById.get(baseRel);
    const chain = Object.values(CHAINS).find(
      (c) => c.geckoNetwork && pool.id.startsWith(`${c.geckoNetwork}_`),
    );
    if (!chain || !baseRel) continue; // unknown network — skip, never fabricate
    // Fallback: relationship ids encode "<network>_<address>"; when GT omits
    // `included` (possible on some responses), derive the address and pool name.
    const relPrefix = `${chain.geckoNetwork}_`;
    const fallbackAddress = baseRel.startsWith(relPrefix) ? baseRel.slice(relPrefix.length) : null;
    const poolNameParts = pool.attributes.name?.split(" / ") ?? [];
    const fbSymbol = poolNameParts[0];
    const fbName = poolNameParts[0];
    if (!baseAttrs && !fallbackAddress) continue;
    const address = baseAttrs?.address ?? fallbackAddress!;
    const symbol = baseAttrs?.symbol ?? fbSymbol ?? "—";
    const name = baseAttrs?.name ?? fbName ?? symbol;
    const txn24 = pool.attributes.transactions?.h24 ?? pool.attributes.transactions?.m24;
    out.push({
      chain: chain.id as ChainId,
      address,
      symbol,
      name,
      image: baseAttrs?.image_url ?? null,
      priceUsd: numOrNull(pool.attributes.base_token_price_usd),
      priceChange: {
        m5: pctOrNull(pool.attributes.price_change_percentage?.m5),
        h1: pctOrNull(pool.attributes.price_change_percentage?.h1),
        h6: pctOrNull(pool.attributes.price_change_percentage?.h6),
        h24: pctOrNull(pool.attributes.price_change_percentage?.h24),
      },
      marketCapUsd: numOrNull(pool.attributes.market_cap_usd),
      fdvUsd: numOrNull(pool.attributes.fdv_usd),
      liquidityUsd: numOrNull(pool.attributes.reserve_in_usd),
      volume24hUsd: numOrNull(pool.attributes.h24_volume_usd ?? pool.attributes.volume_usd?.h24),
      txns24h: { buys: txn24?.buys ?? null, sells: txn24?.sells ?? null },
      traders24h: txn24?.buyers ?? null,
      createdAt: pool.attributes.pool_created_at ? Date.parse(pool.attributes.pool_created_at) : null,
      creationSource: pool.attributes.pool_created_at ? "pool" : null,
      venue: prettyDex(pool.attributes.dex_id ?? pool.relationships.dex?.data?.id),
      poolAddress: pool.attributes.address,
      dataSource: PROVIDER,
      fetchedAt,
    });
  }
  return out;
}

export async function gtPools(
  network: string,
  kind: "new_pools" | "trending_pools",
  page: number,
  fetchedAt: number,
): Promise<TokenSummary[]> {
  return poolCache.wrap(`${kind}:${network}:${page}`, async () => {
    // include=... is required — without it GT omits the token objects from `included`.
    const res = await fetchJson<GtResponse>(
      `${API}/networks/${network}/${kind}?page=${page}&include=base_token,quote_token,dex`,
      { provider: PROVIDER, retries: 1 },
    );
    return parsePools(res, fetchedAt);
  });
}

const rawPoolCache = new TtlCache<GtResponse>(45_000);

/**
 * Raw (unflattened) new-pools fetch for the real-time discovery poller.
 * Shares the same 45s TTL cache window as gtPools so a page request and the
 * poller never double-bill the GeckoTerminal rate budget.
 */
export async function gtNewPoolsRaw(network: string, page = 1, fetchedAt = Date.now()): Promise<GtResponse> {
  return rawPoolCache.wrap(`new:${network}:${page}`, async () => {
    const res = await fetchJson<GtResponse>(
      `${API}/networks/${network}/new_pools?page=${page}&include=base_token,quote_token,dex`,
      { provider: PROVIDER, retries: 1 },
    );
    return res;
  });
}

export async function gtPoolDetail(
  network: string,
  poolAddress: string,
  fetchedAt: number,
): Promise<TokenSummary | null> {
  const res = await fetchJson<GtResponse>(
    `${API}/networks/${network}/pools/${poolAddress}?include=base_token,quote_token,dex`,
    { provider: PROVIDER, retries: 1 },
  );
  const parsed = parsePools(res, fetchedAt);
  return parsed[0] ?? null;
}

export async function gtToken(network: string, tokenAddress: string): Promise<GtTokenResponse | null> {
  try {
    return await fetchJson<GtTokenResponse>(`${API}/networks/${network}/tokens/${tokenAddress}`, {
      provider: PROVIDER,
      retries: 1,
    });
  } catch {
    return null; // token may not be listed on GeckoTerminal yet
  }
}

export interface GtTokenInfo {
  description: string | null;
  twitter: string | null;
  websites: string[] | null;
  telegram: string | null;
  discord: string | null;
  gtScore: number | null;
}

export async function gtTokenInfo(network: string, tokenAddress: string): Promise<GtTokenInfo | null> {
  try {
    const res = await fetchJson<{ data: { attributes: Record<string, unknown> } }>(
      `${API}/networks/${network}/tokens/${tokenAddress}/info`,
      { provider: PROVIDER, retries: 0 },
    );
    const a = res.data?.attributes ?? {};
    return {
      description: typeof a.description === "string" ? a.description : null,
      twitter: typeof a.twitter_handle === "string" ? a.twitter_handle : null,
      websites: Array.isArray(a.websites) ? (a.websites as string[]) : null,
      telegram: typeof a.telegram_handle === "string" ? a.telegram_handle : null,
      discord: typeof a.discord_handle === "string" ? a.discord_handle : null,
      gtScore: typeof a.gt_score === "number" ? a.gt_score : null,
    };
  } catch {
    return null;
  }
}

/** OHLCV candles. GeckoTerminal timeframes: minute (aggregate 1/5/15), hour (1/4), day (1). */
export async function gtOhlcv(
  network: string,
  poolAddress: string,
  timeframe: "minute" | "hour" | "day",
  aggregate: 1 | 5 | 15 | 4,
  limit: number,
): Promise<{ candles: { t: number; o: number; h: number; l: number; c: number; v: number }[]; source: string }> {
  const url =
    `${API}/networks/${network}/pools/${poolAddress}/ohlcv/${timeframe}` +
    `?aggregate=${aggregate}&limit=${Math.min(limit, 1000)}&currency=usd&token=base`;
  // Verified response shape: { data: { attributes: { ohlcv_list: [t,o,h,l,c,v][] } } }
  const res = await fetchJson<{ data?: { attributes?: { ohlcv_list?: (string | number)[][] } } }>(url, {
    provider: PROVIDER,
    retries: 1,
  });
  const rows = res.data?.attributes?.ohlcv_list ?? [];
  const candles = rows.map((row) => ({
    t: Number(row[0]),
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[5]),
  }));
  return { candles, source: PROVIDER };
}

const tokenPoolsCache = new TtlCache<GtPool[]>(45_000);

/**
 * Pools for a specific token — GET /networks/{network}/tokens/{address}/pools.
 * Used by the token detail route to resolve a poolAddress when DexScreener has
 * not indexed the token yet (brand-new discovery tokens). Shares the 45s TTL
 * cache window with the other GT endpoints to respect the shared rate budget.
 */
export async function gtTokenPools(network: string, tokenAddress: string): Promise<GtPool[]> {
  const key = `${network}:${tokenAddress.toLowerCase()}`;
  return tokenPoolsCache.wrap(key, async () => {
    try {
      const res = await fetchJson<GtResponse>(
        `${API}/networks/${network}/tokens/${encodeURIComponent(tokenAddress)}/pools?include=base_token,quote_token,dex`,
        { provider: PROVIDER, retries: 1 },
      );
      const data = res.data;
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  });
}
