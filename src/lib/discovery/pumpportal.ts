import type { AdapterHealth, DiscoveryToken, DiscoveryPool } from "./model";

/**
 * PumpPortal real-time data feed adapter (Solana).
 *
 * Feed: wss://pumpportal.fun/api/data  — free methods only:
 *   subscribeNewToken  (token creation on Pump.fun)          FREE
 *   subscribeMigration (bonding-curve graduation to AMM)     FREE
 * Metered trade streams (subscribeTokenTrade / subscribeAccountTrade) are
 * intentionally NOT used — they cost 0.01 SOL per 10k events.
 * Verified live: the free methods require no API key and connect directly.
 * Docs: https://pumpportal.fun/data-api/real-time/ — ONE connection per client;
 * repeated connection attempts can be rate-limited (bans expire hourly).
 */

export const DEFAULT_PUMPPORTAL_WS_URL = "wss://pumpportal.fun/api/data";

/** Resolved lazily (at connect time) so tests can override the endpoint. */
export function pumpPortalUrl(): string {
  return process.env.PUMPPORTAL_WS_URL || DEFAULT_PUMPPORTAL_WS_URL;
}

export interface PumpPortalAdapterEvents {
  onTokenLaunch: (token: DiscoveryToken) => void;
  onPoolLaunch: (pool: DiscoveryPool) => void;
  onStatus: (status: "connecting" | "live" | "down" | "disabled", lastError: string | null) => void;
}

/** Normalized result of parsing one PumpPortal message. */
export type PumpPortalParsed =
  | { kind: "token-launch"; token: DiscoveryToken }
  | { kind: "pool-launch"; pool: DiscoveryPool }
  | { kind: "ignore" };

/**
 * Pure parser — unit-testable against live-captured payload shapes.
 * Observed token-creation event fields (live capture):
 *   signature, mint, traderPublicKey, txType, initialBuy, solAmount,
 *   bondingCurveKey, vTokensInBondingCurve, vSolInBondingCurve,
 *   marketCapSol, name, symbol, uri, is_mayhem_mode, pool
 * Migration events (documented by PumpPortal): signature, mint, poolType,
 *   newPoolAddress, newPoolTokenAccount, newPoolSolReserves, …
 */
export function parsePumpPortalEvent(raw: unknown, now = Date.now()): PumpPortalParsed {
  if (typeof raw !== "object" || raw === null) return { kind: "ignore" };
  const m = raw as Record<string, unknown>;
  const txType = typeof m.txType === "string" ? m.txType : "";
  const mint = typeof m.mint === "string" ? m.mint : null;
  if (!mint) return { kind: "ignore" };

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  if (txType === "create") {
    return {
      kind: "token-launch",
      token: {
        id: `solana:${mint.toLowerCase()}`,
        chain: "solana",
        tokenAddress: mint,
        tokenName: typeof m.name === "string" ? m.name : null,
        tokenSymbol: typeof m.symbol === "string" ? m.symbol : null,
        tokenImage: null,
        metadataUri: typeof m.uri === "string" ? m.uri : null,
        launchpadName: "Pump.fun",
        launchTransaction: typeof m.signature === "string" ? m.signature : null,
        launchTimestamp: null, // the feed does not include a timestamp — never fabricate
        firstSeenTimestamp: now,
        graduatedAt: null,
        graduatedPoolAddress: null,
        poolStatus: "none",
        bondingCurveMcSol: num(m.marketCapSol),
        initialBuySol: num(m.initialBuy),
        metadataStatus: "pending",
        dataSource: "PumpPortal",
        lastUpdatedAt: now,
      },
    };
  }

  if (txType === "migration" || typeof m.newPoolAddress === "string") {
    const poolAddress = typeof m.newPoolAddress === "string" ? m.newPoolAddress : null;
    if (!poolAddress) return { kind: "ignore" };
    const poolType = typeof m.poolType === "string" ? m.poolType : "";
    const dexName = poolType ? (poolType === "PUMP_SWAP" ? "PumpSwap" : poolType) : "PumpSwap";
    const solReserves = num(m.newPoolSolReserves) ?? num(m.newPoolVirtualSolReserves);
    return {
      kind: "pool-launch",
      pool: {
        id: `solana:${poolAddress.toLowerCase()}`,
        chain: "solana",
        poolAddress,
        dexName,
        launchpadName: "Pump.fun",
        baseTokenAddress: mint,
        baseTokenSymbol: typeof m.symbol === "string" ? m.symbol : null,
        baseTokenName: typeof m.name === "string" ? m.name : null,
        quoteTokenAddress: null, // feed does not report the quote mint — never fabricate
        createdAt: null,
        firstSeenTimestamp: now,
        liquidityUsd: null, // reserves are in SOL; USD enrichment comes from the pool poller
        priceUsd: null,
        volume5mUsd: null,
        volume1hUsd: null,
        volume6hUsd: null,
        volume24hUsd: null,
        transactions5m: null,
        buys5m: null,
        sells5m: null,
        marketCapUsd: null,
        fullyDilutedValuationUsd: null,
        poolStatus: solReserves !== null && solReserves > 0 ? "active" : "unknown",
        sources: ["PumpPortal"],
        tokenImage: null,
        lastUpdatedAt: now,
      },
    };
  }

  return { kind: "ignore" };
}
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
/** A silently quiet feed on Solana is abnormal — creations flow continuously. */
const STALE_RECONNECT_MS = 10 * 60_000;

