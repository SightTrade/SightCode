"use client";

import { useEffect, useRef } from "react";
import { useAlerts } from "@/lib/store";
import { useToast } from "@/components/Toast";
import { fmtUsd, fmtPct } from "@/lib/format";
import { CHAINS } from "@/lib/chains";
import type { TokenSummary } from "@/lib/types";

/**
 * Client-side alert evaluation loop.
 *
 * IMPORTANT LIMITATION (surfaced in the Alerts UI): alerts are evaluated only
 * while the app is open in a browser tab — there is no background worker.
 * Delivery channel is in-app toasts; browser/email/Telegram channels are
 * future work. A dedupe mechanism (lastFiredAt cooldown) prevents repeat
 * notifications for the same sustained condition.
 */
const POLL_MS = 30_000;
const REFIRE_COOLDOWN_MS = 10 * 60_000; // same alert won't re-fire for 10 minutes

export function AlertsEngine() {
  const alerts = useAlerts((s) => s.alerts);
  const markFired = useAlerts((s) => s.markFired);
  const { toast } = useToast();
  const pricesRef = useRef<Map<string, { price: number | null; pct24: number | null; vol: number | null; liq: number | null }>>(new Map());
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  useEffect(() => {
    let cancelled = false;

    const evaluate = (tick: { price: number | null; pct24: number | null; vol: number | null; liq: number | null }, chain: string, address: string) => {
      const now = Date.now();
      for (const a of alertsRef.current) {
        if (!a.active) continue;
        if (a.chain !== chain || a.address !== address) continue;
        if (a.lastFiredAt && now - a.lastFiredAt < REFIRE_COOLDOWN_MS) continue;
        let fired = false;
        let detail = "";
        const valueStr =
          a.kind === "price-above" || a.kind === "price-below"
            ? fmtUsd(tick.price)
            : a.kind === "pct-change"
              ? fmtPct(tick.pct24)
              : a.kind === "volume-spike"
                ? fmtUsd(tick.vol)
                : fmtUsd(tick.liq);
        switch (a.kind) {
          case "price-above":
            fired = tick.price != null && tick.price >= a.threshold;
            detail = `Price ${fmtUsd(tick.price)} crossed above ${fmtUsd(a.threshold)}`;
            break;
          case "price-below":
            fired = tick.price != null && tick.price <= a.threshold;
            detail = `Price ${fmtUsd(tick.price)} dropped below ${fmtUsd(a.threshold)}`;
            break;
          case "pct-change":
            fired = tick.pct24 != null && Math.abs(tick.pct24) >= a.threshold;
            detail = `24h change ${fmtPct(tick.pct24)} breached ±${a.threshold}%`;
            break;
          case "volume-spike":
            fired = tick.vol != null && tick.vol >= a.threshold;
            detail = `24h volume ${fmtUsd(tick.vol)} exceeded ${fmtUsd(a.threshold)}`;
            break;
          case "liquidity-below":
            fired = tick.liq != null && tick.liq <= a.threshold;
            detail = `Liquidity ${fmtUsd(tick.liq)} fell below ${fmtUsd(a.threshold)}`;
            break;
        }
        if (fired) {
          markFired(a.id, tick.price ?? a.threshold);
          toast(
            "warn",
            `🔔 Alert: ${a.symbol ?? shortAddr(address)} on ${CHAINS[a.chain as keyof typeof CHAINS]?.shortName ?? chain}`,
            `${detail}. Open the Alerts page to review or disable.`,
          );
        }
      }
    };

    const poll = async () => {
      const active = alertsRef.current.filter((a) => a.active);
      if (active.length === 0) return;
      const addressSet = new Set(active.map((a) => `${a.chain}:${a.address}`));
      const now = Date.now();
      // Reuse discovery rows when possible: fetch each address's pairs via search API (accepts addresses).
      await Promise.allSettled(
        [...addressSet].map(async (key) => {
          const [chain, address] = key.split(":");
          try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(address)}`, { cache: "no-store" });
            if (!res.ok) return;
            const data = (await res.json()) as { tokens: TokenSummary[] };
            const match = data.tokens.find((t) => t.chain === chain && t.address === address);
            if (!match) return;
            pricesRef.current.set(key, {
              price: match.priceUsd,
              pct24: match.priceChange.h24,
              vol: match.volume24hUsd,
              liq: match.liquidityUsd,
            });
            if (!cancelled) evaluate(pricesRef.current.get(key)!, chain, address);
          } catch {
            // network errors are non-fatal; next tick retries
          }
        }),
      );
      void now;
    };

    const id = setInterval(poll, POLL_MS);
    poll();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [markFired, toast]);

  return null;
}

function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}