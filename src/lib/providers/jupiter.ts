import { fetchJson, ProviderError } from "./fetchJson";

/**
 * Jupiter API adapter (Solana swap aggregation).
 * Docs verified: https://developers.jup.ag — keyless access at 0.5 RPS on
 * api.jup.ag (no sign-up). A free API key (x-api-key) raises limits; set
 * JUPITER_API_KEY in server env. Keys never reach the client.
 *
 * Endpoints:
 *   GET  /swap/v1/quote   — route quote (inputMint, outputMint, amount, slippageBps)
 *   POST /swap/v1/swap    — build a base64-serialized VersionedTransaction for the quote
 *   GET  /price/v3?ids=   — USD prices
 *   GET  /tokens/v2/search?query= — token search with holderCount etc.
 */

const BASE = process.env.JUPITER_BASE || "https://api.jup.ag";
const PROVIDER = "Jupiter";

function headers(): Record<string, string> {
  const key = process.env.JUPITER_API_KEY;
  return key ? { "x-api-key": key } : {};
}

/**
 * Translate upstream auth/rate-limit failures into actionable, non-secret
 * messages. The API key itself is never included in any error text.
 */
async function withJupErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ProviderError) {
      if (e.status === 401 || e.status === 403) {
        throw new ProviderError(
          `Jupiter rejected the request (HTTP ${e.status}) — JUPITER_API_KEY is missing, invalid, or lacks access to this endpoint on your plan`,
          PROVIDER,
          e.status,
        );
      }
      if (e.status === 429) {
        throw new ProviderError(
          "Jupiter rate limit hit (HTTP 429) — set JUPITER_API_KEY or reduce request rate",
          PROVIDER,
          429,
        );
      }
    }
    throw e;
  }
}

export interface JupQuote {
  inputMint: string;
  outputMint: string;
  amount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct?: string | number | null;
  routePlan: { swapInfo: { label?: string; ammKey?: string }; percent: number }[];
  [k: string]: unknown;
}

export async function jupQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  onlyDirectRoutes?: boolean;
}): Promise<JupQuote> {
  const url =
    `${BASE}/swap/v1/quote?inputMint=${params.inputMint}` +
    `&outputMint=${params.outputMint}` +
    `&amount=${encodeURIComponent(params.amount)}` +
    `&slippageBps=${params.slippageBps}` +
    `&restrictIntermediateTokens=true`;
  return withJupErrors(() =>
    fetchJson<JupQuote>(url, { provider: PROVIDER, retries: 1, headers: headers() }),
  );
}

export interface JupSwapBuild {
  swapTransaction: string; // base64 VersionedTransaction, ready to sign
  lastValidBlockHeight?: number;
}

export async function jupSwapBuild(params: {
  quoteResponse: JupQuote;
  userPublicKey: string;
  priorityLevel?: "veryHigh" | "high" | "medium" | "low";
  maxLamports?: number;
}): Promise<JupSwapBuild> {
  const body = {
    quoteResponse: params.quoteResponse,
    userPublicKey: params.userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: false,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: {
        priorityLevel: params.priorityLevel ?? "medium",
        maxLamports: params.maxLamports ?? 1_000_000,
      },
    },
  };
  return withJupErrors(() =>
    fetchJson<JupSwapBuild>(`${BASE}/swap/v1/swap`, {
      provider: PROVIDER,
      method: "POST",
      headers: { "content-type": "application/json", ...headers() },
      body: JSON.stringify(body),
      retries: 0,
    }),
  );
}

export interface JupPrice {
  usdPrice: number;
  decimals?: number;
  priceChange24h?: number | null;
}

export async function jupPrices(mints: string[]): Promise<Record<string, JupPrice>> {
  if (mints.length === 0) return {};
  const res = await withJupErrors(() =>
    fetchJson<Record<string, { usdPrice?: number; decimals?: number; priceChange24h?: number | null }>>(
      `${BASE}/price/v3?ids=${encodeURIComponent(mints.slice(0, 50).join(","))}`,
      { provider: PROVIDER, retries: 1, headers: headers() },
    ),
  );
  const out: Record<string, JupPrice> = {};
  for (const [mint, v] of Object.entries(res)) {
    if (typeof v?.usdPrice === "number") {
      out[mint] = { usdPrice: v.usdPrice, decimals: v.decimals, priceChange24h: v.priceChange24h ?? null };
    }
  }
  return out;
}

export interface JupToken {
  id: string; // mint
  name: string;
  symbol: string;
  decimals: number;
  icon?: string | null;
  price?: string | number | null;
  mcap?: number | null;
  liquidity?: number | null;
  volume24h?: number | null;
  holderCount?: number | null;
  organicScore?: number | null;
  isVerified?: boolean | null;
  circulatingSupply?: number | null;
  totalSupply?: number | null;
}

export async function jupTokenSearch(query: string): Promise<JupToken[]> {
  const res = await withJupErrors(() =>
    fetchJson<JupToken[]>(`${BASE}/tokens/v2/search?query=${encodeURIComponent(query)}`, {
      provider: PROVIDER,
      retries: 1,
      headers: headers(),
    }),
  );
  return Array.isArray(res) ? res : [];
}

/** Best-effort single-token lookup by mint (used to enrich Solana token detail). */
export async function jupTokenByMint(mint: string): Promise<JupToken | null> {
  const results = await jupTokenSearch(mint);
  return results.find((t) => t.id === mint) ?? null;
}