/**
 * SIGHT — supported chain registry.
 *
 * Each network gets explicit configuration. A chain is never surfaced as
 * tradable / operational unless its status is "live".
 *
 * Robinhood Chain: treated as a separate EVM network. At build time no
 * verified public RPC, chain ID, or market-data source was confirmed, so it is
 * registered with status "unconfigured" and all features are disabled for it.
 * Fill in the config fields once a verified source exists.
 */
export type ChainId = "solana" | "bsc" | "ethereum" | "base" | "robinhood";
export type ChainKind = "solana" | "evm";

export type ChainStatus = "live" | "limited" | "unconfigured";

export interface ExplorerLinks {
  name: string;
  address: (addr: string) => string;
  tx: (sig: string) => string;
  token: (mint: string) => string;
}

export interface ChainConfig {
  id: ChainId;
  name: string;
  shortName: string;
  kind: ChainKind;
  status: ChainStatus;
  /** Short, honest description of what works on this chain today. */
  capabilityNote: string;
  nativeToken: { name: string; symbol: string; decimals: number };
  /** GeckoTerminal network id, e.g. "solana", "eth", "bsc", "base". */
  geckoNetwork: string | null;
  /** DexScreener chain id, e.g. "solana", "bsc", "ethereum", "base". */
  dexscreenerChain: string | null;
  /** EVM chain id (viem `Chain.id`). null for non-EVM / unverified networks. */
  evmChainId: number | null;
  explorer: ExplorerLinks | null;
  /** Server-side env var holding the RPC URL. */
  rpcEnvKey: string;
  defaultRpc: string;
  /** UI accent for the chain pill. */
  color: string;
  /** Local brand-logo SVG (public/logos), keyed by network id — no runtime
   *  external requests. Rendered by <ChainLogo id={...}/> with a text-label
   *  fallback if the asset ever fails to load. */
  logo: string;
}

export const CHAINS: Record<ChainId, ChainConfig> = {
  solana: {
    id: "solana",
    name: "Solana",
    shortName: "SOL",
    kind: "solana",
    status: "live",
    capabilityNote:
      "Market data, token search, candles, risk checks, wallet connect (Phantom + injected), and swaps via Jupiter are operational.",
    nativeToken: { name: "Solana", symbol: "SOL", decimals: 9 },
    geckoNetwork: "solana",
    dexscreenerChain: "solana",
    evmChainId: null,
    explorer: {
      name: "Solscan",
      address: (a) => `https://solscan.io/account/${a}`,
      tx: (t) => `https://solscan.io/tx/${t}`,
      token: (m) => `https://solscan.io/token/${m}`,
    },
    rpcEnvKey: "SOLANA_RPC_URL",
    defaultRpc: "https://api.mainnet-beta.solana.com",
    color: "#69A8FF",
    logo: "/logos/solana.svg",
  },
  bsc: {
    id: "bsc",
    name: "BNB Chain",
    shortName: "BNB",
    kind: "evm",
    status: "live",
    capabilityNote:
      "Market data, token search and candles are operational via public providers. Wallet connect works; swap execution is not enabled yet.",
    nativeToken: { name: "BNB", symbol: "BNB", decimals: 18 },
    geckoNetwork: "bsc",
    dexscreenerChain: "bsc",
    evmChainId: 56,
    explorer: {
      name: "BscScan",
      address: (a) => `https://bscscan.com/address/${a}`,
      tx: (t) => `https://bscscan.com/tx/${t}`,
      token: (m) => `https://bscscan.com/token/${m}`,
    },
    rpcEnvKey: "BSC_RPC_URL",
    defaultRpc: "https://bsc-rpc.publicnode.com",
    color: "#F0B90B",
    logo: "/logos/bnb-chain.svg",
  },
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    shortName: "ETH",
    kind: "evm",
    status: "live",
    capabilityNote:
      "Market data, token search and candles are operational via public providers. Wallet connect works; swap execution is not enabled yet.",
    nativeToken: { name: "Ether", symbol: "ETH", decimals: 18 },
    geckoNetwork: "eth",
    dexscreenerChain: "ethereum",
    evmChainId: 1,
    explorer: {
      name: "Etherscan",
      address: (a) => `https://etherscan.io/address/${a}`,
      tx: (t) => `https://etherscan.io/tx/${t}`,
      token: (m) => `https://etherscan.io/token/${m}`,
    },
    rpcEnvKey: "ETHEREUM_RPC_URL",
    defaultRpc: "https://ethereum-rpc.publicnode.com",
    color: "#8B96A5",
    logo: "/logos/ethereum.svg",
  },
  base: {
    id: "base",
    name: "Base",
    shortName: "BASE",
    kind: "evm",
    status: "live",
    capabilityNote:
      "Market data, token search and candles are operational via public providers. Wallet connect works; swap execution is not enabled yet.",
    nativeToken: { name: "Ether", symbol: "ETH", decimals: 18 },
    geckoNetwork: "base",
    dexscreenerChain: "base",
    evmChainId: 8453,
    explorer: {
      name: "Basescan",
      address: (a) => `https://basescan.org/address/${a}`,
      tx: (t) => `https://basescan.org/tx/${t}`,
      token: (m) => `https://basescan.org/token/${m}`,
    },
    rpcEnvKey: "BASE_RPC_URL",
    defaultRpc: "https://base-rpc.publicnode.com",
    color: "#42D392",
    logo: "/logos/base.svg",
  },
  robinhood: {
    id: "robinhood",
    name: "Robinhood Chain",
    shortName: "RH",
    kind: "evm",
    status: "unconfigured",
    capabilityNote:
      "Awaiting verified network configuration (chain ID, public RPC, deployed protocols, market-data source). No features are enabled for this network yet.",
    nativeToken: { name: "Ether", symbol: "ETH", decimals: 18 },
    geckoNetwork: null,
    dexscreenerChain: null,
    evmChainId: null,
    explorer: null,
    rpcEnvKey: "ROBINHOOD_RPC_URL",
    defaultRpc: "",
    color: "#FFCB69",
    logo: "/logos/robinhood-chain.svg",
  },
};

