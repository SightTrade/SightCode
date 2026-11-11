import { NextRequest, NextResponse } from "next/server";
import { CHAINS } from "@/lib/chains";
import { getV2Quote, type EvmSwapChain } from "@/lib/providers/evmDex";

export const dynamic = "force-dynamic";

/**
 * POST /api/evm/quote — quote a native↔token swap on the chain's established
 * V2 router (Uniswap V2 / PancakeSwap V2). The router's deployment is verified
 * against the live RPC before quoting. Chain must be ethereum, base, or bsc —
 * unsupported chains (including unconfigured Robinhood Chain) are refused.
 */
export async function POST(req: NextRequest) {
  let body: {
    chain?: string;
    token?: string;
    amountRaw?: string;
    side?: string;
    slippageBps?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const chain = body.chain as EvmSwapChain;
  if (!chain || !(chain in { ethereum: 1, base: 1, bsc: 1 })) {
    return NextResponse.json(
      { error: `EVM trading is only enabled on ethereum, base and bsc. "${body.chain ?? ""}" is not configured.` },
      { status: 501 },
    );
  }
  const chainCfg = CHAINS[chain];
  const rpcUrl = process.env[chainCfg.rpcEnvKey] || chainCfg.defaultRpc;
  if (!rpcUrl) {
    return NextResponse.json({ error: `${chainCfg.name} RPC is not configured` }, { status: 501 });
  }

  const side = body.side === "sell" ? "sell" : "buy";
  if (!body.token || !body.amountRaw) {
    return NextResponse.json({ error: "token and amountRaw are required" }, { status: 400 });
  }

  try {
    const quote = await getV2Quote({
      chain,
      rpcUrl,
      token: body.token,
      amountRaw: body.amountRaw,
      side,
      slippageBps: body.slippageBps ?? 100,
    });
    return NextResponse.json(quote, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status });
  }
}