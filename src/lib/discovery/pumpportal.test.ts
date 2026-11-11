import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPumpPortalAdapter, parsePumpPortalEvent } from "./pumpportal";
import { gtPoolToDiscovery } from "./gtpoller";
import { discoveryPoolToSummary, discoveryTokenToSummary } from "./toSummary";
import type { DiscoveryPool, DiscoveryToken } from "./model";

/**
 * LIVE-CAPTURED event: real subscribeNewToken message received from
 * wss://pumpportal.fun/api/data during verification (see pumpprobe.txt).
 * Used as-is for normalization tests — not mock data.
 */
const LIVE_CAPTURED_CREATE = {
  signature: "2pbRiEAtrij9qX565ZNSZz43NUWLZkzAd1xCtoebiokaWTc8PEaSp4dFqsgSs758uQNXKSXfw97ZHVNQVLCKXjMj",
  mint: "GRzB8DjukHPe7CDjvJdn5JWNLcEfqq8eHhDQephJGvTo",
  traderPublicKey: "HeJH8vai4dXSNTQfJ18H4Z6i6aHBv3ZQebEWgxtLjEEL",
  txType: "create",
  initialBuy: 0,
  solAmount: 0,
  bondingCurveKey: "BrPtU1756uAQX2tkSAmyZMPAB7fiybSm1WkJABcY6vJ4",
  vTokensInBondingCurve: 1073000000,
  vSolInBondingCurve: 30,
  marketCapSol: 27.958993476234856,
  name: "Ticklab",
  symbol: "TCKLB",
  uri: "https://ipfs.io/ipfs/bafkreie24kjsfkq5sczeejbopzidqyc5uid7n7gfi6xaqlvidjdcnnooxe",
  is_mayhem_mode: false,
  pool: "pump",
};

/** Documented migration shape (PumpPortal docs) — fields verified against the schema, not yet live-captured. */
const DOCUMENTED_MIGRATION = {
  signature: "5dWz7xyzNotARealSignatureForShapeTestingOnly00000000",
  mint: "MIGRATION11111111111111111111111111111111",
  bondingCurveKey: "BrPtU1756uAQX2tkSAmyZMPAB7fiybSm1WkJABcY6vJ4",
  poolType: "PUMP_SWAP",
  newPoolAddress: "POOLm1grat1onAddress1111111111111111111111",
  newPoolTokenAccount: "TA1111111111111111111111111111111111111111",
  newPoolTokenVBalance: 206900000,
  newPoolSolBalance: 83.2,
  newPoolSolReserves: 83.2,
  newPoolVirtualSolReserves: 83.2,
  newPoolTokenReserves: 206900000,
  newPoolVirtualTokenReserves: 206900000,
  marketCapSol: 401.9,
  name: "Test",
  symbol: "TEST",
  txType: "migration",
};

describe("parsePumpPortalEvent — token creation (live-captured shape)", () => {
  const now = 1_700_000_000_000;
  const parsed = parsePumpPortalEvent(LIVE_CAPTURED_CREATE, now);
  it("emits a token-launch with normalized identity", () => {
    expect(parsed.kind).toBe("token-launch");
    if (parsed.kind !== "token-launch") return;
    const t: DiscoveryToken = parsed.token;
    expect(t.id).toBe("solana:grzb8djukhpe7cdjvjdn5jwnlcefqq8ehhdqephjgvto");
    expect(t.chain).toBe("solana");
    expect(t.tokenAddress).toBe("GRzB8DjukHPe7CDjvJdn5JWNLcEfqq8eHhDQephJGvTo");
    expect(t.tokenName).toBe("Ticklab");
    expect(t.tokenSymbol).toBe("TCKLB");
    expect(t.launchpadName).toBe("Pump.fun");
    expect(t.launchTransaction).toBe(LIVE_CAPTURED_CREATE.signature);
    expect(t.poolStatus).toBe("none"); // creation event ≠ tradable pool
    expect(t.bondingCurveMcSol).toBeCloseTo(27.958993476234856);
    expect(t.initialBuySol).toBe(0);
    expect(t.metadataUri).toContain("ipfs.io");
  });
  it("does not fabricate a timestamp (feed has none) and records firstSeen", () => {
    if (parsed.kind !== "token-launch") return;
    expect(parsed.token.launchTimestamp).toBeNull();
    expect(parsed.token.firstSeenTimestamp).toBe(now);
  });
});

