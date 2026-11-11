import { NextRequest, NextResponse } from "next/server";
import { CHAINS, type ChainConfig } from "@/lib/chains";
import { dexPairToSummary, dexTokens, bestPairForToken } from "@/lib/providers/dexscreener";
import { gtToken, gtTokenInfo, gtTokenPools } from "@/lib/providers/geckoterminal";
import { heliusAddressTransactions, aggregateRelatedWallets, classifySolanaTxDirection } from "@/lib/providers/helius";
import {
  fetchReceiptsAndTxs,
  fetchTokenMeta,
  fetchTokenTransferFeed,
  fetchInternalNativeInBlock,
  type TokenTransferFeedRow,
} from "@/lib/evm/evmRpc";
import { classifyEvmTransaction, type EvmChainId } from "@/lib/evm/swapClassifier";
import { discoverySnapshot } from "@/lib/discovery/hub";
import { jupTokenByMint } from "@/lib/providers/jupiter";
import { getMintInfo, getHolderConcentration, getTopHolders } from "@/lib/providers/solanaRpc";
import { buildRiskReview } from "@/lib/risk";
import { sanitizeText, isSafeImageUrl } from "@/lib/format";
import type { TokenDetail, TokenSummary, TokenActivityDirection, RelatedWallet } from "@/lib/types";

/**
 * Venue fallback for brand-new tokens that DexScreener has not indexed with
 * real liquidity yet: (1) the real-time discovery hub's pool store — pools
 * observed via PumpPortal streams / GT pollers within the last minutes;
 * (2) GeckoTerminal's token-pools endpoint. Returns [] when neither source
 * has a pool — the UI then honestly reports "no active pool yet".
 */
async function extraVenues(
  chainId: string,
  chain: ChainConfig,
  address: string,
): Promise<TokenDetail["venues"]> {
  const out: TokenDetail["venues"] = [];
  try {
    const snap = discoverySnapshot();
    for (const pl of snap.pools) {
      if (pl.chain !== chainId) continue;
      if (pl.baseTokenAddress.toLowerCase() !== address.toLowerCase()) continue;
      out.push({
        venue: pl.dexName ?? "Discovered pool",
        poolAddress: pl.poolAddress,
        liquidityUsd: pl.liquidityUsd,
        volume24hUsd: pl.volume24hUsd,
        url: null,
      });
    }
    out.sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1));
  } catch {
    /* hub adapters disabled — fall through to GeckoTerminal */
  }
  if (out.length === 0 && chain.geckoNetwork) {
    const pools = await gtTokenPools(chain.geckoNetwork, address);
    for (const pl of pools.slice(0, 8)) {
      const a = pl.attributes;
      out.push({
        venue: a.dex_id ? `${a.dex_id} (GeckoTerminal)` : "GeckoTerminal pool",
        poolAddress: a.address,
        liquidityUsd: a.reserve_in_usd != null ? Number(a.reserve_in_usd) : null,
        volume24hUsd: a.h24_volume_usd != null ? Number(a.h24_volume_usd) : null,
        url: `https://www.geckoterminal.com/${chain.geckoNetwork}/pools/${a.address}`,
      });
    }
  }
  return out;
}

export const dynamic = "force-dynamic";

