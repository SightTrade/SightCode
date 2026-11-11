import { Connection, PublicKey } from "@solana/web3.js";
import { CHAINS } from "../chains";

/**
 * Direct Solana RPC reads used for token risk intelligence.
 * These are real on-chain facts (mint authority, freeze authority, holder
 * concentration) — independent of third-party APIs.
 */

export function getConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL || CHAINS.solana.defaultRpc;
  return new Connection(url, { commitment: "confirmed" });
}

export interface MintInfo {
  decimals: number | null;
  supply: string | null;
  mintAuthority: string | null; // null means authority revoked
  freezeAuthority: string | null;
}

export async function getMintInfo(mint: string): Promise<MintInfo | null> {
  try {
    const conn = getConnection();
    const pk = new PublicKey(mint);
    const info = await conn.getParsedAccountInfo(pk);
    const parsed = info.value?.data;
    if (!parsed || typeof parsed !== "object" || !("parsed" in parsed)) return null;
    const obj = parsed.parsed as { info?: Record<string, unknown> };
    const i = obj.info ?? {};
    return {
      decimals: typeof i.decimals === "number" ? i.decimals : null,
      supply: typeof i.supply === "string" ? i.supply : null,
      mintAuthority: typeof i.mintAuthority === "string" ? i.mintAuthority : null,
      freezeAuthority: typeof i.freezeAuthority === "string" ? i.freezeAuthority : null,
    };
  } catch {
    return null;
  }
}

export interface HolderConcentration {
  /** Share (0-100) of supply held by the top token accounts, excluding approx pool volumes. */
  top1SharePct: number;
  top10SharePct: number;
  accountsExamined: number;
  note: string;
}

/**
 * Top-holder concentration from getTokenLargestAccounts (20 largest token
 * accounts). This is an *observed share* — it cannot distinguish pools,
 * launchpad vaults, or CEX custody wallets from whales.
 */
export async function getHolderConcentration(mint: string): Promise<HolderConcentration | null> {
  try {
    const conn = getConnection();
    const pk = new PublicKey(mint);
    const largest = await conn.getTokenLargestAccounts(pk);
    const mintInfo = await getMintInfo(mint);
    if (!mintInfo?.supply) return null;
    const supply = BigInt(mintInfo.supply);
    if (supply <= 0n) return null;
    const accounts = largest.value
      .filter((a) => BigInt(a.amount) > 0n)
      .sort((a, b) => (b.uiAmount ?? 0) - (a.uiAmount ?? 0));
    if (accounts.length === 0) return null;
    const sharePct = (raw: bigint) => Number((raw * 10_000n) / supply) / 100;
    return {
      top1SharePct: sharePct(BigInt(accounts[0].amount)),
      top10SharePct: sharePct(
        accounts.slice(0, 10).reduce<bigint>((acc, a) => acc + BigInt(a.amount), 0n),
      ),
      accountsExamined: accounts.length,
      note: "Share of total supply held by the largest token accounts. Pool and vault wallets are included and can inflate this figure.",
    };
  } catch {
    return null;
  }
}

/** Latest processed slot — used by the network status indicator. */
export async function getSlot(): Promise<number | null> {
  try {
    return await getConnection().getSlot("processed");
  } catch {
    return null;
  }
}

export interface TopHoldersResult {
  supply: string | null;
  holders: {
    address: string;
    owner: string | null;
    balance: string;
    decimals: number | null;
    uiAmount: number | null;
    sharePct: number | null;
  }[];
}

/**
 * Largest SPL token accounts for a mint, with owner wallets resolved from the
 * parsed accounts (direct RPC — no indexer). CURRENT balances only: RPC cannot
 * provide historical holdings. Pool/vault/custody accounts are indistinguishable
 * from personal wallets at this level and are returned as-is.
 */
export async function getTopHolders(mint: string, limit = 15): Promise<TopHoldersResult | null> {
  try {
    const conn = getConnection();
    const pk = new PublicKey(mint);
    const [largest, mintInfo] = await Promise.all([
      conn.getTokenLargestAccounts(pk),
      getMintInfo(mint),
    ]);
    const accounts = largest.value.filter((a) => BigInt(a.amount) > 0n).slice(0, limit);
    if (accounts.length === 0) return { supply: mintInfo?.supply ?? null, holders: [] };
    const infos = await conn.getMultipleAccountsInfo(accounts.map((a) => a.address));
    const supplyRaw = mintInfo?.supply ? BigInt(mintInfo.supply) : null;
    const holders = accounts.map((a, i) => {
      // Raw SPL token account layout: mint (32 bytes) at 0, owner (32) at 32.
      const data = infos[i]?.data;
      const owner =
        data && typeof data !== "string" && data.length >= 64
          ? new PublicKey(data.subarray(32, 64)).toBase58()
          : null;
      const sharePct =
        supplyRaw !== null && supplyRaw > 0n
          ? Number((BigInt(a.amount) * 10_000n) / supplyRaw) / 100
          : null;
      return {
        address: a.address.toBase58(),
        owner,
        balance: a.amount,
        decimals: typeof a.decimals === "number" ? a.decimals : null,
        uiAmount: typeof a.uiAmount === "number" ? a.uiAmount : null,
        sharePct,
      };
    });
    return { supply: mintInfo?.supply ?? null, holders };
  } catch {
    return null;
  }
}

/** Confirm a transaction signature; returns real status from the chain. */
export async function getSignatureStatus(
  signature: string,
): Promise<{ confirmed: boolean; status: "confirmed" | "pending" | "failed" | "unknown"; err: unknown } | null> {
  try {
    const conn = getConnection();
    const res = await conn.getSignatureStatuses([signature]);
    const s = res.value[0];
    if (!s) return null;
    if (s.err) return { confirmed: true, status: "failed", err: s.err };
    if (s.confirmationStatus === "finalized" || s.confirmationStatus === "confirmed")
      return { confirmed: true, status: "confirmed", err: null };
    return { confirmed: false, status: "pending", err: null };
  } catch {
    return null;
  }
}