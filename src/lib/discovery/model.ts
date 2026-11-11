import type { ChainId } from "../chains";

/**
 * Normalized real-time discovery records.
 *
 * Identity rules:
 *   token identity = `${chain}:${tokenAddress}` (lowercase address)
 *   pool identity  = `${chain}:${poolAddress}`  (lowercase pool address)
 * A token launch and a pool launch are different events; a token can own
 * multiple pools. Missing values are null — never zero, never fabricated.
 */

export interface DiscoveryToken {
  /** Token identity key: `${chain}:${tokenAddress}` lowercase address. */
  id: string;
  chain: ChainId;
  /** Token mint (Solana) or contract address (EVM). */
  tokenAddress: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenImage: string | null;
  /** Metadata URI (e.g. Pump.fun IPFS metadata). Null when unknown. */
  metadataUri: string | null;
  /** Launchpad name only when the source actually reports it. */
  launchpadName: string | null;
  /** Launch transaction signature (Solana) or tx hash (EVM). */
  launchTransaction: string | null;
  /** Original event timestamp (ms UTC) from the source when available. */
  launchTimestamp: number | null;
  /** When SIGHT first detected this token. */
  firstSeenTimestamp: number;
  /** When the token acquired a tradable pool, if observed. */
  graduatedAt: number | null;
  /** Pool address of the graduation event, if any. */
  graduatedPoolAddress: string | null;
  /**
   * "none" = no tradable pool observed (bonding-curve token).
   * "present" = at least one pool observed for this token.
   */
  poolStatus: "none" | "present";
  /**
   * Bonding-curve market cap in SOL (Pump.fun). Provider-reported; never
   * converted to USD. Null when the source does not report it.
   */
  bondingCurveMcSol: number | null;
  /** Initial buy amount in SOL (creation event) when reported. */
  initialBuySol: number | null;
  metadataStatus: "pending" | "loaded" | "unavailable";
  dataSource: string;
  lastUpdatedAt: number;
}

export interface DiscoveryPool {
  /** Pool identity key: `${chain}:${poolAddress}` lowercase address. */
  id: string;
  chain: ChainId;
  poolAddress: string;
  /** DEX / launchpad venue label; provider-reported only. */
  dexName: string | null;
  launchpadName: string | null;
  baseTokenAddress: string;
  baseTokenSymbol: string | null;
  baseTokenName: string | null;
  quoteTokenAddress: string | null;
  /** Pool creation time (ms UTC) from the source when available. */
  createdAt: number | null;
  firstSeenTimestamp: number;
  liquidityUsd: number | null;
  priceUsd: number | null;
  volume5mUsd: number | null;
  volume1hUsd: number | null;
  volume6hUsd: number | null;
  volume24hUsd: number | null;
  transactions5m: number | null;
  buys5m: number | null;
  sells5m: number | null;
  marketCapUsd: number | null;
  fullyDilutedValuationUsd: number | null;
  /** Whether the pool has actual liquidity (not zero-liquidity). */
  poolStatus: "empty" | "active" | "unknown";
  /** Deduplication: which sources reported this pool (first-wins registry). */
  sources: string[];
  tokenImage: string | null;
  lastUpdatedAt: number;
}

export interface AdapterHealth {
  id: string;
  label: string;
  /** e.g. "solana" | "ethereum" | "bsc" | "base" | null for global. */
  chain: ChainId | null;
  status: "disabled" | "connecting" | "live" | "degraded" | "down";
  lastEventAt: number | null;
  lastRefreshAt: number | null;
  /** Free-tier or provider limitations, phrased for the UI. */
  limits: string;
  lastError: string | null;
  reconnects: number;
  eventsObserved: number;
}

export type DiscoveryEvent =
  | { type: "snapshot"; tokens: DiscoveryToken[]; pools: DiscoveryPool[]; health: AdapterHealth[]; serverTime: number }
  | { type: "token"; token: DiscoveryToken }
  | { type: "pool"; pool: DiscoveryPool; isNew: boolean }
  | { type: "health"; health: AdapterHealth[] }
  | { type: "notice"; message: string };
