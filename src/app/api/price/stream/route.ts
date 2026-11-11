import { NextRequest } from "next/server";
import { CHAINS } from "@/lib/chains";
import { dexTokenSnapshot } from "@/lib/providers/dexscreener";

export const dynamic = "force-dynamic";

/**
 * GET /api/price/stream?chain=&token=
 *
 * Server-Sent Events stream of live price snapshots for one token.
 *
 * Architecture: a single server-side poller per `chain:token` feeds every
 * connected chart client (shared upstream connection — never one upstream per
 * chart instance). Poller lifecycle is ref-counted: it starts on the first
 * subscriber and stops shortly after the last disconnects.
 *
 * Upstream: DexScreener free API (300 req/min verified; pair endpoints only).
 * The free tier has NO trade websocket, so updates are periodic snapshots —
 * every event is labeled as such and the UI renders a LIVE/STALE badge from
 * snapshot recency, not fabricated ticks.
 *
 * Rate budget: poll interval 4s (15 req/min/token) with a 16-poller cap keeps
 * worst-case usage under 240 req/min. Persistent 429s double the interval.
 */

const POLL_MS = 4_000;
const MAX_POLLERS = 16;

interface Poller {
  refCount: number;
  subscribers: Set<(payload: string) => void>;
  timer: ReturnType<typeof setTimeout> | null;
  pollMs: number;
  lastFetchedAt: number;
  stopped: boolean;
}

const pollers = new Map<string, Poller>();

function keyFor(dexChain: string, token: string) {
  return `${dexChain}:${token.toLowerCase()}`;
}

async function pollOnce(poller: Poller, dexChain: string, token: string, key: string) {
  if (poller.stopped) return;
  try {
    const snap = await dexTokenSnapshot(dexChain, token);
    if (snap.fetchedAt === poller.lastFetchedAt) return; // shared cache hit — nothing new
    poller.lastFetchedAt = snap.fetchedAt;
    poller.pollMs = POLL_MS; // reset backoff on success
    const payload = JSON.stringify({ type: "snapshot", snapshot: snap });
    for (const send of poller.subscribers) send(payload);
  } catch (e) {
    // Honest error event; keep the stream alive with backoff.
    const msg = e instanceof Error ? e.message : String(e);
    if (/429/.test(msg)) poller.pollMs = Math.min(poller.pollMs * 2, 30_000);
    const payload = JSON.stringify({ type: "error", error: msg.slice(0, 160), retryMs: poller.pollMs });
    for (const send of poller.subscribers) send(payload);
  } finally {
    if (!poller.stopped && poller.subscribers.size > 0) {
      poller.timer = setTimeout(() => void pollOnce(poller, dexChain, token, key), poller.pollMs);
    }
  }
}

function releasePoller(key: string) {
  const poller = pollers.get(key);
  if (!poller) return;
  poller.refCount -= 1;
  if (poller.refCount <= 0) {
    poller.stopped = true;
    if (poller.timer) clearTimeout(poller.timer);
    pollers.delete(key);
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const chainId = sp.get("chain") ?? "";
  const token = (sp.get("token") ?? "").trim();
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  const dexChain = chain?.dexscreenerChain ?? null;
  if (!chain || !dexChain) {
    return new Response(
      JSON.stringify({ error: `Live prices are not available for chain "${chainId}".` }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (!token) {
    return new Response(JSON.stringify({ error: "token address required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const key = keyFor(dexChain, token);
  if (!pollers.has(key) && pollers.size >= MAX_POLLERS) {
    return new Response(
      JSON.stringify({ error: "Live stream capacity reached — retry shortly." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  let registered = false;
  let poller: Poller | undefined;
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // stream already closed
        }
      };

      if (!pollers.has(key)) {
        const fresh: Poller = { refCount: 0, subscribers: new Set(), timer: null, pollMs: POLL_MS, lastFetchedAt: 0, stopped: false };
        pollers.set(key, fresh);
      }
      poller = pollers.get(key);
      if (!poller) return;
      poller.refCount += 1;
      poller.subscribers.add(send);
      registered = true;

      cleanup = () => {
        if (registered && poller) {
          poller.subscribers.delete(send);
          releasePoller(key);
          registered = false;
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Client-disconnect cleanup.
      req.signal.addEventListener("abort", () => cleanup?.());

      // First snapshot immediately (awaited so clients render a price fast).
      await pollOnce(poller, dexChain, token, key);
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}