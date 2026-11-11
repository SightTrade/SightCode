"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/format";

/**
 * Live provider health. Polls /api/health every 60s and shows an honest
 * connection status: every green = operational, any red = degraded, with
 * per-provider detail in the tooltip. Includes a manual refresh control.
 */
interface HealthCheck {
  provider: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
}
interface HealthResponse {
  status: "ok" | "degraded" | "down";
  checkedAt: number;
  checks: HealthCheck[];
}

export function NetworkStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) setHealth((await res.json()) as HealthResponse);
    } catch {
      /* status stays stale — dot turns grey via !health */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  const status = health?.status ?? "unknown";
  const dotColor =
    status === "ok" ? "bg-pos" : status === "degraded" ? "bg-warn" : status === "down" ? "bg-neg" : "bg-muted";
  const okCount = health ? health.checks.filter((c) => c.ok).length : null;

  return (
    <button
      onClick={refresh}
      className="focus-ring group relative hidden items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:text-fg lg:flex"
      aria-label="Network status — click to refresh"
      title={
        health
          ? health.checks.map((c) => `${c.provider}: ${c.ok ? "ok" : "down"}${c.latencyMs != null ? ` (${c.latencyMs}ms)` : ""}`).join("\n")
          : "Checking providers…"
      }
    >
      <span className={cn("h-2 w-2 rounded-full", dotColor, status === "ok" && "animate-live-pulse")} />
      <span>{status === "ok" ? "Live" : status === "degraded" ? "Degraded" : status === "down" ? "Offline" : "…"}</span>
      {okCount !== null && health && <span className="text-2xs">{okCount}/{health.checks.length}</span>}
      <span className="text-2xs text-muted/70 group-hover:text-muted">
        {loading ? "↻" : health ? `↑${Math.round((Date.now() - health.checkedAt) / 1000)}s` : ""}
      </span>
    </button>
  );
}