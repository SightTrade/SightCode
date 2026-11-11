import type { ChainId } from "./chains";

/**
 * Core market-data model shared between providers, API routes and UI.
 *
 * Every numeric field is nullable: a provider that does not expose a metric
 * must yield null — the UI renders "—" instead of fabricating a value.
 * All timestamps are epoch milliseconds (UTC).
 */
export interface TokenSummary {
  chain: ChainId;
  /** Token mint (Solana) or contract address (EVM). */
  address: string;
  symbol: string;
  name: string;
  image: string | null;
  priceUsd: number | null;
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  /** Market cap when the provider computes it; FDV otherwise (UI labels which). */
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  txns24h: { buys: number | null; sells: number | null };
  /** Unique traders in the last 24h when the provider reports it. */
  traders24h: number | null;
  /**
   * Creation time of the pool/launch. Providers expose different things:
   * this is the pool creation time for DEX pairs. `creationSource` says which.
   */
  createdAt: number | null;
  creationSource: "pool" | "token" | "launch" | "discovery" | null;
  /** DEX / launchpad venue label, e.g. "Pump.fun AMM", "PancakeSwap V3". */
  /** DEX / launchpad venue label, e.g. "Pump.fun AMM", "Pump.fun", "Raydium LaunchLab". */
  venue: string | null;
  poolAddress: string | null;
  /** Bonding-curve market cap in SOL (Pump.fun pre-AMM tokens). Null when N/A. */
  bondingCurveMcSol?: number | null;
  /** Which provider produced this row — shown in the UI. */
  dataSource: string;
  /** ms timestamp of when this row was fetched (server time). */
  fetchedAt: number;
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WalletHoldings {
  chain: ChainId;
  address: string;
  nativeBalance: string | null; // raw units, decimal-safe as string
  tokens: {
    address: string;
    symbol: string | null;
    name: string | null;
    balance: string; // raw units
    decimals: number | null;
    priceUsd: number | null;
    valueUsd: number | null;
  }[];
  fetchedAt: number;
  /** Honest note about coverage, e.g. "EVM portfolio scan requires an indexer". */
  coverage: "full" | "partial" | "unavailable";
  note: string | null;
}

export interface RiskFinding {
  /** machine key */
  id: string;
  label: string;
  severity: "ok" | "info" | "warn" | "critical" | "unknown";
  detail: string;
  /** Where this finding came from — traceability requirement. */
  source: string;
}

export interface RiskReview {
  findings: RiskFinding[];
  /** null when no composite score is computed — preferred until methodology is documented. */
  score: null;
  generatedAt: number;
  notes: string[];
}

export interface TokenDetail {
  summary: TokenSummary;
  /** Token decimals (from on-chain mint info or provider). */
  decimals: number | null;
  /** Alternate venues / pairs for the same token. */
  venues: {
    venue: string;
    poolAddress: string | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    url: string | null;
  }[];
  /** Description/socials when available. Treat as untrusted strings. */
  about: { description: string | null; twitter: string | null; website: string | null; telegram: string | null } | null;
  risk: RiskReview | null;
  providerNotes: string[];
  /**
   * Solana-only: decoded activity evidence (Helius Enhanced Transactions) when
   * an indexer key is available. Null when no indexer data exists for this
   * chain — the UI shows an honest placeholder instead of fabricated data.
   */
  activity: TokenActivity | null;
  /**
   * Solana-only: largest token accounts via direct RPC (current balances —
   * no historical holdings). Null when the chain cannot provide it.
   */
  holders: HoldersData | null;
}

/**
 * Evidence-based wallet intelligence derived from decoded transactions for a
 * token mint. Wallets are "seen in recent decoded transactions" — frequency of
 * appearance is not a financial relationship and is never presented as one.
 */
export interface RelatedWallet {
  address: string;
  /** Number of decoded transactions in the window that mention this wallet. */
  appearances: number;
  /** Epoch ms of the most recent decoded transaction mentioning this wallet. */
  lastSeen: number | null;
  /** appearances / transactions with token transfers in the window (0..1). */
  share: number | null;
}

export type TokenActivityState =
  /** Decoded transactions mention this token — rows below are real activity. */
  | "available"
  /** Token was created (mint lifecycle observed) but no confirmed trades decoded yet. */
  | "created-no-trades"
  /** The indexer is reachable but returned nothing relevant for this mint. */
  | "empty"
  /** The provider/indexer lookup failed — old data may still be shown below. */
  | "unavailable";

export type TokenActivityDirection = "buy" | "sell" | "transfer" | "liquidity" | "unknown";

export interface TokenActivity {
  state: TokenActivityState;
  coverage: "decoded";
  note: string;
  /** Number of decoded transactions that mention the token mint. */
  transactionsScanned: number;
  /** Number of decoded transactions the indexer returned for this address (pre-filter). */
  transactionsReturned: number;
  fetchedAt: number;
  /** Most recent decoded transactions (newest first, capped). */
  transactions: {
    signature: string;
    timestamp: number | null;
    kind: string;
    /** Evidence-based direction for the classified wallet/fee payer —
     *  labeled estimated on Solana; never asserted as intent. */
    direction: TokenActivityDirection;
    description: string | null;
    explorerUrl: string | null;
    /** Wallet this row was classified against (EVM) — null when not identified. */
    counterparty?: string | null;
    /** Classifier label + confidence (EVM rows). */
    confidence?: string | null;
    classificationReason?: string | null;
    tokenIn?: { asset: string; symbol: string | null; amount: number | null } | null;
    tokenOut?: { asset: string; symbol: string | null; amount: number | null } | null;
    /** Quote asset amount in the quote asset's own units (never USD). */
    quoteAmount?: number | null;
    quoteCurrency?: string | null;
    /** "confirmed" | "failed" | null (receipt unavailable). */
    status?: string | null;
  }[];
  /** Wallets seen in the window, ranked by appearance count. */
  wallets: RelatedWallet[];
}

/**
 * Largest token accounts from direct RPC reads (Solana). These are CURRENT
 * balances — no historical holdings are available without an indexer.
 * Pool/vault/CEX-custody accounts are indistinguishable from personal wallets
 * at the RPC level and are included as-is.
 */
export interface TokenHolder {
  /** SPL token account address. */
  address: string;
  /** Owner wallet resolved from the parsed account; null when unresolvable. */
  owner: string | null;
  /** Raw balance (string — decimal-safe). */
  balance: string;
  decimals: number | null;
  uiAmount: number | null;
  /** Share of total supply, percent (0-100). Null when supply unknown. */
  sharePct: number | null;
}

export interface HoldersData {
  source: string;
  note: string;
  accountsExamined: number;
  /** Total mint supply (raw string) used for share computation. */
  supply: string | null;
  fetchedAt: number;
  holders: TokenHolder[];
}

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface QuoteResult {
  inputMint: string;
  outputMint: string;
  inAmount: string; // raw units
  outAmount: string;
  otherAmountThreshold: string; // min received with slippage
  slippageBps: number;
  priceImpactPct: number | null;
  routeLabels: string[];
  /** Raw provider quote payload to pass back to the build endpoint. */
  raw: unknown;
  provider: string;
}

export interface TxRecord {
  id: string;
  chain: ChainId;
  kind: "buy" | "sell" | "transfer" | "unknown";
  tokenAddress: string | null;
  tokenSymbol: string | null;
  amountToken: number | null;
  amountNative: number | null;
  nativeSymbol: string | null;
  valueUsd: number | null;
  signature: string;
  timestamp: number;
  status: "confirmed" | "pending" | "failed" | "unknown";
  explorerUrl: string | null;
  note: string | null;
}