export const TRADABLE_CHAINS: ChainId[] = Object.values(CHAINS)
  .filter((c) => c.status !== "unconfigured")
  .map((c) => c.id);

export const DEFAULT_CHAIN: ChainId = "solana";

export function getChain(id: string | null | undefined): ChainConfig | null {
  if (id && id in CHAINS) return CHAINS[id as ChainId];
  return null;
}

/** Return the configured RPC URL for a chain (server-side only). */
export function chainRpcUrl(chain: ChainConfig): string | null {
  const env = process.env[chain.rpcEnvKey];
  if (env && env.trim().length > 0) return env.trim();
  if (chain.status === "unconfigured") return null;
  return chain.defaultRpc;
}

export const SOL = CHAINS.solana;

/** Common Solana mints used across the app (well-known, on-chain verified). */
export const SOLANA_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;

export const SOLANA_WSOL = SOLANA_MINTS.SOL;

/** Base58 alphabet shape check for Solana addresses (cheap validation, not a checksum). */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function isSolanaAddress(addr: string): boolean {
  return BASE58_RE.test(addr);
}

export function isEvmAddress(addr: string): boolean {
  return EVM_ADDR_RE.test(addr);
}

export type DetectedAddress =
  | { type: "solana-mint"; value: string }
  | { type: "evm-address"; value: string }
  | { type: "ambiguous"; value: string };

/**
 * Detect what a raw input looks like. A base58 blob can be a Solana mint, a
 * wallet address, or a transaction signature — we never assume; callers must
 * present the interpretation options to the user when ambiguous.
 */
export function detectAddress(input: string): DetectedAddress | null {
  const v = input.trim();
  if (EVM_ADDR_RE.test(v)) return { type: "evm-address", value: v.toLowerCase() };
  if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(v)) return { type: "ambiguous", value: v }; // tx signature length
  if (/^0x[a-fA-F0-9]{64}$/.test(v)) return { type: "ambiguous", value: v.toLowerCase() }; // EVM tx hash
  if (BASE58_RE.test(v)) return { type: "solana-mint", value: v };
  return null;
}