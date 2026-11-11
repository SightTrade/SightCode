import { NextResponse, type NextRequest } from "next/server";
import { CHAINS } from "@/lib/chains";

export const dynamic = "force-dynamic";

/**
 * POST /api/rpc/[chain] — chain-aware JSON-RPC proxy for browser-side EVM reads
 * and embedded-wallet transfer support.
 *
 * Why this exists: browser code must never talk to a single shared EVM URL for
 * all chains (an Ethereum endpoint would silently serve wrong-network data for
 * Base/BNB requests), and provider endpoints like Alchemy embed their API key
 * in the URL — exposing one via NEXT_PUBLIC_ would leak the credential. This
 * proxy resolves each chain to its own server-side endpoint
 * (`process.env[chain.rpcEnvKey]`, e.g. the Alchemy URL) so:
 *   - every request always reaches the correct network, and
 *   - provider credentials stay server-side.
 *
 * Guardrails: only configured EVM chains; JSON-RPC method allowlist
 * (eth_-, net_- and web3_-prefixed methods); request-size cap; upstream
 * timeout. Rate limiting is applied globally by src/middleware.ts.
 */

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH = 100;
const UPSTREAM_TIMEOUT_MS = 15_000;
const ALLOWED_METHOD_PREFIXES = ["eth_", "net_", "web3_"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ chain: string }> }) {
  const { chain: chainId } = await ctx.params;
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain || chain.kind !== "evm" || chain.status === "unconfigured") {
    return NextResponse.json(
      { error: `RPC proxy is not available for "${chainId}".` },
      { status: 400 },
    );
  }

  const raw = await req.text();
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "RPC request body too large." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON-RPC." }, { status: 400 });
  }

  const calls: { method?: unknown }[] = Array.isArray(parsed)
    ? (parsed as { method?: unknown }[])
    : [parsed as { method?: unknown }];
  if (calls.length === 0 || calls.length > MAX_BATCH) {
    return NextResponse.json({ error: "Invalid JSON-RPC batch size." }, { status: 400 });
  }
  const methods: string[] = [];
  for (const call of calls) {
    if (!call || typeof call !== "object" || typeof call.method !== "string") {
      return NextResponse.json({ error: "Each JSON-RPC call requires a method." }, { status: 400 });
    }
    methods.push(call.method);
  }
  if (!methods.every((m) => ALLOWED_METHOD_PREFIXES.some((p) => m.startsWith(p)))) {
    return NextResponse.json(
      { error: `RPC method not allowed through this proxy.` },
      { status: 403 },
    );
  }

  // Per-chain endpoint from server env — never user-supplied, never returned.
  const upstreamUrl = process.env[chain.rpcEnvKey] || chain.defaultRpc;
  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    // Sanitized: the secret-bearing upstream URL is never echoed.
    const detail = e instanceof Error ? e.message.slice(0, 140) : "upstream request failed";
    return NextResponse.json({ error: `RPC upstream failed: ${detail}` }, { status: 502 });
  }
}