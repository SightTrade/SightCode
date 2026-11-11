import { NextRequest, NextResponse } from "next/server";
import { CHAINS, TRADABLE_CHAINS, detectAddress, isSolanaAddress } from "@/lib/chains";
import { dexPairToSummary, dexSearchCached, dexTokens } from "@/lib/providers/dexscreener";
import { jupTokenByMint, jupTokenSearch } from "@/lib/providers/jupiter";
import type { TokenSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=
 * Accepts: token name, ticker, contract/mint address, tx signature-ish strings.
 * When the input resembles an address we query the chains that accept that
 * shape and return the interpretations — we never assume the chain.
 */
function dedupe(rows: TokenSummary[]): TokenSummary[] {
  const map = new Map<string, TokenSummary>();
  for (const r of rows) {
    const key = `${r.chain}:${r.address.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || (r.liquidityUsd ?? 0) > (existing.liquidityUsd ?? 0)) map.set(key, r);
  }
  return [...map.values()];
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ tokens: [], interpretations: [], fetchedAt: Date.now() });
  }

  const fetchedAt = Date.now();
  const warnings: string[] = [];
  let tokens: TokenSummary[] = [];
  const interpretations: { kind: string; value: string; chains: string[] }[] = [];

  const detected = detectAddress(q);
  if (detected) {
    if (detected.type === "solana-mint") {
      interpretations.push({ kind: "Solana token mint or wallet address", value: q, chains: ["solana"] });
      const [dexPairs, jupToken] = await Promise.allSettled([dexTokens(["solana"], [q]), jupTokenByMint(q)]);
      if (dexPairs.status === "fulfilled") tokens.push(...dexPairs.value.map((p) => dexPairToSummary(p, fetchedAt)!).filter(Boolean));
      if (jupToken.status === "fulfilled" && jupToken.value) {
        const t = jupToken.value;
        tokens.push({
          chain: "solana",
          address: t.id,
          symbol: t.symbol,
          name: t.name,
          image: t.icon ?? null,
          priceUsd: t.price != null ? Number(t.price) : null,
          priceChange: { m5: null, h1: null, h6: null, h24: null },
          marketCapUsd: t.mcap ?? null,
          fdvUsd: null,
          liquidityUsd: t.liquidity ?? null,
          volume24hUsd: t.volume24h ?? null,
          txns24h: { buys: null, sells: null },
          traders24h: null,
          createdAt: null,
          creationSource: null,
          venue: null,
          poolAddress: null,
          dataSource: "Jupiter Tokens",
          fetchedAt,
        });
      }
    } else if (detected.type === "evm-address") {
      interpretations.push({
        kind: "EVM contract or wallet address",
        value: detected.value,
        chains: TRADABLE_CHAINS.filter((c) => CHAINS[c].kind === "evm"),
      });
      const evmChains = TRADABLE_CHAINS.filter((c) => CHAINS[c].kind === "evm" && CHAINS[c].dexscreenerChain);
      const pairs = await dexTokens(evmChains.map((c) => CHAINS[c].dexscreenerChain!), [detected.value]).catch(() => []);
      tokens.push(...pairs.map((p) => dexPairToSummary(p, fetchedAt)!).filter(Boolean));
    } else {
      interpretations.push({ kind: "Transaction signature or hash", value: q, chains: [] });
    }
  } else {
    const [dexRes, jupRes] = await Promise.allSettled([dexSearchCached(q), jupTokenSearch(q)]);
    if (dexRes.status === "fulfilled") {
      tokens.push(...dexRes.value.map((p) => dexPairToSummary(p, fetchedAt)!).filter(Boolean));
    } else {
      warnings.push("DexScreener search failed");
    }
    if (jupRes.status === "fulfilled" && !isSolanaAddress(q)) {
      tokens.push(
        ...jupRes.value.slice(0, 10).map(
          (t): TokenSummary => ({
            chain: "solana",
            address: t.id,
            symbol: t.symbol,
            name: t.name,
            image: t.icon ?? null,
            priceUsd: t.price != null ? Number(t.price) : null,
            priceChange: { m5: null, h1: null, h6: null, h24: null },
            marketCapUsd: t.mcap ?? null,
            fdvUsd: null,
            liquidityUsd: t.liquidity ?? null,
            volume24hUsd: t.volume24h ?? null,
            txns24h: { buys: null, sells: null },
            traders24h: null,
            createdAt: null,
            creationSource: null,
            venue: null,
            poolAddress: null,
            dataSource: "Jupiter Tokens",
            fetchedAt,
          }),
        ),
      );
    } else if (jupRes.status === "rejected") {
      warnings.push("Jupiter token search failed");
    }
  }

  // Rank: liquidity first, then volume.
  tokens = dedupe(tokens).sort(
    (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0) || (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0),
  );

  return NextResponse.json(
    { tokens: tokens.slice(0, 24), interpretations, fetchedAt, warnings },
    { headers: { "cache-control": "no-store" } },
  );
}