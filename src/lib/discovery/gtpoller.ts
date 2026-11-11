import type { ChainId } from "../chains";
import { gtNewPoolsRaw, type GtPool, type GtResponse } from "../providers/geckoterminal";
import type { AdapterHealth, DiscoveryPool } from "./model";

/**
 * GeckoTerminal new-pools poller — one server-side poller per network feeds
 * every connected client (shared upstream connection; never one upstream per
 * visitor). The existing /api/discover page requests share the same 45s TTL
 * cache window, so the poller and page requests never double-bill the
 * free-tier budget (~30 req/min).
 *
 * Detection model: each poll returns the newest pools; the adapter diffs pool
 * addresses against the previous poll. First poll seeds the baseline (no
 * "new" events — the store gets the newest pools as snapshot data); later
 * polls emit genuinely new pool events, plus refresh events for pools created
 * within the last 24h so liquidity/price stay fresh in the live feed.
 */

function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function prettyDex(dexId: string | undefined): string | null {
  if (!dexId) return null;
  const map: Record<string, string> = {
    pancake_v3: "PancakeSwap V3",
    pancake_v2: "PancakeSwap V2",
    uniswap_v3: "Uniswap V3",
    uniswap_v2: "Uniswap V2",
    uniswap_v4: "Uniswap V4",
    raydium: "Raydium",
    raydium_clmm: "Raydium CLMM",
    raydium_launchlab: "Raydium LaunchLab",
    pumpswap: "PumpSwap",
    "pump-fun": "Pump.fun AMM",
    "pumpfun-amm": "Pump.fun AMM",
    fourmeme: "Four.meme",
    "four-meme": "Four.meme",
  };
  return map[dexId] ?? dexId;
}

/** Map a raw GeckoTerminal pool into a DiscoveryPool record. */
export function gtPoolToDiscovery(
  network: string,
  chainId: ChainId,
  pool: GtPool,
  tokenById: Map<string, { address: string; name: string | null; symbol: string | null; image_url?: string | null }>,
  now = Date.now(),
): DiscoveryPool | null {
  if (!pool.attributes || !pool.relationships) return null;
  const poolAddress = pool.attributes.address;
  if (!poolAddress) return null;
  const relPrefix = `${network}_`;
  const baseRel = pool.relationships.base_token?.data?.id;
  const baseAttrs = baseRel ? tokenById.get(baseRel) : undefined;
  const baseFallback = baseRel?.startsWith(relPrefix) ? baseRel.slice(relPrefix.length) : null;
  const baseTokenAddress = baseAttrs?.address ?? baseFallback;
  if (!baseTokenAddress) return null;
  const nameParts = pool.attributes.name?.split(" / ") ?? [];
  const txns = pool.attributes.transactions;
  const createdAt = pool.attributes.pool_created_at ? Date.parse(pool.attributes.pool_created_at) : null;
  const liquidityUsd = numOrNull(pool.attributes.reserve_in_usd);
  return {
    id: `${chainId}:${poolAddress.toLowerCase()}`,
    chain: chainId,
    poolAddress,
    dexName: prettyDex(pool.attributes.dex_id ?? pool.relationships.dex?.data?.id),
    launchpadName: null,
    baseTokenAddress,
    baseTokenSymbol: baseAttrs?.symbol ?? nameParts[0] ?? null,
    baseTokenName: baseAttrs?.name ?? nameParts[0] ?? null,
    quoteTokenAddress: null,
    createdAt,
    firstSeenTimestamp: now,
    liquidityUsd,
    priceUsd: numOrNull(pool.attributes.base_token_price_usd),
    volume5mUsd: numOrNull(pool.attributes.volume_usd?.m5),
    volume1hUsd: numOrNull(pool.attributes.volume_usd?.h1),
    volume6hUsd: numOrNull(pool.attributes.volume_usd?.h6),
    volume24hUsd: numOrNull(pool.attributes.volume_usd?.h24 ?? pool.attributes.h24_volume_usd),
    transactions5m: txns?.m5 ? (txns.m5.buys ?? 0) + (txns.m5.sells ?? 0) : null,
    buys5m: txns?.m5?.buys ?? null,
    sells5m: txns?.m5?.sells ?? null,
    marketCapUsd: numOrNull(pool.attributes.market_cap_usd),
    fullyDilutedValuationUsd: numOrNull(pool.attributes.fdv_usd),
    poolStatus: liquidityUsd !== null && liquidityUsd > 0 ? "active" : "unknown",
    sources: ["GeckoTerminal"],
    tokenImage: baseAttrs?.image_url ?? null,
    lastUpdatedAt: now,
  };
}

