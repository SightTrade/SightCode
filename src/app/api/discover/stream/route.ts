import { NextRequest } from "next/server";
import { discoverySnapshot, subscribeDiscovery } from "@/lib/discovery/hub";

export const dynamic = "force-dynamic";

/**
 * GET /api/discover/stream
 *
 * Server-Sent Events stream of live discovery records (new tokens + new pools).
 *
 * Architecture: ONE server-side event pipeline per Next.js process — upstream
 * connections (PumpPortal WebSocket, per-network GeckoTerminal pollers) are
 * shared across every connected client. The pipeline starts on the first
 * subscriber and stops ~30s after the last disconnects, so idle pages never
 * hold upstream connections. Visitors never connect to upstream providers
 * directly and never see provider credentials.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // stream already closed
        }
      };
      // Initial snapshot: current stores + adapter health.
      send(`data: ${JSON.stringify({ type: "snapshot", ...discoverySnapshot(), serverTime: Date.now() })}\n\n`);
      unsubscribe = subscribeDiscovery(send);
      // SSE keep-alive comment every 25s (proxies kill idle streams).
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // closed
        }
      }, 25_000);
      req.signal.addEventListener("abort", () => {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
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
