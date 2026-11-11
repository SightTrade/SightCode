/**
 * Helius Enhanced Transactions API provider (shared).
 *
 * The app's Helius credential lives inside SOLANA_RPC_URL
 * (https://mainnet.helius-rpc.com/?api-key=<KEY>) — no separate
 * HELIUS_API_KEY variable is required. This module derives the key once and
 * exposes typed helpers used by the token detail route (decoded token
 * transactions, related-wallet evidence) and the wallet activity route.
 *
 * Honesty rules: never fabricate rows. When no key is derivable or the API
 * fails, callers fall back to raw RPC signature feeds or explicit
 * "unavailable" states with explorer links.
 */

export interface HeliusTokenTransfer {
  fromUserAccount: string | null;
  toUserAccount: string | null;
  mint: string;
  tokenAmount: number;
}

export interface HeliusNativeTransfer {
  fromUserAccount: string | null;
  toUserAccount: string | null;
  /** Human-readable SOL amount (the API sends lamports; normalized here). */
  amount: number;
}

export interface HeliusEnhancedTx {
  signature: string;
  timestamp: number; // seconds
  type: string;
  description: string | null;
  feePayer?: string | null;
  primaryUser?: string | null;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
}

/** Extract a Helius API key from the configured Solana RPC URL (or standalone env). */
export function heliusApiKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const standalone = env.HELIUS_API_KEY?.trim();
  if (standalone) return standalone;
  const rpc = env.SOLANA_RPC_URL?.trim();
  if (!rpc || !/helius/i.test(rpc)) return null;
  try {
    const url = new URL(rpc);
    const key = url.searchParams.get("api-key");
    return key && key.trim() ? key.trim() : null;
  } catch {
    return null;
  }
}

import { SOLANA_MINTS } from "../chains";

/** Solana quote mints (canonical deployments, on-chain verified). */
const SOLANA_QUOTE_MINTS: Set<string> = new Set([
  SOLANA_MINTS.SOL,
  SOLANA_MINTS.USDC,
  SOLANA_MINTS.USDT,
]);

export type SolanaTxDirection = "buy" | "sell" | "transfer" | "unknown";

/**
 * Evidence-based direction for a decoded transaction, relative to the fee
 * payer. A swap requires a counter-leg: a canonical quote asset (WSOL / USDC /
 * USDT) or native SOL moving for the fee payer in the same transaction. A
 * token that simply moves to or from the fee payer without such a leg is
 * honest TRANSFER evidence — never labeled BUY/SELL.
 */
export function classifySolanaTxDirection(tx: HeliusEnhancedTx, tokenMint: string): SolanaTxDirection {
  const mint = tokenMint.toLowerCase();
  const mintTransfers = (tx.tokenTransfers ?? []).filter((tr) => tr.mint.toLowerCase() === mint);
  const feePayer = tx.feePayer ?? tx.primaryUser ?? null;
  if (!feePayer) return "unknown";
  const fp = feePayer.toLowerCase();
  const received = mintTransfers.some((tr) => tr.toUserAccount?.toLowerCase() === fp);
  const sent = mintTransfers.some((tr) => tr.fromUserAccount?.toLowerCase() === fp);
  if (received && sent) return "unknown";
  if (!received && !sent) return "unknown";
  // Counter-leg evidence: a canonical quote asset token transfer by the fee
  // payer, or a native SOL transfer above the fee floor (fees ≈ 5-10k lamports).
  const sentQuoteToken = (tx.tokenTransfers ?? []).some(
    (tr) => SOLANA_QUOTE_MINTS.has(tr.mint) && tr.fromUserAccount?.toLowerCase() === fp,
  );
  const receivedQuoteToken = (tx.tokenTransfers ?? []).some(
    (tr) => SOLANA_QUOTE_MINTS.has(tr.mint) && tr.toUserAccount?.toLowerCase() === fp,
  );
  const sentNativeSol = (tx.nativeTransfers ?? []).some(
    (tr) => tr.fromUserAccount?.toLowerCase() === fp && tr.amount > 0.001_000_000_001,
  );
  const receivedNativeSol = (tx.nativeTransfers ?? []).some(
    (tr) => tr.toUserAccount?.toLowerCase() === fp && tr.amount > 0.001_000_000_001,
  );
  const quoteSent = sentQuoteToken || sentNativeSol;
  const quoteReceived = receivedQuoteToken || receivedNativeSol;
  if (received && !sent && quoteSent) return "buy";
  if (sent && !received && quoteReceived) return "sell";
  return "transfer";
}

