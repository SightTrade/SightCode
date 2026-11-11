/**
 * Server-side EVM RPC helpers for swap classification.
 *
 * Rate-limit discipline:
 *   - JSON-RPC BATCHING: receipts and tx bodies are fetched in a single batched
 *     request each (≤12 hashes per run), not one request per hash.
 *   - TTL caches: receipts (5 min), symbol/decimals (1 h), internal transfers
 *     (60 s) — repeated UI views never re-bill the provider.
 *   - Bounded: ≤12 classified transactions per wallet-activity request.
 *   - Timeouts on every upstream call; graceful null on failure (the route
 *     then serves unclassified transfer rows instead of guessing).
 *
 * Uses the same configured Alchemy endpoints as the rest of the app — no new
 * credentials, no paid-tier calls beyond what the existing free integration
 * already exposes (alchemy_getAssetTransfers verified on all three chains).
 */
import {
  classifyEvmTransaction,
  type EvmChainId,
  type EvmClassification,
  type InternalNativeTransfer,
} from "./swapClassifier";

const RECEIPT_TTL_MS = 5 * 60_000;
const META_TTL_MS = 60 * 60_000;
const INTERNAL_TTL_MS = 60_000;
const TIMEOUT_MS = 20_000;
const MAX_BATCH = 12;

/** Minimal TTL cache (same pattern as src/lib/providers/fetchJson.ts). */
class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();
  constructor(private ttlMs: number, private maxEntries = 300) {}
  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

const receiptCache = new TtlCache<{ tx: unknown; receipt: unknown }>(RECEIPT_TTL_MS);
const symbolCache = new TtlCache<{ symbol: string | null; decimals: number | null }>(META_TTL_MS);
const internalCache = new TtlCache<InternalNativeTransfer[]>(INTERNAL_TTL_MS);

async function batchRpc(rpcUrl: string, calls: { method: string; params: unknown[] }[]): Promise<({ result?: unknown; error?: unknown } | null)[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, ...c }))),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return calls.map(() => null);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return calls.map(() => null);
    const byId = new Map<number, { result?: unknown; error?: unknown }>();
    for (const item of body) {
      const r = item as { id?: unknown; result?: unknown; error?: unknown };
      if (typeof r.id === "number") byId.set(r.id, { result: r.result, error: r.error });
    }
    return calls.map((_, i) => byId.get(i + 1) ?? null);
  } catch {
    return calls.map(() => null);
  } finally {
    clearTimeout(timer);
  }
}

export interface EvmTxWithReceipt {
  tx: { from: string; to: string | null; value: bigint } | null;
  receipt: {
    status: string | null;
    logs: { address: string; topics: (string | null)[]; data: string }[];
  } | null;
}

/** Batched receipt + tx-body fetch for up to MAX_BATCH hashes (TTL-cached). */
export async function fetchReceiptsAndTxs(
  rpcUrl: string,
  hashes: string[],
): Promise<Map<string, EvmTxWithReceipt>> {
  const out = new Map<string, EvmTxWithReceipt>();
  const missing: string[] = [];
  for (const h of hashes.slice(0, MAX_BATCH)) {
    const hit = receiptCache.get(h.toLowerCase());
    if (hit) out.set(h, normalize(hit));
    else missing.push(h);
  }
  if (missing.length === 0) return out;

  const calls = [
    ...missing.map((h) => ({ method: "eth_getTransactionReceipt", params: [h] })),
    ...missing.map((h) => ({ method: "eth_getTransactionByHash", params: [h] })),
  ];
  const results = await batchRpc(rpcUrl, calls);
  const receipts = results.slice(0, missing.length);
  const txs = results.slice(missing.length);
  missing.forEach((h, i) => {
    const raw = { receipt: receipts[i]?.result ?? null, tx: txs[i]?.result ?? null };
    receiptCache.set(h.toLowerCase(), raw);
    out.set(h, normalize(raw));
  });
  return out;
}

