import { CHAINS, type ChainConfig, type ChainId } from "../chains";
import { createDexEnricher, type DexEnricher } from "./dexEnricher";
import { createGtPollerAdapter, type GtPollerAdapter } from "./gtpoller";
import type { AdapterHealth, DiscoveryEvent, DiscoveryPool, DiscoveryToken } from "./model";
import { createPumpPortalAdapter, type PumpPortalAdapter } from "./pumpportal";


/**
 * Server-side real-time discovery hub (singleton per Next.js server process).
 *
 * - Owns the adapter lifecycle: PumpPortal WebSocket (Solana token creations +
 *   migrations) and one GeckoTerminal new-pools poller per configured network.
 * - Normalizes + deduplicates events, keeps bounded in-memory stores
 *   (single-user terminal — no external database needed).
 * - Ref-counted: adapters start on the first SSE subscriber and stop ~30s
 *   after the last disconnects. One upstream connection per provider is shared
 *   across every visitor — polling never multiplies with browser sessions.
 * - Async metadata enrichment (Pump.fun metadata URI -> image URL) via a
 *   bounded queue; results are pushed as token updates.
 */

const TOKEN_CAP = 800;
const POOL_CAP = 800;
const IDLE_STOP_MS = 30_000;
const HEALTH_BROADCAST_MS = 15_000;

const tokens = new Map<string, DiscoveryToken>();
const pools = new Map<string, DiscoveryPool>();
const subscribers = new Set<(event: string) => void>();

let pumpAdapter: PumpPortalAdapter | null = null;
let dexEnricher: DexEnricher | null = null;
let gtAdapters: GtPollerAdapter[] = [];

let running = false;
let refCount = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let healthTimer: ReturnType<typeof setTimeout> | null = null;
let pumpLastError: string | null = null;

function evictOldest(map: Map<string, DiscoveryToken | DiscoveryPool>, cap: number) {
  while (map.size > cap) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of map) {
      if (v.firstSeenTimestamp < oldestTs) {
        oldestTs = v.firstSeenTimestamp;
        oldestKey = k;
      }
    }
    if (oldestKey === null) break;
    map.delete(oldestKey);
  }
}

function broadcast(event: DiscoveryEvent) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const send of subscribers) {
    try {
      send(payload);
    } catch {
      subscribers.delete(send);
    }
  }
}

/** A token with an observed pool is "graduated" — link pool -> token. */
function linkPoolToToken(pool: DiscoveryPool) {
  const tokenId = `${pool.chain}:${pool.baseTokenAddress.toLowerCase()}`;
  const token = tokens.get(tokenId);
  if (token && token.graduatedAt === null) {
    token.graduatedAt = Date.now();
    token.graduatedPoolAddress = pool.poolAddress;
    token.poolStatus = "present";
    token.lastUpdatedAt = Date.now();
    broadcast({ type: "token", token });
  }
}

function upsertToken(token: DiscoveryToken, isNew: boolean) {
  const existing = tokens.get(token.id);
  if (existing) {
    // Dedupe: keep the earliest firstSeen; refresh mutable fields.
    existing.lastUpdatedAt = token.lastUpdatedAt;
    if (token.graduatedAt !== null && existing.graduatedAt === null) {
      existing.graduatedAt = token.graduatedAt;
      existing.graduatedPoolAddress = token.graduatedPoolAddress;
      existing.poolStatus = "present";
    }
    if (token.tokenImage !== null) existing.tokenImage = token.tokenImage;
    if (existing.metadataStatus === "pending" && token.metadataStatus === "loaded") {
      existing.metadataStatus = "loaded";
    }
    broadcast({ type: "token", token: existing });
    return;
  }
  tokens.set(token.id, token);
  evictOldest(tokens, TOKEN_CAP);
  if (isNew) broadcast({ type: "token", token });
}