describe("parsePumpPortalEvent — migration → pool launch (documented shape)", () => {
  const now = 1_700_000_000_000;
  const parsed = parsePumpPortalEvent(DOCUMENTED_MIGRATION, now);
  it("emits a pool-launch keyed by pool address", () => {
    expect(parsed.kind).toBe("pool-launch");
    if (parsed.kind !== "pool-launch") return;
    const p: DiscoveryPool = parsed.pool;
    expect(p.id).toBe("solana:poolm1grat1onaddress1111111111111111111111");
    expect(p.chain).toBe("solana");
    expect(p.poolAddress).toBe("POOLm1grat1onAddress1111111111111111111111");
    expect(p.dexName).toBe("PumpSwap");
    expect(p.baseTokenAddress).toBe("MIGRATION11111111111111111111111111111111");
    expect(p.liquidityUsd).toBeNull(); // USD arrives from the pool poller enrichment
    expect(p.poolStatus).toBe("active");
    expect(p.sources).toEqual(["PumpPortal"]);
  });
});

describe("parsePumpPortalEvent — malformed input", () => {
  it("ignores non-objects, missing mints and unrelated frames", () => {
    expect(parsePumpPortalEvent(null).kind).toBe("ignore");
    expect(parsePumpPortalEvent("hello").kind).toBe("ignore");
    expect(parsePumpPortalEvent({ foo: 1 }).kind).toBe("ignore");
    expect(parsePumpPortalEvent({ txType: "create", mint: 42 }).kind).toBe("ignore");
  });
});

describe("gtPoolToDiscovery — GeckoTerminal pool mapping", () => {
  it("maps a raw GT pool with full granularity", () => {
    const tokenById = new Map([
      ["solona_BASEADDR", { address: "BaseAddr1111111111111111111111111111111", name: "Base Token", symbol: "BASE", image_url: "https://img/x.png" }],
    ]);
    const pool = {
      id: "solona_POOLADDR11111111111111111111111111111",
      type: "pool" as const,
      attributes: {
        address: "PoolAddr1111111111111111111111111111111",
        name: "BASE / SOL",
        dex_id: "raydium_launchlab",
        base_token_price_usd: "0.00123",
        reserve_in_usd: "45600.5",
        fdv_usd: "1230000",
        market_cap_usd: "1200000",
        pool_created_at: "2026-10-26T10:00:00Z",
        h24_volume_usd: "99000",
        transactions: { m5: { buys: 12, sells: 4, buyers: 9, sellers: 3 } },
        volume_usd: { m5: "1200.5", h1: "8000", h6: "30000", h24: "99000" },
      },
      relationships: {
        base_token: { data: { id: "solona_BASEADDR" } },
        quote_token: { data: { id: "solona_SOL" } },
        dex: { data: { id: "raydium_launchlab" } },
      },
    };
    const rec = gtPoolToDiscovery("solona", "solana", pool, tokenById, 1_700_000_000_000);
    expect(rec).not.toBeNull();
    if (!rec) return;
    expect(rec.id).toBe("solana:pooladdr1111111111111111111111111111111");
    expect(rec.chain).toBe("solana");
    expect(rec.poolAddress).toBe("PoolAddr1111111111111111111111111111111");
    expect(rec.baseTokenAddress).toBe("BaseAddr1111111111111111111111111111111");
    expect(rec.dexName).toBe("Raydium LaunchLab");
    expect(rec.liquidityUsd).toBe(45600.5);
    expect(rec.volume5mUsd).toBe(1200.5);
    expect(rec.volume1hUsd).toBe(8000);
    expect(rec.volume6hUsd).toBe(30000);
    expect(rec.volume24hUsd).toBe(99000);
    expect(rec.transactions5m).toBe(16);
    expect(rec.buys5m).toBe(12);
    expect(rec.sells5m).toBe(4);
    expect(rec.poolStatus).toBe("active");
    expect(rec.createdAt).toBe(Date.parse("2026-10-26T10:00:00Z"));
    expect(rec.sources).toEqual(["GeckoTerminal"]);
  });
  it("derives the base address from the relationship id when GT omits `included` (documented GT behavior, matches existing parsePools) ", () => {
    const pool = {
      id: "eth_POOLX",
      type: "pool" as const,
      attributes: { address: "0xp", name: "UNKNOWN / WETH" },
      relationships: { base_token: { data: { id: "eth_UNKNOWN" } }, quote_token: { data: { id: "eth_Q" } }, dex: { data: { id: "uniswap_v3" } } },
    };
    const rec = gtPoolToDiscovery("eth", "ethereum", pool, new Map());
    expect(rec?.baseTokenAddress).toBe("UNKNOWN");
  });
  it("returns null when the pool carries no address", () => {
    const pool = {
      id: "eth_POOLX",
      type: "pool" as const,
      attributes: { name: "X / Y" },
      relationships: { base_token: { data: { id: "eth_A" } }, quote_token: { data: { id: "eth_Q" } }, dex: { data: { id: "uniswap_v3" } } },
    } as unknown as Parameters<typeof gtPoolToDiscovery>[2];
    expect(gtPoolToDiscovery("eth", "ethereum", pool, new Map())).toBeNull();
  });
});