function normalize(raw: { receipt: unknown; tx: unknown }): EvmTxWithReceipt {
  const r = raw.receipt as { status?: unknown; logs?: unknown } | null;
  const t = raw.tx as { from?: unknown; to?: unknown; value?: unknown } | null;
  const logs = Array.isArray(r?.logs)
    ? (r!.logs as { address?: unknown; topics?: unknown; data?: unknown }[]).map((l) => ({
        address: typeof l.address === "string" ? l.address : "",
        topics: Array.isArray(l.topics) ? (l.topics as unknown[]).map((x) => (typeof x === "string" ? x : null)) : [],
        data: typeof l.data === "string" ? l.data : "0x",
      }))
    : [];
  let value = 0n;
  try {
    value = typeof t?.value === "string" ? BigInt(t.value) : 0n;
  } catch {
    value = 0n;
  }
  return {
    tx: t && typeof t.from === "string" ? { from: t.from, to: typeof t.to === "string" ? t.to : null, value } : null,
    receipt: r ? { status: typeof r.status === "string" ? r.status : null, logs } : null,
  };
}


/**
 * Internal native transfers for a wallet (alchemy_getAssetTransfers, category
 * "internal"). Captures native movements beyond the top-level tx value — e.g.
 * a pool returning ETH to the wallet inside a sell swap.
 */
