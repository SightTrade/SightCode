import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet, base, bsc } from "viem/chains";
import { CHAINS } from "@/lib/chains";

export const dynamic = "force-dynamic";

/**
 * GET /api/evm/tx/[hash]?chain= — real EVM transaction receipt status from RPC.
 * Used to track swap submissions: confirmed (receipt exists), pending, failed.
 */
const VIEM_CHAINS: Record<string, typeof mainnet | typeof base | typeof bsc> = {
  ethereum: mainnet,
  base,
  bsc,
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  const chainId = req.nextUrl.searchParams.get("chain") ?? "";
  const viemChain = VIEM_CHAINS[chainId];
  if (!viemChain) {
    return NextResponse.json({ error: "chain must be ethereum, base or bsc" }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: "invalid transaction hash" }, { status: 400 });
  }
  const chainCfg = CHAINS[chainId as keyof typeof CHAINS];
  const rpcUrl = process.env[chainCfg.rpcEnvKey] || chainCfg.defaultRpc;
  try {
    const client = createPublicClient({ chain: viemChain, transport: http(rpcUrl) });
    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    return NextResponse.json({
      hash,
      status: receipt.status === "success" ? "confirmed" : "failed",
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      explorerUrl: chainCfg.explorer?.tx(hash) ?? null,
    });
  } catch {
    // Receipt not found yet — the transaction is still pending (or was dropped).
    return NextResponse.json({ hash, status: "pending", explorerUrl: chainCfg.explorer?.tx(hash) ?? null });
  }
}