import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { CHAINS, isSolanaAddress, isEvmAddress, type ChainId } from "@/lib/chains";
import { classifyByHash, fetchInternalNative } from "@/lib/evm/evmRpc";

export const dynamic = "force-dynamic";

/**
 * GET /api/wallet/[chain]/[address] — recent wallet activity.
 *
 * Solana: real signature feed from RPC (latest signatures, status, time).
 * Decoded buy/sell classification requires a transaction indexer; without
 * one, rows are honestly labeled "signature" records with explorer links.
 * If HELIUS_API_KEY is configured, decoded summaries are fetched instead.
 *
 * EVM: transfer history via the configured Alchemy Enhanced API, plus
 * evidence-based swap-level classification (BUY/SELL/TRANSFER/LIQUIDITY/
 * UNKNOWN) derived from transaction receipts — see src/lib/evm/swapClassifier.ts.
 * Classification is additive: consumers reading only the transfer fields
 * continue to work unchanged.
 */
interface ClassifiedTokenField {
  asset: string;
  symbol: string | null;
  amount: number | null;
}

interface WalletActivity {
  chain: ChainId;
  address: string;
  coverage: "decoded" | "signatures" | "transfers" | "unavailable";
  note: string;
  transactions: {
    signature: string;
    timestamp: number | null;
    status: "confirmed" | "failed" | "pending" | "unknown";
    description: string | null;
    explorerUrl: string | null;
    /** Swap-level classification (EVM rows only; optional for compatibility). */
    classification?: "BUY" | "SELL" | "TRANSFER" | "LIQUIDITY" | "UNKNOWN";
    classificationConfidence?: "high" | "medium" | "low";
    classificationReason?: string;
    tokenIn?: ClassifiedTokenField | null;
    tokenOut?: ClassifiedTokenField | null;
    /** Quantity in the quote asset's own units — never a fabricated USD value. */
    quoteValue?: number | null;
    quoteCurrency?: string | null;
  }[];
  fetchedAt: number;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ chain: string; address: string }> }) {
  const { chain: chainId, address } = await ctx.params;
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain || chain.status === "unconfigured") {
    return NextResponse.json({ error: `Wallet activity is not available for "${chainId}".` }, { status: 400 });
  }
  const fetchedAt = Date.now();

  if (chain.kind === "solana") {
    if (!isSolanaAddress(address)) return NextResponse.json({ error: "invalid Solana address" }, { status: 400 });
    const conn = new Connection(process.env.SOLANA_RPC_URL || chain.defaultRpc, "confirmed");
    try {
      const sigs = await conn.getSignaturesForAddress(new PublicKey(address), { limit: 15 });
      // Optional decoded enrichment when a Helius key is configured.
      const heliusKey = process.env.HELIUS_API_KEY;
      if (heliusKey) {
        try {
          const res = await fetch(
            `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusKey}&limit=15`,
            { headers: { accept: "application/json" } },
          );
          if (res.ok) {
            const data = (await res.json()) as {
              signature?: string;
              timestamp?: number;
              type?: string;
              description?: string;
            }[];
            const txs = data.map((t) => ({
              signature: t.signature ?? "",
              timestamp: t.timestamp ? t.timestamp * 1000 : null,
              status: "confirmed" as const,
              description: t.description ?? null,
              explorerUrl: CHAINS.solana.explorer?.tx(t.signature ?? "") ?? null,
            }));
            const out: WalletActivity = {
              chain: "solana",
              address,
              coverage: "decoded",
              note: "Decoded activity via Helius Enhanced Transactions API.",
              transactions: txs,
              fetchedAt,
            };
            return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
          }
        } catch {
          // fall through to the signature feed
        }
      }
      const out: WalletActivity = {
        chain: "solana",
        address,
        coverage: "signatures",
        note: "Raw signature feed from Solana RPC. Buy/sell classification requires a transaction indexer (Helius) — configure HELIUS_API_KEY for decoded activity.",
        transactions: sigs.map((s) => ({
          signature: s.signature,
          timestamp: s.blockTime ? s.blockTime * 1000 : null,
          status: s.err ? ("failed" as const) : ("confirmed" as const),
          description: null,
          explorerUrl: CHAINS.solana.explorer?.tx(s.signature) ?? null,
        })),
        fetchedAt,
      };
      return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return NextResponse.json({ error: `RPC failure: ${String(e).slice(0, 160)}` }, { status: 502 });
    }
  }

  // ---- EVM: recent asset transfers via the configured Alchemy RPC ----
  // alchemy_getAssetTransfers is part of the existing Alchemy integration
  // (no new credentials). Verified live on eth/bnb/base-mainnet.g.alchemy.com.
  // Direction is relative to the queried wallet: fromAddress -> out,
  // toAddress -> in. Swap-level buy/sell classification still needs deeper
  // indexing — rows are honest transfer records, not fabricated trades.
  if (!isEvmAddress(address)) return NextResponse.json({ error: "invalid EVM address" }, { status: 400 });
  const rpcUrl = process.env[chain.rpcEnvKey] || chain.defaultRpc;
  if (!/alchemy\.com/i.test(rpcUrl)) {
    const out: WalletActivity = {
      chain: chainId as ChainId,
      address,
      coverage: "unavailable",
      note: `Transfer history on ${chain.name} requires an Enhanced-API RPC provider (e.g. Alchemy). The configured endpoint does not expose it — use ${chain.explorer?.name ?? "the block explorer"} for the complete history.`,
      transactions: [],
      fetchedAt,
    };
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  }

  async function assetTransfers(params: Record<string, unknown>): Promise<Record<string, unknown>[] | null> {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "alchemy_getAssetTransfers",
          params: [
            {
              withMetadata: true,
              fromBlock: "0x0",
              toBlock: "latest",
              maxCount: "0x12",
              category: ["external", "erc20"],
              ...params,
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const j = (await res.json()) as { result?: { transfers?: Record<string, unknown>[] }; error?: unknown };
      return j.result?.transfers ?? null;
    } catch {
      return null;
    }
  }

  const [outgoing, incoming] = await Promise.all([
    assetTransfers({ fromAddress: address }),
    assetTransfers({ toAddress: address }),
  ]);
  if (outgoing === null && incoming === null) {
    return NextResponse.json({ error: `Transfer lookup failed on ${chain.name}.` }, { status: 502 });
  }
  const seen = new Set<string>();
  const rows: WalletActivity["transactions"] = [];
  const push = (t: Record<string, unknown>, dir: "in" | "out") => {
    const hash = typeof t.hash === "string" ? t.hash : "";
    const uniqueId = typeof t.uniqueId === "string" ? t.uniqueId : hash;
    const dedupeKey = `${uniqueId}:${dir}`;
    if (!hash || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const meta = (t.metadata ?? {}) as { blockTimestamp?: unknown };
    const ts = typeof meta.blockTimestamp === "string" ? Date.parse(meta.blockTimestamp) : null;
    const value = typeof t.value === "number" ? t.value : null;
    let asset = "asset";
    if (typeof t.asset === "string" && t.asset) asset = t.asset;
    else if (t.rawContract && typeof t.rawContract === "object") {
      const rc = t.rawContract as { address?: unknown };
      if (typeof rc.address === "string") asset = `token ${rc.address.slice(0, 10)}…`;
    }
    const category = typeof t.category === "string" ? t.category : "unknown";
    rows.push({
      signature: hash,
      timestamp: ts && !Number.isNaN(ts) ? ts : null,
      status: "confirmed" as const,
      description: `${dir === "in" ? "Received" : "Sent"} ${value !== null ? value : "value unavailable"} ${asset} (${category})`,
      explorerUrl: chain.explorer?.tx(hash) ?? null,
    });
  };
  for (const t of outgoing ?? []) push(t, "out");
  for (const t of incoming ?? []) push(t, "in");
  rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

  // Evidence-based swap classification over the unique tx hashes actually
  // being returned (bounded <=12; batched + TTL-cached in evmRpc.ts). Rows with
  // missing receipts are served unclassified — never guessed.
  const classifyChain = chainId as "ethereum" | "bsc" | "base";
  const uniqueHashes = [...new Set(rows.map((r) => r.signature))].slice(0, 12);
  const internalNative = await fetchInternalNative(rpcUrl, address);
  const byHash = new Map<string, NonNullable<Awaited<ReturnType<typeof classifyByHash>>>>();
  await Promise.all(
    uniqueHashes.map(async (h) => {
      const c = await classifyByHash({
        rpcUrl,
        wallet: address,
        chainId: classifyChain,
        nativeSymbol: chain.nativeToken.symbol,
        hash: h,
        internalNative,
      });
      if (c) byHash.set(h.toLowerCase(), c);
    }),
  );
  for (const row of rows) {
    const c = byHash.get(row.signature.toLowerCase());
    if (!c) continue;
    row.classification = c.classification;
    row.classificationConfidence = c.classificationConfidence;
    row.classificationReason = c.classificationReason;
    row.tokenIn = c.tokenIn;
    row.tokenOut = c.tokenOut;
    row.quoteValue = c.quoteValue;
    row.quoteCurrency = c.quoteCurrency;
    // A receipt-proven revert upgrades the honest status without touching anything else.
    if (c.classificationReason.startsWith("transaction reverted")) row.status = "failed";
  }

  const classifiedCount = rows.filter((r) => r.classification).length;
  const out: WalletActivity = {
    chain: chainId as ChainId,
    address,
    coverage: "transfers",
    note: `Recent asset transfers (external + ERC-20) via the configured Alchemy RPC, with receipt-evidence swap classification on up to 12 transactions (${classifiedCount} classified here; reverted/missing-receipt/ambiguous transactions stay UNKNOWN or unclassified). USD values are not fabricated — quote amounts are shown in the quote asset's own units.`,
    transactions: rows.slice(0, 15),
    fetchedAt,
  };
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
