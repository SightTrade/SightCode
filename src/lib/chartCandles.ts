import type { Candle, Timeframe } from "./types";

/**
 * Live candle maintenance for the price chart.
 *
 * Historical candles are authoritative provider data and are never rewritten.
 * These helpers only maintain the CURRENT candle from live price snapshots:
 * - when a snapshot falls inside the current bucket → merge (high/low/close);
 * - when it starts a new bucket → append a fresh candle (open = close prev).
 *
 * Volume is NOT incremented from snapshots: the verified free providers expose
 * only cumulative window volume, not per-trade deltas, so fabricating volume
 * increments would be dishonest. The live candle keeps its provider volume
 * until the provider publishes the completed candle.
 */

export const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/** Unix-seconds bucket start for a given timeframe at time `nowSec`. */
export function bucketStart(nowSec: number, tfSec: number): number {
  return Math.floor(nowSec / tfSec) * tfSec;
}

export interface LiveMergeResult {
  candles: Candle[];
  /** true when a new candle was appended (callers may refit the chart). */
  appended: boolean;
}

/**
 * Merge a live price into the candle list. Returns the SAME array instance
 * when nothing changed so React consumers can skip updates cheaply.
 * Pure function — no side effects, safe for unit tests with fixed clocks.
 */
export function mergeLiveCandle(
  candles: Candle[],
  priceUsd: number | null,
  nowSec: number,
  tf: Timeframe,
): LiveMergeResult {
  if (!Number.isFinite(nowSec) || nowSec <= 0) return { candles, appended: false };
  if (priceUsd === null || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    return { candles, appended: false };
  }

  const tfSec = TF_SECONDS[tf];
  const bucket = bucketStart(nowSec, tfSec);
  const last = candles.length > 0 ? candles[candles.length - 1] : null;

  // Guard: a malformed/older provider candle newer than our bucket math — trust
  // the provider's clock and do nothing rather than create duplicate buckets.
  if (last && bucket < last.time) return { candles, appended: false };

  if (last && bucket === last.time) {
    const merged: Candle = {
      time: last.time,
      open: last.open,
      high: Math.max(last.high, priceUsd),
      low: Math.min(last.low, priceUsd),
      close: priceUsd,
      volume: last.volume,
    };
    if (
      merged.high === last.high &&
      merged.low === last.low &&
      merged.close === last.close
    ) {
      return { candles, appended: false };
    }
    const out = candles.slice(0, -1);
    out.push(merged);
    return { candles: out, appended: false };
  }

  // New bucket (or first live point after history).
  const open = last ? last.close : priceUsd;
  const out = candles.slice();
  out.push({
    time: bucket,
    open,
    high: Math.max(open, priceUsd),
    low: Math.min(open, priceUsd),
    close: priceUsd,
    volume: last ? 0 : 0, // completed volume comes from the provider
  });
  return { candles: out, appended: true };
}