describe("discovery → TokenSummary mapping (honest nulls)", () => {
  it("token mapping keeps bonding-curve MC in SOL, never converts to USD", () => {
    const parsed = parsePumpPortalEvent(LIVE_CAPTURED_CREATE, 1_700_000_000_000);
    if (parsed.kind !== "token-launch") return;
    const s = discoveryTokenToSummary(parsed.token);
    expect(s.priceUsd).toBeNull();
    expect(s.liquidityUsd).toBeNull();
    expect(s.marketCapUsd).toBeNull();
    expect(s.bondingCurveMcSol).toBeCloseTo(27.958993476234856);
    expect(s.creationSource).toBe("launch");
    expect(s.venue).toBe("Pump.fun");
    expect(s.poolAddress).toBeNull();
  });
  it("pool mapping carries pool identity and liquidity", () => {
    const parsed = parsePumpPortalEvent(DOCUMENTED_MIGRATION, 1_700_000_000_000);
    if (parsed.kind !== "pool-launch") return;
    const s = discoveryPoolToSummary(parsed.pool);
    expect(s.chain).toBe("solana");
    expect(s.poolAddress).toBe("POOLm1grat1onAddress1111111111111111111111");
    expect(s.address).toBe("MIGRATION11111111111111111111111111111111");
    expect(s.venue).toBe("PumpSwap");
    expect(s.creationSource).toBe("pool");
    // txns24h stays null — the migration event has no 24h stats; never guess
    expect(s.txns24h.buys).toBeNull();
  });
});

describe("PumpPortal adapter reconnection", () => {
  // Point the adapter at a closed port so the connection fails quickly and
  // deterministically. This tests reconnect/backoff without any external
  // service. Process.env must be set before the module is imported.
  beforeAll(() => {
    process.env.PUMPPORTAL_WS_URL = "ws://127.0.0.1:1/";
  });
  afterAll(() => {
    delete process.env.PUMPPORTAL_WS_URL;
  });
  it("reconnects with increasing attempts and reports status", async () => {
    let lastStatus: string | null = null;
    const adapter = createPumpPortalAdapter({
      onTokenLaunch: () => {},
      onPoolLaunch: () => {},
      onStatus: (status) => {
        lastStatus = status;
      },
    });
    adapter.start();
    // Give the WS enough time to fail at least twice (1s + ~2s backoff + jitter).
    await new Promise((r) => setTimeout(r, 4500));
    const h = adapter.health();
    expect(h.reconnects).toBeGreaterThanOrEqual(2);
    expect(h.eventsObserved).toBe(0);
    expect(["down", "connecting"]).toContain(lastStatus);
    adapter.stop();
    expect(adapter.health().status).toBe("disabled");
  }, 10_000);
});