export interface GtPollerEvents {
  onPoolEvent: (pool: DiscoveryPool, isNew: boolean) => void;
  onStatus: (status: "connecting" | "live" | "down" | "disabled", lastError: string | null) => void;
}

const POLL_MS = 45_000;
const REFRESH_WINDOW_MS = 24 * 60 * 60_000;
const SEEN_CAP = 3_000;

/**
 * Per-network poller. Diffing state: pool addresses seen in previous polls.
 * `isNew` marks genuinely new pools; refresh events (isNew=false) keep recent
 * pools' market data fresh without flooding the stream. The first poll is a
 * silent baseline — its pools seed the store as snapshot data.
 */
export function createGtPollerAdapter(network: string, chainId: ChainId, events: GtPollerEvents) {
  const seen = new Map<string, number>(); // pool address -> firstSeenAt
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let pollCount = 0;
  let lastRefreshAt: number | null = null;
  let lastError: string | null = null;
  let eventsObserved = 0;

  async function poll() {
    if (stopped) return;
    const now = Date.now();
    try {
      const res: GtResponse = await gtNewPoolsRaw(network, 1, now);
      const pools = Array.isArray(res.data) ? res.data : [res.data];
      const tokenById = new Map<string, { address: string; name: string | null; symbol: string | null; image_url?: string | null }>();
      for (const inc of res.included ?? []) {
        if (inc.type === "token") tokenById.set(inc.id, inc.attributes);
      }
      const first = pollCount === 0;
      for (const p of pools) {
        const rec = gtPoolToDiscovery(network, chainId, p, tokenById, now);
        if (!rec) continue;
        const addr = rec.poolAddress.toLowerCase();
        const existing = seen.get(addr);
        if (existing === undefined) {
          seen.set(addr, now);
          if (seen.size > SEEN_CAP) {
            const oldest = seen.keys().next().value;
            if (oldest !== undefined) seen.delete(oldest);
          }
          eventsObserved += 1;
          events.onPoolEvent(rec, !first);
        } else if (!first && rec.createdAt !== null && now - rec.createdAt < REFRESH_WINDOW_MS) {
          rec.firstSeenTimestamp = existing;
          events.onPoolEvent(rec, false); // refresh of a recent pool
        }
      }
      lastRefreshAt = now;
      lastError = null;
      pollCount += 1;
      events.onStatus("live", null);
    } catch (e) {
      lastError = String((e as Error).message ?? e).slice(0, 160);
      events.onStatus("down", lastError);
    } finally {
      if (!stopped) timer = setTimeout(() => void poll(), POLL_MS);
    }
  }

  return {
    id: `gt-newpools-${network}`,
    label: `GeckoTerminal new pools · ${chainId}`,
    chain: chainId,
    limits: `Polls new pools every ${POLL_MS / 1000}s (free API ~30 req/min, shared cache). No push feed — new pools appear within one poll cycle.`,
    start() {
      if (!stopped) return;
      stopped = false;
      events.onStatus("connecting", null);
      void poll();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      events.onStatus("disabled", null);
    },
    health(): AdapterHealth {
      return {
        id: `gt-newpools-${network}`,
        label: `GeckoTerminal new pools · ${chainId}`,
        chain: chainId,
        status: (lastRefreshAt !== null ? "live" : stopped ? "disabled" : "connecting") as AdapterHealth["status"],
        lastEventAt: lastRefreshAt,
        lastRefreshAt,
        limits: `Polls new pools every ${POLL_MS / 1000}s (free API ~30 req/min, shared cache). No push feed — new pools appear within one poll cycle.`,
        lastError,
        reconnects: 0,
        eventsObserved,
      };
    },
  };
}

export type GtPollerAdapter = ReturnType<typeof createGtPollerAdapter>;


