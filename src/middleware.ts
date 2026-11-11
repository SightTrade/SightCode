import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side rate limiting for public API routes.
 *
 * Per-client token bucket, refilled continuously. Applies to every /api/*
 * request BEFORE route handlers run, so a single abusive client can no longer
 * exhaust the shared free-tier budget of upstream market-data providers
 * (DexScreener 300 req/min, GeckoTerminal ~30 req/min) or hammer the
 * transaction-building endpoints.
 *
 * Scope and honest limitations:
 * - In-memory state: valid for the single-instance deployment used for beta.
 *   A multi-instance deployment must move this to Redis.
 * - Client identity uses x-forwarded-for / x-real-ip set by the edge proxy in
 *   front of the app. When running without a proxy this falls back to
 *   "local" (one shared bucket) — correct behavior for local development.
 */

const WINDOW_MS = 60_000;
const RATE_PER_WINDOW = 90; // requests per client per minute
const MAX_BUCKETS = 5_000;

const buckets = new Map<string, { tokens: number; updated: number }>();

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

function prune(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [k, b] of buckets) {
    if (now - b.updated > WINDOW_MS) buckets.delete(k);
    if (buckets.size <= MAX_BUCKETS / 2) break;
  }
}

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const now = Date.now();
  const key = clientKey(req);
  const bucket = buckets.get(key) ?? { tokens: RATE_PER_WINDOW, updated: now };
  // Continuous refill since the last update.
  bucket.tokens = Math.min(RATE_PER_WINDOW, bucket.tokens + ((now - bucket.updated) / WINDOW_MS) * RATE_PER_WINDOW);
  bucket.updated = now;
  buckets.set(key, bucket);
  prune(now);

  if (bucket.tokens < 1) {
    const retryAfter = Math.max(1, Math.ceil((1 - bucket.tokens) / (RATE_PER_WINDOW / (WINDOW_MS / 1000))));
    const res = NextResponse.json(
      { error: "Too many requests — slow down and retry shortly." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
    return res;
  }

  bucket.tokens -= 1;
  const res = NextResponse.next();
  res.headers.set("x-ratelimit-limit", String(RATE_PER_WINDOW));
  res.headers.set("x-ratelimit-remaining", String(Math.floor(bucket.tokens)));
  return res;
}

export const config = {
  matcher: "/api/:path*",
};