/**
 * GET /v0/addresses/{address}/transactions — decoded activity for any
 * address (wallet, token mint, or program). Returns null when no key is
 * available or the call fails; callers treat null as "enrichment unavailable".
 */
export async function heliusAddressTransactions(
  address: string,
  limit = 20,
  apiKey = heliusApiKey(),
): Promise<HeliusEnhancedTx[] | null> {
  if (!apiKey || !address) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${encodeURIComponent(apiKey)}&limit=${Math.min(Math.max(limit, 1), 100)}`,
      { headers: { accept: "application/json" }, signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return null;
    const rows: HeliusEnhancedTx[] = [];
    for (const raw of data) {
      const t = raw as Partial<HeliusEnhancedTx> & { tokenTransfers?: unknown };
      if (typeof t.signature !== "string" || !t.signature) continue;
      const transfers = Array.isArray(t.tokenTransfers)
        ? (t.tokenTransfers as unknown[])
            .filter(
              (x): x is HeliusTokenTransfer =>
                typeof (x as Partial<HeliusTokenTransfer>)?.mint === "string" &&
                typeof (x as Partial<HeliusTokenTransfer>)?.tokenAmount === "number",
            )
            .map((x) => ({
              fromUserAccount: typeof x.fromUserAccount === "string" ? x.fromUserAccount : null,
              toUserAccount: typeof x.toUserAccount === "string" ? x.toUserAccount : null,
              mint: x.mint,
              tokenAmount: typeof x.tokenAmount === "number" ? x.tokenAmount : 0,
            }))
        : [];
      const nativeTransfers = Array.isArray(t.nativeTransfers)
        ? (t.nativeTransfers as unknown[])
            .filter(
              (x): x is { fromUserAccount?: unknown; toUserAccount?: unknown; amount?: unknown } =>
                typeof (x as { amount?: unknown })?.amount === "number",
            )
            .map((x) => ({
              fromUserAccount: typeof x.fromUserAccount === "string" ? x.fromUserAccount : null,
              toUserAccount: typeof x.toUserAccount === "string" ? x.toUserAccount : null,
              // API sends lamports (1e9 per SOL).
              amount: typeof x.amount === "number" ? x.amount / 1e9 : 0,
            }))
        : [];
      rows.push({
        signature: t.signature,
        timestamp: typeof t.timestamp === "number" ? t.timestamp : 0,
        type: typeof t.type === "string" ? t.type : "UNKNOWN",
        description: typeof t.description === "string" ? t.description : null,
        feePayer: typeof t.feePayer === "string" ? t.feePayer : null,
        primaryUser: typeof t.primaryUser === "string" ? t.primaryUser : null,
        tokenTransfers: transfers,
        nativeTransfers,
      });
    }
    return rows;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Related-wallet evidence aggregation from decoded token transactions.
 * Counts how often each wallet appears in token transfers of the given mint
 * within the fetched window. Evidence-based only — no financial relationship
 * is implied. Excludes the mint address itself and null senders/receivers.
 */
export interface RelatedWalletEvidence {
  address: string;
  appearances: number;
  lastSeen: number | null; // epoch ms
  /** share of decoded transfers in the window that mention the wallet */
  share: number | null;
}

export function aggregateRelatedWallets(
  txs: HeliusEnhancedTx[],
  tokenMint: string,
  topN = 8,
): { wallets: RelatedWalletEvidence[]; transactionsScanned: number } {
  const mint = tokenMint.toLowerCase();
  const counts = new Map<string, { n: number; lastSeen: number }>();
  let scanned = 0;
  for (const tx of txs) {
    const transfers = (tx.tokenTransfers ?? []).filter((tr) => tr.mint.toLowerCase() === mint);
    if (transfers.length === 0) continue;
    scanned += 1;
    const ts = tx.timestamp > 0 ? tx.timestamp * 1000 : null;
    const walletsInTx = new Set<string>();
    for (const tr of transfers) {
      for (const w of [tr.fromUserAccount, tr.toUserAccount]) {
        if (w && w.toLowerCase() !== mint) walletsInTx.add(w);
      }
    }
    for (const w of walletsInTx) {
      const cur = counts.get(w) ?? { n: 0, lastSeen: 0 };
      cur.n += 1;
      if (ts && ts > cur.lastSeen) cur.lastSeen = ts;
      counts.set(w, cur);
    }
  }
  const total = scanned || 1;
  const wallets = [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, topN)
    .map(([address, c]) => ({
      address,
      appearances: c.n,
      lastSeen: c.lastSeen || null,
      share: Number((c.n / total).toFixed(4)),
    }));
  return { wallets, transactionsScanned: scanned };
}
