import type { DiscoveryPool, DiscoveryToken } from "./model";
import type { TokenSummary } from "../types";

/**
 * Map live discovery records into the existing TokenSummary row model so the
 * shared TokenTable renders them with zero schema changes to the table.
 *
 * Honesty rules: fields a launchpad event does not carry (price, liquidity,
 * 24h volume, 24h txns) are null — the UI renders "—", never a fabricated
 * number. Bonding-curve market cap (SOL) rides in an optional field and is
 * labeled in SOL; it is never converted to USD.
 */
export function discoveryTokenToSummary(t: DiscoveryToken): TokenSummary {
  return {
    chain: t.chain,
    address: t.tokenAddress,
    symbol: t.tokenSymbol ?? "?",
    name: t.tokenName ?? "?",
    image: t.tokenImage,
    priceUsd: null,
    priceChange: { m5: null, h1: null, h6: null, h24: null },
    marketCapUsd: null,
    fdvUsd: null,
    bondingCurveMcSol: t.bondingCurveMcSol,
    liquidityUsd: null,
    volume24hUsd: null,
    txns24h: { buys: null, sells: null },
    traders24h: null,
    createdAt: t.launchTimestamp ?? t.firstSeenTimestamp,
    creationSource: "launch",
    venue: t.launchpadName,
    poolAddress: null,
    dataSource: t.dataSource,
    fetchedAt: t.lastUpdatedAt,
  };
}

export function discoveryPoolToSummary(p: DiscoveryPool): TokenSummary {
  return {
    chain: p.chain,
    address: p.baseTokenAddress,
    symbol: p.baseTokenSymbol ?? "?",
    name: p.baseTokenName ?? "?",
    image: p.tokenImage,
    priceUsd: p.priceUsd,
    priceChange: { m5: null, h1: null, h6: null, h24: null },
    marketCapUsd: p.marketCapUsd,
    fdvUsd: p.fullyDilutedValuationUsd,
    liquidityUsd: p.liquidityUsd,
    volume24hUsd: p.volume24hUsd,
    // 5-minute activity is deliberately not shown as 24h stats — honest nulls.
    txns24h: { buys: null, sells: null },
    traders24h: null,
    createdAt: p.createdAt ?? p.firstSeenTimestamp,
    creationSource: "pool",
    venue: p.dexName ?? p.launchpadName,
    poolAddress: p.poolAddress,
    dataSource: p.sources[0] ?? "GeckoTerminal",
    fetchedAt: p.lastUpdatedAt,
  };
}