function upsertPool(pool: DiscoveryPool, isNew: boolean) {
  const existing = pools.get(pool.id);
  if (existing) {
    // Merge: keep earliest firstSeen + creation time; take the freshest data.
    const merged: DiscoveryPool = {
      ...existing,
      liquidityUsd: pool.liquidityUsd ?? existing.liquidityUsd,
      priceUsd: pool.priceUsd ?? existing.priceUsd,
      volume5mUsd: pool.volume5mUsd ?? existing.volume5mUsd,
      volume1hUsd: pool.volume1hUsd ?? existing.volume1hUsd,
      volume6hUsd: pool.volume6hUsd ?? existing.volume6hUsd,
      volume24hUsd: pool.volume24hUsd ?? existing.volume24hUsd,
      transactions5m: pool.transactions5m ?? existing.transactions5m,
      buys5m: pool.buys5m ?? existing.buys5m,
      sells5m: pool.sells5m ?? existing.sells5m,
      marketCapUsd: pool.marketCapUsd ?? existing.marketCapUsd,
      fullyDilutedValuationUsd: pool.fullyDilutedValuationUsd ?? existing.fullyDilutedValuationUsd,
      tokenImage: pool.tokenImage ?? existing.tokenImage,
      dexName: existing.dexName ?? pool.dexName,
      baseTokenSymbol: existing.baseTokenSymbol ?? pool.baseTokenSymbol,
      baseTokenName: existing.baseTokenName ?? pool.baseTokenName,
      createdAt: existing.createdAt ?? pool.createdAt,
    };
    for (const s of pool.sources) {
      if (!merged.sources.includes(s)) merged.sources.push(s);
    }
    merged.lastUpdatedAt = Date.now();
    pools.set(pool.id, merged);
    broadcast({ type: "pool", pool: merged, isNew });
    linkPoolToToken(merged);
    return;
  }
  pools.set(pool.id, pool);
  evictOldest(pools, POOL_CAP);
  broadcast({ type: "pool", pool, isNew });
  linkPoolToToken(pool);
}

// ---- Metadata enrichment (Pump.fun metadata URI -> image URL) ----

const metadataCache = new Map<string, { image: string | null; fetchedAt: number }>();
const METADATA_TTL_MS = 24 * 60 * 60_000;
const METADATA_QUEUE_CAP = 200;
const METADATA_CONCURRENCY = 3;
const metadataQueue: DiscoveryToken[] = [];
let metadataWorkers = 0;

