import { describe, expect, it } from "vitest";
import { createDexEnricher, mapDexPairToPool, numOrNull, type DexFetcher } from "./dexEnricher";
import type { DiscoveryPool } from "./model";

/**
 * LIVE-CAPTURED DexScreener response (real HTTP body, 2026-10-26): the pair
 * DexScreener serves for a freshly created Pump.fun token (bonding curve,
 * zero liquidity, no volume yet). Used as-is for normalization tests.
 */
const LIVE_CAPTURED_PAIR = {
  chainId: "solana",
  dexId: "pumpfun",
  url: "https://dexscreener.com/solana/4aohfsrdbbpfpoaow8usctt5rlz3s4vcgn2ncyvqlw8i",
  pairAddress: "4AohFsrDbbPFpoaow8usctt5RLz3s4vcgn2ncyvqlw8i",
  baseToken: {
    address: "GR2BYgrfjgJVm9oQYyufJC7E9tG6GRxD64VeL4To8hcq",
    name: "Life Before Memes",
    symbol: "Life",
  },
  quoteToken: { address: "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", symbol: "PUMP" },
  priceNative: "0",
  txns: { m5: { buys: 0, sells: 0 }, h1: { buys: 0, sells: 0 }, h6: { buys: 0, sells: 0 }, h24: { buys: 0, sells: 0 } },
  volume: { h24: 0, h6: 0, h1: 0, m5: 0 },
  priceChange: { m5: 0, h1: 0, h6: 0, h24: 0 },
  pairCreatedAt: 1793165910000,
};

describe("numOrNull", () => {
  it("parses finite numbers and numeric strings; rejects NaN/empty", () => {
    expect(numOrNull(0)).toBe(0);
    expect(numOrNull("12.5")).toBe(12.5);
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull(undefined)).toBeNull();
    expect(numOrNull("")).toBeNull();
    expect(numOrNull("   ")).toBeNull();
    expect(numOrNull("abc")).toBeNull();
    expect(numOrNull(Number.NaN)).toBeNull();
  });
});

describe("mapDexPairToPool — live-captured shape", () => {
  const now = 1_700_000_000_000;
  const pool = mapDexPairToPool(LIVE_CAPTURED_PAIR as never, now);
  it("maps identity, venue, and token fields from a real pair", () => {
    expect(pool).not.toBeNull();
    if (!pool) return;
    expect(pool.id).toBe("solana:4aohfsrdbbpfpoaow8usctt5rlz3s4vcgn2ncyvqlw8i");
    expect(pool.chain).toBe("solana");
    expect(pool.poolAddress).toBe("4AohFsrDbbPFpoaow8usctt5RLz3s4vcgn2ncyvqlw8i");
    expect(pool.dexName).toBe("pumpfun");
    expect(pool.baseTokenAddress).toBe("GR2BYgrfjgJVm9oQYyufJC7E9tG6GRxD64VeL4To8hcq");
    expect(pool.baseTokenSymbol).toBe("Life");
    expect(pool.baseTokenName).toBe("Life Before Memes");
    expect(pool.quoteTokenAddress).toBe("pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn");
    expect(pool.sources).toEqual(["DexScreener"]);
    expect(pool.launchpadName).toBeNull(); // DexScreener does not report it — never fabricate
    expect(pool.createdAt).toBe(1793165910000);
    expect(pool.firstSeenTimestamp).toBe(now);
    expect(pool.lastUpdatedAt).toBe(now);
  });
  it("keeps honest nulls for absent market data and zero-volume numbers", () => {
    expect(pool).not.toBeNull();
    if (!pool) return;
    expect(pool.liquidityUsd).toBeNull(); // field absent in the live response
    expect(pool.priceUsd).toBeNull(); // priceUsd absent
    expect(pool.volume24hUsd).toBe(0); // present and zero — reported as-is
    expect(pool.transactions5m).toBe(0);
    expect(pool.buys5m).toBe(0);
    expect(pool.sells5m).toBe(0);
    expect(pool.tokenImage).toBeNull();
  });
  it("classifies pool status honestly: unknown → active → empty", () => {
    expect(mapDexPairToPool(LIVE_CAPTURED_PAIR as never, now)!.poolStatus).toBe("unknown"); // liquidity absent
    const active = mapDexPairToPool({ ...LIVE_CAPTURED_PAIR, liquidity: { usd: 12_500 } } as never, now)!;
    expect(active.poolStatus).toBe("active");
    expect(active.liquidityUsd).toBe(12_500);
    const empty = mapDexPairToPool({ ...LIVE_CAPTURED_PAIR, liquidity: { usd: 0 } } as never, now)!;
    expect(empty.poolStatus).toBe("empty");
  });
  it("rejects pairs without a pair address or base token", () => {
    expect(mapDexPairToPool({ ...LIVE_CAPTURED_PAIR, pairAddress: "" } as never)).toBeNull();
    expect(mapDexPairToPool({ ...LIVE_CAPTURED_PAIR, baseToken: { address: "", name: "x", symbol: "x" } } as never)).toBeNull();
  });
});

