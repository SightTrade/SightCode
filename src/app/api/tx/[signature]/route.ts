import { NextRequest, NextResponse } from "next/server";
import { getSignatureStatus } from "@/lib/providers/solanaRpc";

export const dynamic = "force-dynamic";

/**
 * GET /api/tx/[signature] — real Solana transaction status from RPC.
 * Used to track submitted swaps: confirmed / pending / failed.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ signature: string }> }) {
  const { signature } = await ctx.params;
  if (signature.length < 32) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const status = await getSignatureStatus(signature);
  if (!status) {
    return NextResponse.json({ signature, status: "unknown" as const, detail: "Not yet seen by the RPC node — the transaction may still be in flight." });
  }
  return NextResponse.json({ signature, status: status.status, err: status.err ?? null });
}