import { describe, expect, it } from "vitest";
import { bucketStart, mergeLiveCandle, TF_SECONDS } from "./chartCandles";

/**
 * FIXTURE-BASED unit tests (no network): live price snapshot merging into
 * candles. Fixed clocks via explicit `nowSec` — deterministic by construction.
 * These are NOT live integration tests; live behavior is verified separately
 * against real provider responses.
 */

// Bucket-aligned to day / 4h / 1h / minute (1699920000 = 19675 × 86400), so
// bucket math in the tests is exact for every timeframe.
const T0 = 1_699_920_000;
const HIST: Candle[] = [
  { time: T0 - 3600, open: 1.0, high: 1.2, low: 0.9, close: 1.1, volume: 10 },
  { time: T0, open: 1.1, high: 1.5, low: 1.05, close: 1.4, volume: 20 },
];

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

describe("chartCandles — live snapshot merging", () => {
  it("maps every timeframe to exact seconds", () => {
    expect(TF_SECONDS["1m"]).toBe(60);
    expect(TF_SECONDS["5m"]).toBe(300);
    expect(TF_SECONDS["15m"]).toBe(900);
    expect(TF_SECONDS["1h"]).toBe(3600);
    expect(TF_SECONDS["4h"]).toBe(14400);
    expect(TF_SECONDS["1d"]).toBe(86400);
  });

  it("bucketStart aligns to the timeframe", () => {
    expect(bucketStart(T0 + 42, 3600)).toBe(T0);
    expect(bucketStart(T0 + 3600, 3600)).toBe(T0 + 3600);
  });

  it("ignores null / non-positive / NaN prices (nothing fabricated)", () => {
    expect(mergeLiveCandle(HIST, null, T0 + 10, "1h").candles).toBe(HIST);
    expect(mergeLiveCandle(HIST, 0, T0 + 10, "1h").candles).toBe(HIST);
    expect(mergeLiveCandle(HIST, -3, T0 + 10, "1h").candles).toBe(HIST);
    expect(mergeLiveCandle(HIST, Number.NaN, T0 + 10, "1h").candles).toBe(HIST);
  });

  it("merges a snapshot inside the current bucket: close updates, high/low widen, open & volume preserved", () => {
    const res = mergeLiveCandle(HIST, 1.45, T0 + 100, "1h");
    expect(res.appended).toBe(false);
    expect(res.candles).toHaveLength(2);
    const last = res.candles[1];
    expect(last.open).toBe(1.1);
    expect(last.high).toBe(1.5);
    expect(last.low).toBe(1.05);
    expect(last.close).toBe(1.45);
    expect(last.volume).toBe(20);
    // historical candle untouched
    expect(res.candles[0]).toEqual(HIST[0]);
  });

  it("lowers the low when the snapshot dips", () => {
    const res = mergeLiveCandle(HIST, 0.8, T0 + 100, "1h");
    expect(res.candles[1].low).toBe(0.8);
    expect(res.candles[1].high).toBe(1.5);
  });

  it("returns the same array reference when nothing changed (cheap updates)", () => {
    const res = mergeLiveCandle(HIST, 1.4, T0 + 100, "1h");
    expect(res.candles).toBe(HIST);
    expect(res.appended).toBe(false);
  });

  it("appends a new candle when the snapshot enters a new bucket, opening at the previous close", () => {
    const now = T0 + 3600 + 5; // next hourly bucket
    const res = mergeLiveCandle(HIST, 1.6, now, "1h");
    expect(res.appended).toBe(true);
    expect(res.candles).toHaveLength(3);
    const added = res.candles[2];
    expect(added.time).toBe(T0 + 3600);
    expect(added.open).toBe(1.4); // previous close
    expect(added.close).toBe(1.6);
    expect(added.high).toBe(1.6);
    expect(added.low).toBe(1.4);
    expect(added.volume).toBe(0); // completed volume comes only from the provider
  });

  it("starts a fresh candle when history is empty (brand-new pair)", () => {
    const res = mergeLiveCandle([], 2.5, T0 + 7, "1h");
    expect(res.appended).toBe(true);
    expect(res.candles).toHaveLength(1);
    expect(res.candles[0]).toEqual({ time: T0, open: 2.5, high: 2.5, low: 2.5, close: 2.5, volume: 0 });
  });

  it("never creates a bucket older than the last provider candle (clock-skew guard)", () => {
    const res = mergeLiveCandle(HIST, 1.2, T0 - 500, "1h");
    expect(res.candles).toBe(HIST);
    expect(res.appended).toBe(false);
  });

  it("respects timeframe bucketing (1m vs 1h)", () => {
    const now = T0 + 61; // one minute past
    const m1 = mergeLiveCandle(HIST, 1.5, now, "1m");
    expect(m1.appended).toBe(true);
    expect(m1.candles[2].time).toBe(T0 + 60);
    const h1 = mergeLiveCandle(HIST, 1.5, now, "1h");
    expect(h1.appended).toBe(false); // still inside the same hourly bucket
  });
});