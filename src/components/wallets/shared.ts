import type { ChainId } from "@/lib/chains";
import { CHAINS } from "@/lib/chains";

/** A wallet entry displayed in the chain-filtered wallet list. */
export interface WalletRow {
  /** Stable key: `${source}:${id}` — unique across sources. */
  key: string;
  /** embedded → vault-managed keys; external → connected session; tracked → read-only address. */
  source: "embedded" | "external" | "tracked";
  id: string;
  name: string;
  address: string;
  family: "solana" | "evm";
  archived: boolean;
}

/** Per `${chain}:${address}` balance fetch state. Missing data is never zero. */
export interface BalanceInfo {
  status: "loading" | "ok" | "error";
  /** Human units of the chain's native token (e.g. "1.2345 SOL"). */
  nativeHuman: string | null;
  /** Raw units: lamports for Solana, wei for EVM (precision-safe transfers). */
  nativeRaw: string | null;
  /** Token-holding count — only when the provider delivers a full scan. */
  holdings: number | null;
  coverage: "full" | "partial" | "unavailable" | null;
  fetchedAt: number | null;
  error: string | null;
}

export function balanceKey(chain: ChainId, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

/** Which wallet family signs on a chain. Solana keys never sign EVM chains. */
export function familyForChain(chain: ChainId): "solana" | "evm" {
  return CHAINS[chain].kind === "solana" ? "solana" : "evm";
}