async function fetchMetadataImage(uri: string): Promise<string | null> {
  // Pump.fun metadata is a JSON blob (usually on IPFS) with an `image` field.
  const res = await fetch(uri, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = (await res.json()) as { image?: unknown };
  if (typeof body.image === "string" && body.image.length > 0 && body.image.length < 500) {
    return body.image;
  }
  return null;
}

function pumpMetadata() {
  if (metadataWorkers >= METADATA_CONCURRENCY || metadataQueue.length === 0) return;
  metadataWorkers += 1;
  const token = metadataQueue.shift();
  if (!token) {
    metadataWorkers -= 1;
    return;
  }
  void (async () => {
    try {
      const cached = metadataCache.get(token.tokenAddress);
      if (cached && Date.now() - cached.fetchedAt < METADATA_TTL_MS) {
        token.tokenImage = cached.image;
      } else if (token.metadataUri) {
        const image = await fetchMetadataImage(token.metadataUri);
        metadataCache.set(token.tokenAddress, { image, fetchedAt: Date.now() });
        token.tokenImage = image;
      }
      token.metadataStatus = "loaded";
      token.lastUpdatedAt = Date.now();
      upsertToken(token, false);
    } catch {
      token.metadataStatus = "unavailable";
      token.lastUpdatedAt = Date.now();
      upsertToken(token, false);
    } finally {
      metadataWorkers -= 1;
      pumpMetadata();
    }
  })();
}

function enqueueMetadata(token: DiscoveryToken) {
  if (!token.metadataUri) {
    token.metadataStatus = "unavailable";
    return;
  }
  if (metadataCache.has(token.tokenAddress)) {
    token.tokenImage = metadataCache.get(token.tokenAddress)!.image;
    token.metadataStatus = "loaded";
    return;
  }
  metadataQueue.push(token);
  if (metadataQueue.length > METADATA_QUEUE_CAP) metadataQueue.shift(); // drop oldest
  void pumpMetadata();
}

// ---- Adapter lifecycle ----

function startAdapters() {
  if (running) return;
  running = true;
  // PumpPortal: Solana token creations + migrations (free methods only).
  pumpAdapter = createPumpPortalAdapter({
    onTokenLaunch: (token) => {
      enqueueMetadata(token);
      upsertToken(token, true);
    },
    onPoolLaunch: (pool) => {
      upsertPool(pool, true);
      // USD enrichment via DexScreener (keyless, rate-limited batches):
      // migration events carry no price/liquidity — enrich as soon as indexed.
      dexEnricher?.enqueue(pool.baseTokenAddress);
    },
    onStatus: (status, lastError) => {
      pumpLastError = lastError;
      void status;
    },
  });
  pumpAdapter.start();
  // DexScreener enrichment adapter — fills USD market data on new pools.
  dexEnricher = createDexEnricher({
    onPoolUpdate: (pool) => upsertPool(pool, false),
    onStatus: () => {},
  });
  dexEnricher.start();

  // One GeckoTerminal new-pools poller per configured live network.
  gtAdapters = (Object.values(CHAINS) as ChainConfig[])
    .filter((c) => c.geckoNetwork && c.status !== "unconfigured")
    .map((c) =>
      createGtPollerAdapter(c.geckoNetwork!, c.id, {
        onPoolEvent: (pool, isNew) => upsertPool(pool, isNew),
        onStatus: () => {},
      }),
    );
  for (const a of gtAdapters) a.start();
  // Periodic health broadcast so connected UIs see adapter status changes.
  healthTimer = setInterval(() => broadcast({ type: "health", health: getHealth() }), HEALTH_BROADCAST_MS);
}

function stopAdapters() {
  running = false;
  pumpAdapter?.stop();
  pumpAdapter = null;
  dexEnricher?.stop();
  dexEnricher = null;
  for (const a of gtAdapters) a.stop();
  gtAdapters = [];

  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

function getHealth(): AdapterHealth[] {
  const list: AdapterHealth[] = [];
  if (dexEnricher) list.push(dexEnricher.health());
  else
    list.push({
      id: "dexscreener-enricher",
      label: "DexScreener enrichment · Solana new pools",
      chain: "solana",
      status: "disabled" as const,
      lastEventAt: null,
      lastRefreshAt: null,
      limits: "Keyless batch enrichment (≤30 tokens/request, ≤30 req/min).",
      lastError: null,
      reconnects: 0,
      eventsObserved: 0,
    });
  if (pumpAdapter) list.push(pumpAdapter.health());
  else
    list.push({
      id: "pumpportal-solana",
      label: "PumpPortal · Solana (Pump.fun)",
      chain: "solana",
      status: "disabled" as const,
      lastEventAt: null,
      lastRefreshAt: null,
      limits:
        "Free token-creation + migration feed (no key). One connection per client; no historical backfill.",
      lastError: pumpLastError,
      reconnects: 0,
      eventsObserved: 0,
    });
  for (const a of gtAdapters) list.push(a.health());
  return list;
}


/** Subscribe an SSE writer. Starts adapters on first subscriber. */
export function subscribeDiscovery(send: (event: string) => void): () => void {
  subscribers.add(send);
  refCount += 1;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  startAdapters();
  return () => {
    subscribers.delete(send);
    refCount -= 1;
    if (refCount <= 0 && !idleTimer) {
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (refCount <= 0) stopAdapters();
      }, IDLE_STOP_MS);
    }
  };
}

/** Snapshot of the current stores + adapter health (sent on SSE connect). */
export function discoverySnapshot(): { tokens: DiscoveryToken[]; pools: DiscoveryPool[]; health: AdapterHealth[] } {
  const byFirstSeen = (a: DiscoveryToken | DiscoveryPool, b: DiscoveryToken | DiscoveryPool) =>
    b.firstSeenTimestamp - a.firstSeenTimestamp;
  return {
    tokens: [...tokens.values()].sort(byFirstSeen).slice(0, TOKEN_CAP),
    pools: [...pools.values()].sort(byFirstSeen).slice(0, POOL_CAP),
    health: getHealth(),
  };
}

/** Test/ops hook: reset the hub (used by unit tests only). */
export function resetDiscoveryForTests() {
  stopAdapters();
  subscribers.clear();
  refCount = 0;
  tokens.clear();
  pools.clear();
  metadataCache.clear();
  metadataQueue.length = 0;
  pumpLastError = null;
}
