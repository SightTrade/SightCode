"use client";

import { useEffect, useRef, useState } from "react";
import type { Candle, Timeframe } from "@/lib/types";
import { mergeLiveCandle } from "@/lib/chartCandles";
import { cn, fmtCompact, timeAgo } from "@/lib/format";

/**
 * Responsive candlestick + volume chart built on lightweight-charts (lazy
 * loaded). The chart instance is created once per mount and updated via
 * series.setData()/update() — incoming market data never re-initializes it.
 *
 * Data honesty model:
 * - Historical candles come from GeckoTerminal OHLCV (authoritative).
 * - Live updates come from the shared server-side snapshot stream (DexScreener
 *   free tier — periodic snapshots, no trade websocket). They extend the
 *   CURRENT candle only (mergeLiveCandle); completed candles are periodically
 *   re-verified from the provider via a history refresh.
 * - Live candle volume stays at the provider's last known value: per-trade
 *   volume deltas are not exposed by the verified free sources, so none are
 *   invented.
 */

const TIMEFRAMES: { tf: Timeframe; label: string }[] = [
  { tf: "1m", label: "1m" },
  { tf: "5m", label: "5m" },
  { tf: "15m", label: "15m" },
  { tf: "1h", label: "1H" },
  { tf: "4h", label: "4H" },
  { tf: "1d", label: "1D" },
];

const STALE_AFTER_MS = 45_000;
const HISTORY_REFRESH_MS = 30_000;

interface PriceChartProps {
  chain: string;
  poolAddress: string | null;
  /** Token mint/contract — drives the shared live snapshot stream. */
  tokenAddress: string | null;
  tokenSymbol: string;
}

