import { dexTokens, type DexPair } from "../providers/dexscreener";
import type { AdapterHealth, DiscoveryPool } from "./model";

/**
 * DexScreener enrichment adapter (Solana new-pool pipeline).
 *
 * PumpPortal migration events carry no USD market data (reserves are in SOL,
 * price/liquidity/volume are null — never fabricated). GeckoTerminal's
 * new-pools poller fills this in later, but can lag by minutes. This adapter
 * closes the gap: it queries DexScreener's keyless public API
 * (GET /tokens/v1/{chainId}/{addresses}, ≤30 addresses per request) shortly
 * after a new pool appears and pushes a normalized pool update into the hub.
 *
 * Rate limiting + caching:
 *   - Batch loop fires at most one request per BATCH_INTERVAL_MS (30 req/min
 *     budget, well under DexScreener's 300 req/min limit for this endpoint).
 *   - Batch size ≤30 addresses (DexScreener maximum per request).
 *   - TTL cache: a token enriched within CACHE_TTL_MS is not re-queried.
 *   - Retries with backoff: a brand-new pool may not be indexed yet — attempts
 *     at +15s/+45s/+120s, then the address is dropped (no unbounded queue).
 *   - Bounded queue (cap QCAP): oldest entries dropped when full.
 *
 * No API key is required for this endpoint (docs.dexscreener.com: public
 * pairs endpoint, 300 req/min). No fabricated data: every field comes from
 * the API response; missing fields stay null.
 */

const DEFAULT_BATCH_INTERVAL_MS = 2_000; // max ~30 requests/min
const DEFAULT_BATCH_SIZE = 30; // DexScreener max addresses per request
const DEFAULT_CACHE_TTL_MS = 120_000;
const DEFAULT_RETRY_DELAYS_MS = [15_000, 45_000, 120_000];
const QCAP = 400;
const DEX_CHAIN = "solana";

export interface DexEnricherOptions {
  /** Minimum spacing between upstream batch requests (rate limiting). */
  batchIntervalMs?: number;
  /** Backoff delays between not-yet-indexed retries (attempts beyond this are dropped). */
  retryDelaysMs?: number[];
  /** Do not re-query a token enriched within this window. */
  cacheTtlMs?: number;
  /** Max addresses per request (DexScreener limit is 30). */
  batchSize?: number;
}


export interface DexEnricherEvents {
  /** Hub upserts the normalized pool update (merge semantics keep earliest data). */
  onPoolUpdate: (pool: DiscoveryPool) => void;
  onStatus: (status: "connecting" | "live" | "degraded" | "down" | "disabled", lastError: string | null) => void;
}

/** Injection point for tests — signature mirrors the DexScreener provider. */
export type DexFetcher = (chainIds: string[], addresses: string[]) => Promise<DexPair[]>;

