import { discoverySnapshot } from "@/lib/discovery/hub";

export const dynamic = "force-dynamic";

/**
 * GET /api/discover/status
 * JSON adapter health for the discovery pipeline (no subscription required).
 * Includes: connection status, last event/refresh time, limits, errors.
 */
export async function GET() {
  const snap = discoverySnapshot();
  return Response.json(
    {
      health: snap.health,
      tokenCount: snap.tokens.length,
      poolCount: snap.pools.length,
      serverTime: Date.now(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
