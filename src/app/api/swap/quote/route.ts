import { NextRequest, NextResponse } from "next/server";
import { jupQuote } from "@/lib/providers/jupiter";
import { isSolanaAddress } from "@/lib/chains";
import { toRaw } from "@/lib/format";
import type { QuoteResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/swap/quote — Solana swap quote via Jupiter (server-proxied so any
 * API key stays server-side). Requested amounts are validated; raw units are
 * computed with integer math (never floats) before hitting the provider.
 */
export async function POST(req: NextRequest) {
  let body: {
    chain?: string;
    inputMint?: string;
    outputMint?: string;
    amountRaw?: string;
    amountHuman?: string;
    inputDecimals?: number;
    slippageBps?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.chain && body.chain !== "solana") {
    return NextResponse.json(
      { error: `Swap execution is only enabled on Solana. "${body.chain}" is not configured for trading.` },
      { status: 501 },
    );
  }
  const { inputMint, outputMint, amountRaw, amountHuman, inputDecimals, slippageBps } = body;
  if (!inputMint || !outputMint || !isSolanaAddress(inputMint) || !isSolanaAddress(outputMint)) {
    return NextResponse.json({ error: "inputMint and outputMint must be valid Solana mint addresses" }, { status: 400 });
  }
  if (inputMint === outputMint) {
    return NextResponse.json({ error: "Input and output mints are identical" }, { status: 400 });
  }

  let raw = amountRaw ?? null;
  if (!raw && amountHuman !== undefined && inputDecimals !== undefined) {
    const amountStr = String(amountHuman);
    if (!/^\d*\.?\d+$/.test(amountStr) || Number(amountStr) <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    if (Number(amountStr) * Number("1e" + inputDecimals) < 1) {
      return NextResponse.json({ error: "amount is too small" }, { status: 400 });
    }
    raw = toRaw(amountStr, inputDecimals);
  }
  if (!raw || !/^\d+$/.test(raw)) {
    return NextResponse.json({ error: "amount missing or invalid" }, { status: 400 });
  }

  const slip = Math.min(Math.max(slippageBps ?? 50, 0), 3000);

  try {
    const q = await jupQuote({
      inputMint,
      outputMint,
      amount: raw,
      slippageBps: slip,
    });
    const result: QuoteResult = {
      inputMint: q.inputMint,
      outputMint: q.outputMint,
      inAmount: q.amount,
      outAmount: typeof q.outAmount === "string" ? q.outAmount : "0",
      otherAmountThreshold: typeof q.otherAmountThreshold === "string" ? q.otherAmountThreshold : "0",
      slippageBps: q.slippageBps ?? slip,
      priceImpactPct: q.priceImpactPct != null ? Number(q.priceImpactPct) : null,
      routeLabels: (q.routePlan ?? []).map((s) => s.swapInfo?.label ?? "unknown AMM"),
      raw: q,
      provider: "Jupiter",
    };
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: `Quote unavailable: ${String(e).slice(0, 200)}` },
      { status: 502 },
    );
  }
}