export function numOrNull(v: number | string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "string" ? (v.trim() === "" ? NaN : Number(v)) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure mapper — DexScreener pair → DiscoveryPool-shaped update. Unit-testable
 * against real API response shapes. Identity is the DexScreener pair address;
 * when it equals the pool address already registered by another source
 * (PumpPortal migration), the hub merge path unifies them.
 */
export function mapDexPairToPool(pair: DexPair, now = Date.now()): DiscoveryPool | null {
  if (typeof pair.pairAddress !== "string" || pair.pairAddress.length === 0) return null;
  if (typeof pair.baseToken?.address !== "string" || pair.baseToken.address.length === 0) return null;
  const liquidityUsd = numOrNull(pair.liquidity?.usd);
  const tx5 = pair.txns?.m5;
  const createdAt = typeof pair.pairCreatedAt === "number" ? pair.pairCreatedAt : null;
  return {
    id: `solana:${pair.pairAddress.toLowerCase()}`,
    chain: "solana",
    poolAddress: pair.pairAddress,
    dexName: typeof pair.dexId === "string" && pair.dexId ? pair.dexId : null,
    launchpadName: null, // DexScreener does not report launchpad identity — never fabricate
    baseTokenAddress: pair.baseToken.address,
    baseTokenSymbol: typeof pair.baseToken.symbol === "string" ? pair.baseToken.symbol : null,
    baseTokenName: typeof pair.baseToken.name === "string" ? pair.baseToken.name : null,
    quoteTokenAddress: typeof pair.quoteToken?.address === "string" ? pair.quoteToken.address : null,
    createdAt,
    firstSeenTimestamp: now,
    liquidityUsd,
    priceUsd: numOrNull(pair.priceUsd),
    volume5mUsd: numOrNull(pair.volume?.m5),
    volume1hUsd: numOrNull(pair.volume?.h1),
    volume6hUsd: numOrNull(pair.volume?.h6),
    volume24hUsd: numOrNull(pair.volume?.h24),
    transactions5m: tx5 ? (tx5.buys ?? 0) + (tx5.sells ?? 0) : null,
    buys5m: tx5 ? tx5.buys : null,
    sells5m: tx5 ? tx5.sells : null,
    marketCapUsd: numOrNull(pair.marketCap),
    fullyDilutedValuationUsd: numOrNull(pair.fdv),
    poolStatus: liquidityUsd === null ? "unknown" : liquidityUsd > 0 ? "active" : "empty",

    sources: ["DexScreener"],
    tokenImage: typeof pair.info?.imageUrl === "string" && pair.info.imageUrl ? pair.info.imageUrl : null,
    lastUpdatedAt: now,
  };
}

interface QueuedAddress {
  address: string;
  attempts: number;
  nextAttemptAt: number;
}


export function createDexEnricher(
  events: DexEnricherEvents,
  fetcher: DexFetcher = dexTokens,
  options: DexEnricherOptions = {},
) {
  const BATCH_INTERVAL_MS = options.batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS;
  const BATCH_SIZE = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const CACHE_TTL_MS = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const RETRY_DELAYS_MS = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const queue = new Map<string, QueuedAddress>(); // key = lowercase address
  const cache = new Map<string, number>(); // lowercase address → last enriched at
  let stopped = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRefreshAt: number | null = null;
  let lastError: string | null = null;
  let requests = 0;
  let applied = 0;
  let dropped = 0;
  let status: AdapterHealth["status"] = "disabled";

  function enqueue(address: string) {
    const key = address.toLowerCase();
    if (!key) return;
    const cachedAt = cache.get(key);
    if (cachedAt !== undefined && Date.now() - cachedAt < CACHE_TTL_MS) return; // recently enriched
    if (queue.has(key)) return; // already queued — dedup
    if (queue.size >= QCAP) {
      const oldest = queue.keys().next().value;
      if (oldest !== undefined) {
        queue.delete(oldest);
        dropped += 1;
      }
    }
    queue.set(key, { address, attempts: 0, nextAttemptAt: Date.now() });
    schedule(BATCH_INTERVAL_MS); // pace through the batch loop — no request bursts
  }

  function schedule(extraMs = BATCH_INTERVAL_MS) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void processBatch(), extraMs);
  }

  async function processBatch() {
    if (stopped) return;
    const now = Date.now();
    const ready: QueuedAddress[] = [];
    for (const entry of queue.values()) {
      if (entry.nextAttemptAt <= now) {
        ready.push(entry);
        if (ready.length >= BATCH_SIZE) break;
      }
    }
    if (ready.length === 0) {
      // Nothing due yet — wake when the earliest retry is due (or idle).
      let earliestMs: number | null = null;
      for (const entry of queue.values()) {
        const wait = entry.nextAttemptAt - now;
        if (earliestMs === null || wait < earliestMs) earliestMs = wait;
      }
      if (earliestMs !== null) schedule(Math.max(earliestMs, BATCH_INTERVAL_MS));
      return;
    }
    try {
      const pairs = await fetcher([DEX_CHAIN], ready.map((r) => r.address));
      requests += 1;
      lastRefreshAt = Date.now();
      lastError = null;
      const byBase = new Map<string, DexPair>();
      for (const p of pairs) {
        const base = typeof p.baseToken?.address === "string" ? p.baseToken.address.toLowerCase() : null;
        if (!base) continue;
        const current = byBase.get(base);
        // Keep the highest-liquidity pair per token as the primary market.
        const liq = numOrNull(p.liquidity?.usd) ?? 0;
        const curLiq = current ? (numOrNull(current.liquidity?.usd) ?? 0) : -1;
        if (liq > curLiq) byBase.set(base, p);
      }
      for (const entry of ready) {
        const key = entry.address.toLowerCase();
        const pair = byBase.get(key);
        if (pair) {
          const pool = mapDexPairToPool(pair);
          if (pool) {
            applied += 1;
            events.onPoolUpdate(pool);
          }
          cache.set(key, Date.now());
          queue.delete(key);
        } else {
          // Not indexed yet — retry with backoff, drop after the last attempt.
          entry.attempts += 1;
          if (entry.attempts > RETRY_DELAYS_MS.length) {
            queue.delete(key);
            dropped += 1;
          } else {
            entry.nextAttemptAt = Date.now() + RETRY_DELAYS_MS[entry.attempts - 1];
          }
        }
      }
      status = "live";
      events.onStatus("live", null);
    } catch (e) {
      // Rate limit / upstream failure: back off the whole batch and retry.
      lastError = String((e as Error).message ?? e).slice(0, 160);
      status = "degraded";
      events.onStatus("degraded", lastError);
      for (const entry of ready) {
        entry.nextAttemptAt = Date.now() + BATCH_INTERVAL_MS * 4;
      }
    } finally {
      schedule(queue.size > 0 ? BATCH_INTERVAL_MS : 5_000);
    }
  }

  return {
    id: "dexscreener-enricher",
    label: "DexScreener enrichment · Solana new pools",
    enqueue,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      status = "disabled";
      events.onStatus("disabled", null);
    },
    start() {
      if (!stopped) return;
      stopped = false;
      status = "connecting";
      events.onStatus("connecting", null);
      schedule(BATCH_INTERVAL_MS);
    },
    health(): AdapterHealth {
      return {
        id: "dexscreener-enricher",
        label: "DexScreener enrichment · Solana new pools",
        chain: "solana",
        status,
        lastEventAt: lastRefreshAt,
        lastRefreshAt,
        limits:
          "Keyless batch enrichment (≤30 tokens/request, ≤30 req/min). New pools may take ~1-2 min to be indexed; retried with backoff, dropped after 3 attempts.",
        lastError,
        reconnects: requests, // retry/backoff cycles
        eventsObserved: applied,
      };
    },
    /** Test/ops introspection. */
    stats() {
      return {
        queued: queue.size,
        cached: cache.size,
        requests,
        applied,
        dropped,
        status,
      };
    },
  };
}

export type DexEnricher = ReturnType<typeof createDexEnricher>;