/**
 * Creates (but does not start) the adapter. The hub owns the lifecycle.
 * Single WebSocket connection; reconnect with exponential backoff + jitter;
 * re-subscribes after every reconnect. No duplicate connections are opened.
 */
export function createPumpPortalAdapter(events: PumpPortalAdapterEvents) {
  let ws: WebSocket | null = null;
  let stopped = true;
  let backoffMs = RECONNECT_BASE_MS;
  let reconnects = 0;
  let eventsObserved = 0;
  let lastEventAt: number | null = null;
  let lastError: string | null = null;
  let staleTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectScheduled = false;

  function scheduleStale() {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      lastError = "no events received in 10 minutes — reconnecting";
      events.onStatus("down", lastError);
      scheduleReconnect();
    }, STALE_RECONNECT_MS);
  }

  function connect() {
    if (stopped) return;
    reconnectScheduled = false;
    events.onStatus("connecting", null);
    try {
      ws = new WebSocket(pumpPortalUrl());
    } catch (e) {
      lastError = String((e as Error).message ?? e).slice(0, 160);
      events.onStatus("down", lastError);
      scheduleReconnect();
      return;
    }
    ws.addEventListener("open", () => {
      backoffMs = RECONNECT_BASE_MS; // reset backoff after a successful connect
      try {
        ws?.send(JSON.stringify({ method: "subscribeNewToken" }));
        ws?.send(JSON.stringify({ method: "subscribeMigration" }));
        events.onStatus("live", null);
        scheduleStale();
      } catch (e) {
        lastError = String((e as Error).message ?? e).slice(0, 160);
      }
    });
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
        const parsed = parsePumpPortalEvent(msg);
        if (parsed.kind === "ignore") return;
        eventsObserved += 1;
        lastEventAt = Date.now();
        scheduleStale();
        if (parsed.kind === "token-launch") events.onTokenLaunch(parsed.token);
        else events.onPoolLaunch(parsed.pool);
      } catch {
        // malformed frame — ignore, connection stays up
      }
    });
    ws.addEventListener("error", () => {
      // Null out BEFORE close(): closing a never-opened socket can make the
      // runtime re-dispatch error/close synchronously; if `ws` were still set,
      // each nested dispatch would call close() again (unbounded recursion).
      const sock = ws;
      ws = null;
      lastError = "websocket error";
      events.onStatus("down", lastError);
      try {
        sock?.close();
      } catch {
        // ignore
      }
      scheduleReconnect();
    });
    ws.addEventListener("close", () => {
      ws = null;
      scheduleReconnect();
    });
  }

  function scheduleReconnect() {
    if (stopped || reconnectScheduled) return;
    reconnectScheduled = true;
    reconnects += 1;
    const jitter = backoffMs * 0.2;
    const delay = Math.round(backoffMs + (Math.random() * 2 - 1) * jitter);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectScheduled = false;
      backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
      connect();
    }, delay);
  }

  return {
    id: "pumpportal-solana",
    label: "PumpPortal · Solana (Pump.fun)",
    chain: "solana" as const,
    limits:
      "Free token-creation + migration feed (no key). One connection per client; no historical backfill; bonding-curve tokens have no AMM pool until migration.",
    start() {
      if (!stopped) return;
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      if (staleTimer) clearTimeout(staleTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      staleTimer = null;
      reconnectTimer = null;
      // Null out BEFORE close() — same re-entrancy rule as the error handler.
      const sock = ws;
      ws = null;
      try {
        sock?.close();
      } catch {
        // ignore
      }
      events.onStatus("disabled", null);
    },
    health() {
      return {
        id: "pumpportal-solana",
        label: "PumpPortal · Solana (Pump.fun)",
        chain: "solana" as const,
        status: (lastEventAt !== null ? "live" : stopped ? "disabled" : "connecting") as AdapterHealth["status"],
        lastEventAt,
        lastRefreshAt: lastEventAt,
        limits:
          "Free token-creation + migration feed (no key). One connection per client; no historical backfill; bonding-curve tokens have no AMM pool until migration.",
        lastError,
        reconnects,
        eventsObserved,
      };
    },
  };
}

export type PumpPortalAdapter = ReturnType<typeof createPumpPortalAdapter>;