export async function fetchInternalNative(rpcUrl: string, wallet: string): Promise<InternalNativeTransfer[]> {
  const key = wallet.toLowerCase();
  const hit = internalCache.get(key);
  if (hit) return hit;
  // DEX pools return native currency to wallets via internal transactions on
  // the to-side of alchemy_getAssetTransfers. Fetching only fromAddress breaks
  // SELL classification, so we must query both directions and merge.
  const fetchDirection = async (dir: "from" | "to"): Promise<InternalNativeTransfer[]> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "alchemy_getAssetTransfers",
          params: [
            {
              category: ["internal"],
              withMetadata: false,
              fromBlock: "0x0",
              toBlock: "latest",
              maxCount: "0x24",
              ...(dir === "from" ? { fromAddress: wallet } : { toAddress: wallet }),
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) return [];
      const j = (await res.json()) as { result?: { transfers?: { from?: unknown; to?: unknown; value?: unknown; hash?: unknown }[] } };
      return (j.result?.transfers ?? [])
        .map((t) => ({
          from: typeof t.from === "string" ? t.from : "",
          to: typeof t.to === "string" ? t.to : "",
          value:
            typeof t.value === "number" && Number.isFinite(t.value)
              ? BigInt(Math.round(t.value * 1e18))
              : 0n,
          hash: typeof t.hash === "string" ? t.hash.toLowerCase() : "",
        }))
        .filter((t) => t.value > 0n);
    } catch {
      return [];
    }
  };
  try {
    const [outgoing, incoming] = await Promise.all([fetchDirection("from"), fetchDirection("to")]);
    // De-duplicate by unique tx hash + from + to + value, merging both directions.
    const seen = new Set<string>();
    const transfers: InternalNativeTransfer[] = [];
    for (const t of [...outgoing, ...incoming]) {
      const dedupeKey = `${t.hash}:${t.from}:${t.to}:${t.value.toString()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      transfers.push(t);
    }
    internalCache.set(key, transfers);
    return transfers;
  } catch {
    internalCache.set(key, []);
    return [];
  }
}

const SYMBOL_SELECTOR = "0x95d89b41"; // symbol()
const DECIMALS_SELECTOR = "0x313ce567"; // decimals()

/** Batched symbol/decimals enrichment for non-quote tokens (TTL-cached). */
export async function fetchTokenMeta(
  rpcUrl: string,
  assets: string[],
): Promise<Map<string, { symbol: string | null; decimals: number | null }>> {
  const out = new Map<string, { symbol: string | null; decimals: number | null }>();
  const missing: string[] = [];
  for (const a of assets) {
    const hit = symbolCache.get(a);
    if (hit) out.set(a, hit);
    else missing.push(a);
  }
  if (missing.length === 0) return out;
  const calls = [
    ...missing.map((a) => ({ method: "eth_call", params: [{ to: a, data: SYMBOL_SELECTOR }, "latest"] })),
    ...missing.map((a) => ({ method: "eth_call", params: [{ to: a, data: DECIMALS_SELECTOR }, "latest"] })),
  ];
  const results = await batchRpc(rpcUrl, calls);
  const symbols = results.slice(0, missing.length);
  const decimals = results.slice(missing.length);
  missing.forEach((a, i) => {
    const dec = hexToNumber(decimals[i]?.result);
    const meta = {
      symbol: decodeString(symbols[i]?.result),
      decimals: dec !== null && dec <= 36 ? dec : null,
    };
    symbolCache.set(a, meta);
    out.set(a, meta);
  });
  return out;
}

function decodeString(result: unknown): string | null {
  if (typeof result !== "string" || result.length < 2 || result === "0x") return null;
  try {
    // ABI dynamic string: offset (32B) + length (32B) + data.
    const data = result.slice(2);
    const len = Number(BigInt("0x" + data.slice(64, 128)));
    if (len <= 0 || len > 64) return null;
    const bytes = data.slice(128, 128 + len * 2);
    const str = Buffer.from(bytes, "hex").toString("utf8");
    return /^[\x20-\x7e]{1,32}$/.test(str) ? str : null;
  } catch {
    return null;
  }
}

function hexToNumber(result: unknown): number | null {
  if (typeof result !== "string" || result === "0x") return null;
  try {
    const n = Number(BigInt(result));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}


export interface ClassifiedRow {
  classification: EvmClassification["classification"];
  classificationConfidence: EvmClassification["classificationConfidence"];
  classificationReason: string;
  tokenIn: { asset: string; symbol: string | null; amount: number | null } | null;
  tokenOut: { asset: string; symbol: string | null; amount: number | null } | null;
  quoteValue: number | null;
  quoteCurrency: string | null;
}

/**
 * Full classification pipeline for one transaction, using cached RPC data.
 * Returns null when the receipt could not be fetched (the route then serves an
 * unclassified row — never a fabricated classification).
 */
export async function classifyByHash(input: {
  rpcUrl: string;
  wallet: string;
  chainId: EvmChainId;
  nativeSymbol: string;
  hash: string;
  internalNative: InternalNativeTransfer[];
}): Promise<ClassifiedRow | null> {
  const { tx, receipt } = (await fetchReceiptsAndTxs(input.rpcUrl, [input.hash])).get(input.hash.toLowerCase()) ?? {
    tx: null,
    receipt: null,
  };
  if (!receipt) return null;
  const hashInternal = input.internalNative.filter((t) => t.hash === input.hash.toLowerCase());
  const base = classifyEvmTransaction({
    wallet: input.wallet,
    chainId: input.chainId,
    nativeSymbol: input.nativeSymbol,
    tx,
    receipt,
    internalNative: hashInternal,
  });
  // Symbol enrichment for any non-quote token referenced by the classification.
  const assets = [base.tokenIn?.asset, base.tokenOut?.asset].filter(
    (a): a is string => typeof a === "string" && a !== "native",
  );
  const meta = assets.length
    ? await fetchTokenMeta(input.rpcUrl, assets)
    : new Map<string, { symbol: string | null; decimals: number | null }>();
  const withSymbol = (t: ClassifiedRow["tokenIn"]) =>
    t ? { ...t, symbol: t.symbol ?? meta.get(t.asset)?.symbol ?? null } : null;
  return {
    classification: base.classification,
    classificationConfidence: base.classificationConfidence,
    classificationReason: base.classificationReason,
    tokenIn: withSymbol(base.tokenIn),
    tokenOut: withSymbol(base.tokenOut),
    quoteValue: base.quoteValue,
    quoteCurrency: base.quoteCurrency,
  };
}

/**
 * Recent ERC-20 transfer feed for one token (Alchemy Enhanced API with a
 * `contractAddresses` filter). This is the activity anchor for token pages on
 * EVM: the token, not a wallet, is what we query for. Returns null when the
 * provider lookup fails — the route then serves an honest "unavailable" state,
 * never fabricated rows. TTL-cached 60 s so repeated views don't re-bill.
 */
export interface TokenTransferFeedRow {
  hash: string;
  from: string | null;
  to: string | null;
  /** Human-readable token amount (Alchemy applies token decimals). */
  value: number | null;
  /** Block timestamp epoch ms (from withMetadata). */
  timestamp: number | null;
  /** Hex block number of the transfer — for block-scoped internal lookups. */
  blockHex: string | null;
}

const tokenFeedCache = new TtlCache<TokenTransferFeedRow[]>(60_000);

export async function fetchTokenTransferFeed(
  rpcUrl: string,
  tokenAddress: string,
): Promise<TokenTransferFeedRow[] | null> {
  const key = `${rpcUrl}|${tokenAddress.toLowerCase()}`;
  const hit = tokenFeedCache.get(key);
  if (hit) return hit;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [
          {
            category: ["erc20"],
            contractAddresses: [tokenAddress],
            withMetadata: true,
            fromBlock: "0x0",
            toBlock: "latest",
            maxCount: "0x18",
            order: "desc",
          },
        ],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: { transfers?: Record<string, unknown>[] }; error?: unknown };
    if (j.error || !Array.isArray(j.result?.transfers)) return null;
    const rows: TokenTransferFeedRow[] = [];
    for (const t of j.result!.transfers!) {
      const hash = typeof t.hash === "string" ? t.hash : "";
      if (!hash) continue;
      const meta = (t.metadata ?? {}) as { blockTimestamp?: unknown };
      const ts = typeof meta.blockTimestamp === "string" ? Date.parse(meta.blockTimestamp) : null;
      rows.push({
        hash,
        from: typeof t.from === "string" ? t.from : null,
        to: typeof t.to === "string" ? t.to : null,
        value: typeof t.value === "number" && Number.isFinite(t.value) ? t.value : null,
        timestamp: ts !== null && !Number.isNaN(ts) ? ts : null,
        // Alchemy exposes the block number at the top level as a hex string.
        blockHex: typeof t.blockNum === "string" && /^0x[0-9a-fA-F]+$/.test(t.blockNum) ? t.blockNum : null,
      });
    }
    // Newest first (defensive — provider order is not contractual).
    rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    tokenFeedCache.set(key, rows);
    return rows;
  } catch {
    return null;
  }
}

/**
 * Internal (contract-mediated) native transfers for one wallet within ONE
 * block. Token-page classification runs against each transaction's sender, who
 * differs per row — a full-history scan per sender would be wasteful, so this
 * helper scopes the Enhanced-API internal-category query to the exact block and
 * merges both directions (DEX routers return native currency to the sender via
 * internal transfers; both sides are needed for SELL evidence). TTL-cached.
 */
const internalBlockCache = new TtlCache<InternalNativeTransfer[]>(60_000);

export async function fetchInternalNativeInBlock(
  rpcUrl: string,
  wallet: string,
  blockHex: string,
): Promise<InternalNativeTransfer[]> {
  const key = `${rpcUrl}|${wallet.toLowerCase()}|${blockHex.toLowerCase()}`;
  const hit = internalBlockCache.get(key);
  if (hit) return hit;
  const scan = async (dir: "from" | "to"): Promise<InternalNativeTransfer[]> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "alchemy_getAssetTransfers",
          params: [
            {
              category: ["internal"],
              withMetadata: false,
              fromBlock: blockHex,
              toBlock: blockHex,
              maxCount: "0x24",
              ...(dir === "from" ? { fromAddress: wallet } : { toAddress: wallet }),
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) return [];
      const j = (await res.json()) as {
        result?: { transfers?: { from?: unknown; to?: unknown; value?: unknown; hash?: unknown }[] };
        error?: unknown;
      };
      if (!Array.isArray(j.result?.transfers)) return [];
      return j.result!.transfers!
        .map((t) => ({
          from: typeof t.from === "string" ? t.from : "",
          to: typeof t.to === "string" ? t.to : "",
          value: typeof t.value === "number" && Number.isFinite(t.value) ? BigInt(Math.round(t.value * 1e18)) : 0n,
          hash: typeof t.hash === "string" ? t.hash.toLowerCase() : "",
        }))
        .filter((t) => t.value > 0n && t.hash !== "");
    } catch {
      return [];
    }
  };
  try {
    const [outgoing, incoming] = await Promise.all([scan("from"), scan("to")]);
    const seen = new Set<string>();
    const transfers: InternalNativeTransfer[] = [];
    for (const t of [...outgoing, ...incoming]) {
      const dk = `${t.hash}:${t.from}:${t.to}:${t.value.toString()}`;
      if (seen.has(dk)) continue;
      seen.add(dk);
      transfers.push(t);
    }
    internalBlockCache.set(key, transfers);
    return transfers;
  } catch {
    return [];
  }
}