const FAST = { batchIntervalMs: 20, retryDelaysMs: [30, 30, 30], cacheTtlMs: 500 };

function makeHarness(fetcher: DexFetcher) {
  const updates: DiscoveryPool[] = [];
  const statuses: string[] = [];
  const enricher = createDexEnricher(
    {
      onPoolUpdate: (p) => updates.push(p),
      onStatus: (s) => statuses.push(s),
    },
    fetcher,
    FAST,
  );
  return { enricher, updates, statuses };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createDexEnricher — batching, dedup, cache", () => {
  it("batches queued addresses into one request and emits mapped pool updates", async () => {
    const calls: string[][] = [];
    const fetcher: DexFetcher = async (_chains, addresses) => {
      calls.push(addresses);
      return [
        {
          ...LIVE_CAPTURED_PAIR,
          pairAddress: "poolaaa",
          baseToken: { ...LIVE_CAPTURED_PAIR.baseToken, address: addresses[0] },
          liquidity: { usd: 42_000 },
          priceUsd: "0.001",
          volume: { h24: 500 },
        },
        {
          ...LIVE_CAPTURED_PAIR,
          pairAddress: "poolbbb",
          baseToken: { ...LIVE_CAPTURED_PAIR.baseToken, address: addresses[1] },
          liquidity: { usd: 100 },
        },
      ];
    };
    const { enricher, updates } = makeHarness(fetcher);
    enricher.start();
    enricher.enqueue("ADDR1");
    enricher.enqueue("ADDR2");
    await sleep(150);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["ADDR1", "ADDR2"]);
    expect(updates).toHaveLength(2);
    expect(updates[0].id).toBe("solana:poolaaa");
    expect(updates[0].liquidityUsd).toBe(42_000);
    expect(updates[0].priceUsd).toBe(0.001);
    expect(updates[1].id).toBe("solana:poolbbb");
    const s = enricher.stats();
    expect(s.queued).toBe(0);
    expect(s.applied).toBe(2);
    expect(s.requests).toBe(1);
    enricher.stop();
  });

  it("deduplicates duplicate enqueues (cache-warm tokens are not re-queried)", async () => {
    let calls = 0;
    const fetcher: DexFetcher = async (_c, addresses) => {
      calls += 1;
      void addresses;
      return [
        {
          ...LIVE_CAPTURED_PAIR,
          pairAddress: "poolone",
          baseToken: { ...LIVE_CAPTURED_PAIR.baseToken, address: addresses[0] },
          liquidity: { usd: 7 },
        },
      ];
    };
    const { enricher } = makeHarness(fetcher);
    enricher.start();
    enricher.enqueue("TTLTOKEN");
    await sleep(150);
    expect(calls).toBe(1);
    expect(enricher.stats().cached).toBe(1);
    enricher.enqueue("TTLTOKEN"); // within TTL → skipped
    await sleep(100);
    expect(calls).toBe(1);
    enricher.stop();
  });
});