/**
 * GET /api/token/[chain]/[address]
 * Aggregates: best pair (DexScreener), venues, token metadata
 * (GeckoTerminal info / Jupiter for Solana), and real risk checks.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ chain: string; address: string }> }) {
  const { chain: chainId, address } = await ctx.params;
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) return NextResponse.json({ error: `Unknown chain "${chainId}"` }, { status: 400 });
  if (chain.status === "unconfigured") {
    return NextResponse.json(
      { error: `${chain.name} is not configured yet. ${chain.capabilityNote}` },
      { status: 501 },
    );
  }

  const fetchedAt = Date.now();
  const providerNotes: string[] = [];

  // 1. Pairs from DexScreener (venues + best pair).
  const pairs = await dexTokens([chain.dexscreenerChain!], [address]).catch((e) => {
    providerNotes.push(`DexScreener lookup failed: ${String(e).slice(0, 120)}`);
    return [];
  });
  const best = bestPairForToken(pairs, chain.dexscreenerChain!, address);
  const baseSymbol = best?.baseToken.symbol ?? "—";
  const baseName = best?.baseToken.name ?? "Unknown";

  let summary: TokenSummary =
    (best ? dexPairToSummary(best, fetchedAt) : null) ??
    ({
      chain: chain.id,
      address,
      symbol: baseSymbol,
      name: baseName,
      image: null,
      priceUsd: null,
      priceChange: { m5: null, h1: null, h6: null, h24: null },
      marketCapUsd: null,
      fdvUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      txns24h: { buys: null, sells: null },
      traders24h: null,
      createdAt: null,
      creationSource: null,
      venue: null,
      poolAddress: null,
      dataSource: best ? "DexScreener" : "unavailable",
      fetchedAt,
    } satisfies TokenSummary);

  // Token decimals: on-chain for Solana; unavailable on EVM without an explorer key.
  let decimals: number | null = null;

  // 2. GeckoTerminal token data + about/socials.
  let gtScore: number | null = null;
  /** Decoded activity evidence (Solana only) — null when no indexer data. */
  let activity: TokenDetail["activity"] = null;
  /** Largest token accounts (Solana only, direct RPC) — null on other chains. */
  let holdersData: TokenDetail["holders"] = null;
  if (chain.geckoNetwork) {
    const [tokenRes, infoRes] = await Promise.all([
      gtToken(chain.geckoNetwork, address),
      gtTokenInfo(chain.geckoNetwork, address),
    ]);
    if (tokenRes) {
      const a = tokenRes.data.attributes;
      const price = a.price_usd ? Number(a.price_usd) : null;
      const reserve = a.total_reserve_in_usd ? Number(a.total_reserve_in_usd) : null;
      if (price !== null) summary.priceUsd = price;
      if (reserve !== null) summary.liquidityUsd = reserve;
      if (a.image_url && isSafeImageUrl(a.image_url)) summary.image = a.image_url;
      if (!best) summary.dataSource = "GeckoTerminal";
    } else if (pairs.length === 0) {
      providerNotes.push("Token not indexed by GeckoTerminal yet.");
    }
    if (infoRes) {
      gtScore = infoRes.gtScore;
      const about: TokenDetail["about"] = {
        description: sanitizeText(infoRes.description) || null,
        twitter: infoRes.twitter,
        website: infoRes.websites?.[0] ?? null,
        telegram: infoRes.telegram,
      };
      // 3. Solana-only enrichment + risk data.
      let mintInfo: Awaited<ReturnType<typeof getMintInfo>> = null;
      let holders: Awaited<ReturnType<typeof getHolderConcentration>> = null;
      let organicScore: number | null = null;
      if (chain.kind === "solana") {
        [mintInfo, holders] = await Promise.all([getMintInfo(address), getHolderConcentration(address)]);
        if (mintInfo?.decimals != null) decimals = mintInfo.decimals;
        const [jup, topHolders] = await Promise.all([
          jupTokenByMint(address).catch(() => null),
          getTopHolders(address, 15),
        ]);
        if (jup) {
          organicScore = jup.organicScore ?? null;
          if (jup.holderCount != null) {
            providerNotes.push(`Jupiter reports ${jup.holderCount.toLocaleString()} holders.`);
          }
        }
        if (topHolders) {
          holdersData = {
            source: "Solana RPC — getTokenLargestAccounts + parsed accounts",
            note: "Largest token accounts (current balances) read directly from RPC. Pool, vault and custody accounts are indistinguishable from personal wallets and are included as-is. Historical holdings are not available without an indexer.",
            accountsExamined: topHolders.holders.length,
            supply: topHolders.supply,
            fetchedAt,
            holders: topHolders.holders,
          };
        }
        // 3a. Decoded activity + related-wallet evidence (Helius Enhanced API).
        // The key is derived from the configured Helius RPC URL; when absent or
        // the call fails, activity stays null and the UI shows the honest
        // "needs decoded data" placeholder — never fabricated rows.
        const heliusTxs = await heliusAddressTransactions(address, 40);
        if (heliusTxs !== null) {
          const agg = aggregateRelatedWallets(heliusTxs, address);
          if (agg.transactionsScanned > 0) {
            activity = {
              state: "available",
              coverage: "decoded",
              note: `Decoded via Helius Enhanced API — ${agg.transactionsScanned} of the last ${heliusTxs.length} transactions mention this mint. Direction is inferred from decoded transfers relative to the tx fee payer (quote-leg evidence required) and is labeled estimated.`,
              transactionsScanned: agg.transactionsScanned,
              transactionsReturned: heliusTxs.length,
              fetchedAt,
              transactions: heliusTxs
                .filter((tx) => (tx.tokenTransfers ?? []).some((tr) => tr.mint.toLowerCase() === address.toLowerCase()))
                .slice(0, 10)
                .map((tx) => ({
                  signature: tx.signature,
                  timestamp: tx.timestamp > 0 ? tx.timestamp * 1000 : null,
                  kind: tx.type,
                  direction: classifySolanaTxDirection(tx, address),
                  description: tx.description,
                  explorerUrl: chain.explorer?.tx(tx.signature) ?? null,
                })),
              wallets: agg.wallets,
            };
          } else {
            const created = heliusTxs.some((tx) => tx.type === "CREATE" || tx.type === "TOKEN_MINT");
            activity = {
              state: created ? "created-no-trades" : "empty",
              coverage: "decoded",
              note: created
                ? `Token created (mint lifecycle observed via Helius) but no confirmed trades decoded in the last ${heliusTxs.length} transactions yet. Refresh continues automatically.`
                : heliusTxs.length === 0
                  ? "No transactions discovered yet — the indexer has no recent data for this mint. New trades will appear automatically when they land."
                  : `The indexer returned ${heliusTxs.length} transactions for this mint but none mention token transfers of it in the recent window.`,
              transactionsScanned: 0,
              transactionsReturned: heliusTxs.length,
              fetchedAt,
              transactions: [],
              wallets: agg.wallets,
            };
          }
        } else {
          providerNotes.push("Helius decoded-activity lookup failed or is not configured — the Transactions tab cannot verify trades right now.");
        }
      } else if (chain.kind === "evm") {
        // 3b. EVM activity: recent transfers of THIS token via the Alchemy
        // Enhanced API, with receipt-evidence direction classification from
        // each transaction's sender (same swapClassifier as the wallet page).
        // Missing receipts or provider failures stay unclassified/unavailable —
        // rows are never guessed, and quote amounts are never fabricated in USD.
        const rpcUrl = process.env[chain.rpcEnvKey] || chain.defaultRpc;
        const symbolLabel = summary.symbol && summary.symbol !== "—" ? summary.symbol : "token";
        if (!/alchemy\.com/i.test(rpcUrl)) {
          activity = {
            state: "unavailable",
            coverage: "decoded",
            note: `Token activity on ${chain.name} requires an Enhanced-API RPC provider (Alchemy). The configured endpoint does not expose it — use ${chain.explorer?.name ?? "the block explorer"} for the complete history.`,
            transactionsScanned: 0,
            transactionsReturned: 0,
            fetchedAt,
            transactions: [],
            wallets: [],
          };
          providerNotes.push("Token activity lookup is not configured for this network — the Transactions tab cannot verify trades right now.");
        } else {
          const feed = await fetchTokenTransferFeed(rpcUrl, address);
          if (feed === null) {
            activity = {
              state: "unavailable",
              coverage: "decoded",
              note: `The transfer lookup failed on ${chain.name} — no verified activity can be shown. This is a provider issue, not a token problem; refresh shortly or use ${chain.explorer?.name ?? "the block explorer"}.`,
              transactionsScanned: 0,
              transactionsReturned: 0,
              fetchedAt,
              transactions: [],
              wallets: [],
            };
            providerNotes.push(`Token activity lookup failed on ${chain.name} (Alchemy Enhanced API) — the Transactions tab cannot verify trades right now.`);
          } else if (feed.length === 0) {
            activity = {
              state: "empty",
              coverage: "decoded",
              note: "No transfer activity decoded for this token yet — the indexer returned nothing for it. New trades appear automatically when they land.",
              transactionsScanned: 0,
              transactionsReturned: 0,
              fetchedAt,
              transactions: [],
              wallets: [],
            };
          } else {
            // Group the feed by transaction (one tx can move the token several
            // times — amounts are aggregated), newest first, bounded like the
            // wallet page (≤12 classified transactions per request).
            const byHash = new Map<string, TokenTransferFeedRow[]>();
            for (const r of feed) {
              const list = byHash.get(r.hash);
              if (list) list.push(r);
              else byHash.set(r.hash, [r]);
            }
            const txGroups = [...byHash.entries()];
            const uniqueHashCount = txGroups.length;
            const bounded = txGroups.slice(0, 12);
            const receipts = await fetchReceiptsAndTxs(
              rpcUrl,
              bounded.map(([h]) => h),
            );
            const selfLower = address.toLowerCase();
            const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
            const fmtAmt = (v: number) =>
              v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(Math.round(v * 1e6) / 1e6);
            const txRows: NonNullable<TokenDetail["activity"]>["transactions"] = [];
            for (const [hash, list] of bounded) {
              const rec = receipts.get(hash) ?? null;
              const first = list[0];
              const totalValue = list.reduce((acc, r) => acc + (r.value ?? 0), 0);
              const moved = totalValue > 0 ? `${fmtAmt(totalValue)} ${symbolLabel}` : symbolLabel;
              const desc =
                list.length === 1
                  ? `${moved}${first.from && first.to ? ` — ${shortAddr(first.from)} → ${shortAddr(first.to)}` : ""}`
                  : `${moved} — ${list.length} token transfers in one transaction`;

              let direction: TokenActivityDirection = "unknown";
              let confidence: string | null = null;
              let reason: string | null = null;
              let tokenIn: { asset: string; symbol: string | null; amount: number | null } | null = null;
              let tokenOut: { asset: string; symbol: string | null; amount: number | null } | null = null;
              let quoteAmount: number | null = null;
              let quoteCurrency: string | null = null;
              // Pick the wallet to classify against: the tx sender when it
              // actually moves the token; otherwise the largest
              // non-intermediary participant (receivers of the largest leg,
              // then sources). DEX-heavy tokens are dominated by
              // contract-mediated transactions where the sender only pays gas —
              // the evidence-based fallback keeps those rows classifiable.
              const senderLower = rec?.tx?.from?.toLowerCase() ?? null;
              const legs = list.map((r) => ({ from: r.from?.toLowerCase() ?? null, to: r.to?.toLowerCase() ?? null, value: r.value ?? 0 }));
              const froms = new Set<string>(legs.flatMap((l) => (l.from ? [l.from] : [])));
              const tos = new Set<string>(legs.flatMap((l) => (l.to ? [l.to] : [])));
              const maxLeg = (a: string) => Math.max(...legs.filter((l) => l.from === a || l.to === a).map((l) => l.value), 0);
              let classified: string | null = null;
              if (senderLower && (froms.has(senderLower) || tos.has(senderLower))) classified = rec!.tx!.from;
              else {
                // Non-intermediary candidates: wallets on one side of the token
                // flow only (routers/pools appear on both sides).
                const sinks = [...tos].filter((a) => !froms.has(a));
                const sources = [...froms].filter((a) => !tos.has(a));
                const cands = sinks.length > 0 ? sinks : sources;
                if (cands.length > 0) {
                  cands.sort((x, y) => maxLeg(y) - maxLeg(x));
                  classified = cands[0];
                }
              }
              // A receipt-proven revert upgrades the honest status; a missing
              // receipt leaves the row unclassified and status unknown.
              const status =
                rec?.receipt === null ? null : rec?.receipt.status === "0x0" || rec?.receipt.status === "0x00" ? "failed" : "confirmed";

              if (rec?.receipt && rec.tx && classified) {
                // Quote-leg evidence for the classified wallet: top-level tx
                // value plus internal native transfers from this exact block
                // (the router returning native currency is how most sells settle).
                const internal = first.blockHex ? await fetchInternalNativeInBlock(rpcUrl, classified, first.blockHex) : [];
                const hashInternal = internal.filter((t) => t.hash === hash.toLowerCase());
                const base = classifyEvmTransaction({
                  wallet: classified,
                  chainId: chainId as EvmChainId,
                  nativeSymbol: chain.nativeToken.symbol,
                  tx: rec.tx,
                  receipt: rec.receipt,
                  internalNative: hashInternal,
                });
                // Symbol enrichment for the page's own token and any other
                // non-quote asset the classification references.
                const others = [base.tokenIn?.asset, base.tokenOut?.asset].filter(
                  (a): a is string => typeof a === "string" && a !== "native" && a.toLowerCase() !== selfLower,
                );
                const meta = others.length
                  ? await fetchTokenMeta(rpcUrl, others)
                  : new Map<string, { symbol: string | null; decimals: number | null }>();
                const withSymbol = (t: typeof base.tokenIn) =>
                  t
                    ? {
                        asset: t.asset,
                        symbol: t.asset.toLowerCase() === selfLower ? symbolLabel : (t.symbol ?? meta.get(t.asset)?.symbol ?? null),
                        amount: t.amount,
                      }
                    : null;
                direction =
                  base.classification === "BUY"
                    ? "buy"
                    : base.classification === "SELL"
                      ? "sell"
                      : base.classification === "TRANSFER"
                        ? "transfer"
                        : base.classification === "LIQUIDITY"
                          ? "liquidity"
                          : "unknown";
                confidence = base.classificationConfidence;
                reason = base.classificationReason;
                tokenIn = withSymbol(base.tokenIn);
                tokenOut = withSymbol(base.tokenOut);
                quoteAmount = base.quoteValue;
                quoteCurrency = base.quoteCurrency;
              }

              txRows.push({
                signature: hash,
                timestamp: first.timestamp,
                kind: list.length > 1 ? `transfer ×${list.length}` : "transfer",
                direction,
                description: desc,
                explorerUrl: chain.explorer?.tx(hash) ?? null,
                counterparty: classified,
                confidence,
                classificationReason: reason,
                tokenIn,
                tokenOut,
                quoteAmount,
                quoteCurrency,
                status,
              });
            }
            // Related wallets: participants observed in the decoded feed
            // (appearance counts only — frequency is not a relationship).
            const seenPair = new Set<string>();
            const walletAgg = new Map<string, { appearances: number; lastSeen: number | null }>();
            for (const r of feed) {
              for (const a of [r.from, r.to]) {
                if (typeof a !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(a)) continue;
                const al = a.toLowerCase();
                const pk = `${al}|${r.hash}`;
                if (seenPair.has(pk)) continue;
                seenPair.add(pk);
                const e = walletAgg.get(al) ?? { appearances: 0, lastSeen: null };
                e.appearances += 1;
                if (r.timestamp !== null && (e.lastSeen === null || r.timestamp > e.lastSeen)) e.lastSeen = r.timestamp;
                walletAgg.set(al, e);
              }
            }
            const wallets: RelatedWallet[] = [...walletAgg.entries()]
              .map(([a, e]) => ({
                address: a,
                appearances: e.appearances,
                lastSeen: e.lastSeen,
                share: uniqueHashCount > 0 ? e.appearances / uniqueHashCount : null,
              }))
              .sort((x, y) => y.appearances - x.appearances)
              .slice(0, 12);

            activity = {
              state: "available",
              coverage: "decoded",
              note: `Transfers of this token via the Alchemy Enhanced API — ${uniqueHashCount} transaction${uniqueHashCount === 1 ? "" : "s"} across ${feed.length} transfer records. Direction is classified from receipt evidence against the transaction's sender, or the largest participating wallet when the sender does not move the token (quote leg required for buy/sell); ambiguous or reverted transactions stay unknown.`,
              transactionsScanned: uniqueHashCount,
              transactionsReturned: feed.length,
              fetchedAt,
              transactions: txRows,
              wallets,
            };
          }
        }
      }
      const explorerKeyAvailable = ["ETHERSCAN_API_KEY", "BSCSCAN_API_KEY", "BASESCAN_API_KEY"].some(
        (k) => !!process.env[k],
      );
      const risk = buildRiskReview({
        summary,
        mintInfo,
        holders,
        organicScore,
        poolCount: pairs.length,
        explorerKeyAvailable,
      });
      const venues: TokenDetail["venues"] = pairs
        .filter((p) => (p.liquidity?.usd ?? 0) > 0)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
        .slice(0, 8)
        .map((p) => ({
          venue: (p.labels?.length ? `${p.dexId} (${p.labels.join(", ")})` : p.dexId) as string,
          poolAddress: p.pairAddress,
          liquidityUsd: p.liquidity?.usd ?? null,
          volume24hUsd: p.volume?.h24 ?? null,
          url: p.url,
        }));
      // Pool fallback for brand-new tokens: when DexScreener has no liquid
      // venue yet, consult the real-time discovery hub, then GeckoTerminal
      // token-pools, so the chart has a poolAddress instead of a dead state.
      if (venues.length === 0) {
        venues.push(...(await extraVenues(chainId, chain, address)));
        venues.sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1));
        if (summary.poolAddress == null && venues[0]?.poolAddress) {
          summary.poolAddress = venues[0].poolAddress;
        }
      }
      const detail: TokenDetail = { summary, decimals, venues, about, risk, providerNotes, activity, holders: holdersData };
      return NextResponse.json(detail, { headers: { "cache-control": "no-store" } });
    }
  }

  // Fallback: still return best-effort detail with limited risk info.
  const risk = buildRiskReview({
    summary,
    mintInfo: null,
    holders: null,
    organicScore: null,
    poolCount: pairs.length,
    explorerKeyAvailable: ["ETHERSCAN_API_KEY", "BSCSCAN_API_KEY", "BASESCAN_API_KEY"].some((k) => !!process.env[k]),
  });
  const detail: TokenDetail = {
    summary,
    decimals,
    venues: pairs.slice(0, 8).map((p) => ({
      venue: p.dexId,
      poolAddress: p.pairAddress,
      liquidityUsd: p.liquidity?.usd ?? null,
      volume24hUsd: p.volume?.h24 ?? null,
      url: p.url,
    })),
    about: null,
    risk,
    providerNotes,
    activity: null,
    holders: null,
  };
  return NextResponse.json(detail, { headers: { "cache-control": "no-store" } });
}