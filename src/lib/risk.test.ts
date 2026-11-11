import { describe, expect, it } from "vitest";
import { buildRiskReview } from "./risk";
import type { TokenSummary } from "./types";
import type { HolderConcentration, MintInfo } from "./providers/solanaRpc";

function summary(over: Partial<TokenSummary> = {}): TokenSummary {
  return {
    chain: "solana",
    address: "So11111111111111111111111111111111111111112",
    symbol: "TEST",
    name: "Test Token",
    image: null,
    priceUsd: 0.001,
    priceChange: { m5: null, h1: null, h6: null, h24: null },
    marketCapUsd: 500_000,
    fdvUsd: null,
    liquidityUsd: 42_000,
    volume24hUsd: 120_000,
    txns24h: { buys: 500, sells: 400 },
    traders24h: null,
    createdAt: Date.now() - 3 * 86_400_000,
    creationSource: "pool",
    venue: "Raydium",
    poolAddress: null,
    dataSource: "DexScreener",
    fetchedAt: Date.now(),
    ...over,
  };
}

const holders: HolderConcentration = {
  top1SharePct: 30,
  top10SharePct: 45,
  accountsExamined: 20,
  note: "test note",
};

describe("buildRiskReview", () => {
  it("flags active mint authority as a warning with a source", () => {
    const mintInfo: MintInfo = { decimals: 9, supply: "1", mintAuthority: "Auth1", freezeAuthority: null };
    const review = buildRiskReview({ summary: summary(), mintInfo, holders, organicScore: null, poolCount: 2, explorerKeyAvailable: false });
    const mint = review.findings.find((f) => f.id === "mint-authority");
    expect(mint?.severity).toBe("warn");
    expect(mint?.source).toContain("Solana RPC");
  });
  it("flags active freeze authority as critical", () => {
    const mintInfo: MintInfo = { decimals: 9, supply: "1", mintAuthority: null, freezeAuthority: "Fz1" };
    const review = buildRiskReview({ summary: summary(), mintInfo, holders: null, organicScore: null, poolCount: 1, explorerKeyAvailable: false });
    expect(review.findings.find((f) => f.id === "freeze-authority")?.severity).toBe("critical");
  });
  it("rates high holder concentration as warning or worse", () => {
    const review = buildRiskReview({
      summary: summary(),
      mintInfo: null,
      holders: { ...holders, top10SharePct: 80 },
      organicScore: null,
      poolCount: 1,
      explorerKeyAvailable: false,
    });
    expect(["warn", "critical"]).toContain(review.findings.find((f) => f.id === "holder-concentration")?.severity);
  });
  it("never fabricates a composite score and always notes limitations", () => {
    const review = buildRiskReview({ summary: summary(), mintInfo: null, holders: null, organicScore: null, poolCount: 0, explorerKeyAvailable: false });
    expect(review.score).toBeNull();
    expect(review.notes.some((n) => n.toLowerCase().includes("safe"))).toBe(true);
  });
  it("marks unavailable metrics as unknown instead of inventing them", () => {
    const review = buildRiskReview({
      summary: summary({ liquidityUsd: null, createdAt: null }),
      mintInfo: null,
      holders: null,
      organicScore: null,
      poolCount: 0,
      explorerKeyAvailable: false,
    });
    expect(review.findings.find((f) => f.id === "liquidity")?.severity).toBe("unknown");
    expect(review.findings.find((f) => f.id === "pool-age")?.severity).toBe("unknown");
  });
  it("warns on very fresh pools", () => {
    const review = buildRiskReview({
      summary: summary({ createdAt: Date.now() - 3_600_000 }),
      mintInfo: null,
      holders: null,
      organicScore: null,
      poolCount: 1,
      explorerKeyAvailable: false,
    });
    expect(review.findings.find((f) => f.id === "pool-age")?.severity).toBe("warn");
  });
  it("tells EVM users what is missing without an explorer key", () => {
    const review = buildRiskReview({
      summary: summary({ chain: "ethereum" }),
      mintInfo: null,
      holders: null,
      organicScore: null,
      poolCount: 1,
      explorerKeyAvailable: false,
    });
    const contract = review.findings.find((f) => f.id === "contract-permissions");
    expect(contract?.severity).toBe("unknown");
    expect(contract?.detail).toContain("explorer API key");
  });
});