import { NextRequest, NextResponse } from "next/server";
import { CHAINS } from "@/lib/chains";
import { gtOhlcv } from "@/lib/providers/geckoterminal";
import { TtlCache } from "@/lib/providers/fetchJson";
import type { Candle, Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/candles?chain=&pool=&tf=
 * Candles come from GeckoTerminal OHLCV for the selected pool.
 * Timeframes map to real supported aggregates:
 *   1m → minute/1 · 5m → minute/5 · 15m → minute/15
 *   1h → hour/1 · 4h → hour/4 · 1d → day/1
 */
const TF_MAP: Record<Timeframe, { tf: "minute" | "hour" | "day"; agg: 1 | 5 | 15 | 4; limit: number }> = {
  "1m": { tf: "minute", agg: 1, limit: 300 },
  "5m": { tf: "minute", agg: 5, limit: 400 },
  "15m": { tf: "minute", agg: 15, limit: 400 },
  "1h": { tf: "hour", agg: 1, limit: 400 },
  "4h": { tf: "hour", agg: 4, limit: 400 },
  "1d": { tf: "day", agg: 1, limit: 365 },
};

const cache = new TtlCache<Candle[]>(60_000);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const chainId = sp.get("chain") ?? "";
  const pool = sp.get("pool") ?? "";
  const tf = (sp.get("tf") ?? "1h") as Timeframe;
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain?.geckoNetwork) {
    return NextResponse.json({ error: "Chart data is not available for this chain." }, { status: 400 });
  }
  if (!pool) return NextResponse.json({ error: "pool address required" }, { status: 400 });
  if (!(tf in TF_MAP)) return NextResponse.json({ error: "unsupported timeframe" }, { status: 400 });

  const map = TF_MAP[tf];
  try {
    const candles = await cache.wrap(`${chain.geckoNetwork}:${pool}:${tf}`, async () => {
      const res = await gtOhlcv(chain.geckoNetwork!, pool, map.tf, map.agg, map.limit);
      // GeckoTerminal returns ohlcv_list newest-first; lightweight-charts and
      // every consumer expect ascending time order.
      return res.candles
        .slice()
        .sort((a, b) => a.t - b.t)
        .map<Candle>((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v }));
    });
    return NextResponse.json(
      { candles, source: "GeckoTerminal OHLCV", tf, pool, fetchedAt: Date.now() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Chart data unavailable: ${String(e).slice(0, 160)}`, candles: [] },
      { status: 502 },
    );
  }
}