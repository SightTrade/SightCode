import { NextRequest, NextResponse } from "next/server";
import { CHAINS, type ChainId, TRADABLE_CHAINS } from "@/lib/chains";
import { gtPools } from "@/lib/providers/geckoterminal";
import type { TokenSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/discover?chain=solana|all&mode=trending|new&page=1
 * Merges GeckoTerminal pool discovery across supported networks.
 * Dedupes per token (highest liquidity pool wins).
 */
function dedupeByToken(rows: TokenSummary[]): TokenSummary[] {
  const map = new Map<string, TokenSummary>();
  for (const r of rows) {
    const key = `${r.chain}:${r.address.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || (r.liquidityUsd ?? 0) > (existing.liquidityUsd ?? 0)) map.set(key, r);
  }
  return [...map.values()];
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const chainParam = sp.get("chain") ?? "all";
  const mode = (sp.get("mode") ?? "trending") as "trending" | "new";
  const page = Math.max(1, Math.min(3, Number(sp.get("page") ?? 1) || 1));

  const chainIds: ChainId[] =
    chainParam === "all" ? TRADABLE_CHAINS : chainParam in CHAINS ? [chainParam as ChainId] : [chainParam as ChainId];

  const fetchedAt = Date.now();
  const warnings: string[] = [];

  const results = await Promise.allSettled(
    chainIds.flatMap((id) => {
      const net = CHAINS[id].geckoNetwork;
      if (!net || CHAINS[id].status === "unconfigured") return [];
      return [gtPools(net, mode === "new" ? "new_pools" : "trending_pools", page, fetchedAt)];
    }),
  );

  const tokens: TokenSummary[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") tokens.push(...r.value);
    else warnings.push(`A market-data source failed: ${String(r.reason).slice(0, 160)}`);
  }

  const deduped = dedupeByToken(tokens);
  const modeSorted =
    mode === "new"
      ? deduped.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      : deduped.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));

  // Client-side filtering is applied over this payload (max ~3 pages).
  return NextResponse.json(
    {
      tokens: modeSorted.slice(0, 120),
      fetchedAt,
      sources: { pools: "GeckoTerminal" },
      warnings,
      creationTimeBasis: "pool_created_at (liquidity-pool creation time)",
    },
    { headers: { "cache-control": "no-store" } },
  );
}