export default function PriceChart({ chain, poolAddress, tokenAddress, tokenSymbol }: PriceChartProps) {
  const [tf, setTf] = useState<Timeframe>("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [streamNote, setStreamNote] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lineMode, setLineMode] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [pairStats, setPairStats] = useState<{ liquidityUsd: number | null; buys: number | null; sells: number | null } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<import("lightweight-charts").IChartApi | null>(null);
  const candleSeriesRef = useRef<import("lightweight-charts").ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<import("lightweight-charts").ISeriesApi<"Line"> | null>(null);
  const volSeriesRef = useRef<import("lightweight-charts").ISeriesApi<"Histogram"> | null>(null);
  const priceLineRef = useRef<import("lightweight-charts").IPriceLine | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const historySeqRef = useRef(0);

  // Load historical candles whenever tf / pool / manual reload changes.
  useEffect(() => {
    if (!poolAddress) return;
    let cancelled = false;
    const seq = ++historySeqRef.current;
    setLoading(true);
    setError(null);
    fetch(`/api/candles?chain=${chain}&pool=${encodeURIComponent(poolAddress)}&tf=${tf}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        // Stale response for a previously selected pool/timeframe must never
        // overwrite the currently displayed chart.
        if (cancelled || seq !== historySeqRef.current) return;
        const fresh = (body.candles ?? []) as Candle[];
        candlesRef.current = fresh;
        setCandles(fresh);
        setSource(body.source ?? null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          candlesRef.current = [];
          setCandles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chain, poolAddress, tf, reloadTick]);

  // Periodic history refresh picks up provider-completed candles (including
  // real volume) so the live-extended current candle gets re-verified upstream.
  useEffect(() => {
    if (!poolAddress) return;
    const id = setInterval(() => setReloadTick((t) => t + 1), HISTORY_REFRESH_MS);
    return () => clearInterval(id);
  }, [poolAddress]);

  // Apply a live price to the current candle + price line (no chart re-init).
  const applyLivePrice = (price: number) => {
    setLivePrice(price);
    const { candles: merged } = mergeLiveCandle(candlesRef.current, price, Math.floor(Date.now() / 1000), tf);
    if (merged !== candlesRef.current) {
      candlesRef.current = merged;
      const last = merged[merged.length - 1];
      const t = last.time as import("lightweight-charts").UTCTimestamp;
      candleSeriesRef.current?.update({ time: t, open: last.open, high: last.high, low: last.low, close: last.close });
      lineSeriesRef.current?.update({ time: t, value: last.close });
    }
    priceLineRef.current?.applyOptions({ price });
  };

  // Shared backend live stream (SSE). One upstream poller per token feeds all
  // open charts; EventSource reconnects automatically after disconnections.
  useEffect(() => {
    if (!tokenAddress) {
      setStreamNote("Live prices need a token address.");
      return;
    }
    let es: EventSource | null = null;
    let disposed = false;
    let lastPriceSeen: number | null = null;
    let lastFetchedAtSeen = 0;
    const snapshotHandler = (ev: MessageEvent) => {
      if (disposed) return;
      try {
        const msg = JSON.parse(ev.data) as {
          type: string;
          error?: string;
          snapshot?: {
            fetchedAt: number;
            pairs: {
              poolAddress: string;
              priceUsd: number | null;
              liquidityUsd: number | null;
              txns: { h1: { buys: number; sells: number } | null };
            }[];
          };
        };
        if (msg.type === "error") {
          setStreamNote(msg.error ?? "Live stream error");
          return;
        }
        const snap = msg.snapshot;
        if (!snap) return;
        if (snap.fetchedAt === lastFetchedAtSeen) return; // dedupe identical snapshots
        lastFetchedAtSeen = snap.fetchedAt;
        setStreamNote(null);
        setLastUpdateAt(Date.now());
        const pair =
          snap.pairs.find((p) => p.poolAddress.toLowerCase() === (poolAddress ?? "").toLowerCase()) ??
          snap.pairs[0];
        if (pair) {
          setPairStats({
            liquidityUsd: pair.liquidityUsd,
            buys: pair.txns.h1?.buys ?? null,
            sells: pair.txns.h1?.sells ?? null,
          });
          const price = pair.priceUsd;
          if (price !== null && price > 0 && price !== lastPriceSeen) {
            lastPriceSeen = price;
            applyLivePrice(price);
          }
        }
      } catch {
        // malformed event — ignore; the next snapshot recovers
      }
    };
    try {
      es = new EventSource(`/api/price/stream?chain=${encodeURIComponent(chain)}&token=${encodeURIComponent(tokenAddress)}`);
      es.onmessage = snapshotHandler;
      es.onerror = () => {
        if (es && es.readyState === EventSource.CLOSED) {
          setStreamNote("Live stream disconnected");
        }
        // While CONNECTING, EventSource auto-reconnects — the STALE badge
        // covers the gap; nothing fabricated is drawn.
      };
    } catch {
      setStreamNote("Live stream unsupported in this browser");
    }
    return () => {
      disposed = true;
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, tokenAddress, poolAddress, tf]);

  // Staleness ticker — a live stream that goes quiet must be visibly stale.
  useEffect(() => {
    const id = setInterval(() => {
      setStale(lastUpdateAt !== null && Date.now() - lastUpdateAt > STALE_AFTER_MS);
    }, 5_000);
    return () => clearInterval(id);
  }, [lastUpdateAt]);

  // Create the chart exactly once per mount (lazy-loaded lib).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;
      const chart = lc.createChart(containerRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor: "#929BB8",
          fontFamily: "var(--font-geist-sans), sans-serif",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(32,40,68,0.5)" },
          horzLines: { color: "rgba(32,40,68,0.5)" },
        },
        rightPriceScale: { borderColor: "#202844" },
        timeScale: { borderColor: "#202844", timeVisible: true, secondsVisible: false },
        crosshair: {
          vertLine: { color: "#35BFFF55", labelBackgroundColor: "#0C1224" },
          horzLine: { color: "#35BFFF55", labelBackgroundColor: "#0C1224" },
        },
        autoSize: true,
      });
      const candleSeries = chart.addCandlestickSeries({
        upColor: "#42D392",
        downColor: "#FF647C",
        borderUpColor: "#42D392",
        borderDownColor: "#FF647C",
        wickUpColor: "#42D392",
        wickDownColor: "#FF647C",
        priceFormat: { type: "price", precision: 8, minMove: 1e-8 },
      });
      const lineSeries = chart.addLineSeries({
        color: "#7857FF",
        lineWidth: 2,
        visible: false,
        priceFormat: { type: "price", precision: 8, minMove: 1e-8 },
        lastValueVisible: true,
        priceLineVisible: false,
      });
      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      lineSeriesRef.current = lineSeries;
      volSeriesRef.current = volSeries;
    })();
    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current = null;
      volSeriesRef.current = null;
      priceLineRef.current = null;
    };
  }, []);

  // Push data into the existing chart instance (no re-init).
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const ls = lineSeriesRef.current;
    const vs = volSeriesRef.current;
    if (!cs || !ls || !vs) return;
    type UTCTimestamp = import("lightweight-charts").UTCTimestamp;
    // lightweight-charts requires strictly ascending times — sort defensively.
    const sorted = candles.slice().sort((a, b) => a.time - b.time);
    const data = sorted
      .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
      .map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
    const vol = sorted
      .filter((c) => Number.isFinite(c.time))
      .map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(66,211,146,0.35)" : "rgba(255,100,124,0.35)",
      }));
    const line = sorted
      .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
      .map((c) => ({ time: c.time as UTCTimestamp, value: c.close }));
    cs.setData(data);
    ls.setData(line);
    vs.setData(vol);
    // Rebuild the live price line against the fresh history.
    if (priceLineRef.current) {
      cs.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    if (livePrice !== null && data.length > 0) {
      priceLineRef.current = cs.createPriceLine({
        price: livePrice,
        color: "#35BFFF",
        lineWidth: 1,
        lineStyle: 3, // dotted
        axisLabelVisible: true,
        title: "LIVE",
      });
    }
    if (data.length > 0) chartRef.current?.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles]);

  // Toggle series visibility without re-initializing.
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: !lineMode });
    lineSeriesRef.current?.applyOptions({ visible: lineMode });
  }, [lineMode]);
  useEffect(() => {
    volSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  // Live badge: OFFLINE (no stream) / NO STREAM (none yet) / STALE (quiet too
  // long) / LIVE (fresh snapshots). Never fabricated.
  const liveStatus = streamNote
    ? { label: streamNote === "Live stream disconnected" ? "OFFLINE" : "LIVE·ERR", cls: "text-neg" }
    : lastUpdateAt === null
      ? { label: "NO STREAM", cls: "text-muted" }
      : stale
        ? { label: "STALE", cls: "text-warn" }
        : { label: "LIVE", cls: "text-pos" };

  return (
    <div className="panel flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-fg">{tokenSymbol} / USD</span>
          {source && <span className="chip">{source}</span>}
          <span
            className={cn("chip", liveStatus.cls)}
            title={lastUpdateAt ? `Last snapshot ${timeAgo(lastUpdateAt)}` : "No live stream connected"}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                liveStatus.cls === "text-pos" ? "bg-pos" : liveStatus.cls === "text-warn" ? "bg-warn" : liveStatus.cls === "text-neg" ? "bg-neg" : "bg-line-strong",
              )}
            />
            {liveStatus.label}
          </span>
          {lastUpdateAt !== null && !stale && (
            <span className="text-2xs text-muted">updated {timeAgo(lastUpdateAt)}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Chart controls">
          {pairStats && (
            <>
              <span
                className="chip"
                title="Current liquidity snapshot — verified free sources expose no historical liquidity series"
              >
                Liq {fmtCompact(pairStats.liquidityUsd)}
              </span>
              <span
                className="chip"
                title="Buys / sells in the last hour — snapshot aggregate, not a trade-by-trade stream"
              >
                1h {pairStats.buys ?? "—"}/{pairStats.sells ?? "—"}
              </span>
            </>
          )}
          <button
            role="tab"
            aria-selected={!lineMode}
            onClick={() => setLineMode(false)}
            className={cn("focus-ring rounded px-2 py-1 text-2xs font-medium", !lineMode ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface hover:text-fg")}
          >
            Candles
          </button>
          <button
            role="tab"
            aria-selected={lineMode}
            onClick={() => setLineMode(true)}
            className={cn("focus-ring rounded px-2 py-1 text-2xs font-medium", lineMode ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface hover:text-fg")}
          >
            Line
          </button>
          <button
            onClick={() => setShowVolume((v) => !v)}
            aria-pressed={showVolume}
            className={cn("focus-ring rounded px-2 py-1 text-2xs font-medium", showVolume ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface hover:text-fg")}
            title="Volume histogram — provider-completed candles only"
          >
            Vol
          </button>
          <button
            onClick={() => chartRef.current?.timeScale().fitContent()}
            className="focus-ring rounded px-2 py-1 text-2xs font-medium text-muted hover:bg-surface hover:text-fg"
            title="Fit all candles to view"
          >
            Fit
          </button>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden />
          {TIMEFRAMES.map((t) => (
            <button
              key={t.tf}
              role="tab"
              aria-selected={tf === t.tf}
              onClick={() => setTf(t.tf)}
              className={cn(
                "focus-ring rounded px-2 py-1 text-2xs font-medium transition-colors",
                tf === t.tf ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface hover:text-fg",
              )}
              title={`${t.label} — GeckoTerminal OHLCV aggregate`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-[320px] flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/50 text-xs text-muted" aria-live="polite">
            Loading candles…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/70 px-6 text-center">
            <p className="text-sm text-neg">Chart data unavailable</p>
            <p className="text-xs text-muted">{error}</p>
            <button onClick={() => setReloadTick((t) => t + 1)} className="btn-ghost h-7 px-3 text-xs">
              Retry
            </button>
          </div>
        )}
        {!error && !loading && candles.length === 0 && poolAddress && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted">
            No candle data yet for this pool — very new pairs may not have chart history.
          </div>
        )}
        {!poolAddress && !error && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted">
            Chart requires a liquidity pool. This token has no active pool yet.
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-line px-3 py-1.5">
        <p className="text-2xs text-muted">
          {livePrice !== null ? (
            <>
              Live price <span className="tabular text-fg">{livePrice.toPrecision(8)}</span>
              {" — "}
              {liveStatus.label === "LIVE" || liveStatus.label === "STALE"
                ? "current candle extends from live snapshots; completed candles come from GeckoTerminal"
                : "last known price"}
            </>
          ) : (
            "Price history from GeckoTerminal OHLCV for the selected pool."
          )}
        </p>
        {streamNote && <p className="text-2xs text-warn">{streamNote}</p>}
      </div>
    </div>
  );
}