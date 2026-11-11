import { NextResponse } from "next/server";
import { CHAINS } from "@/lib/chains";
import { fetchJson } from "@/lib/providers/fetchJson";
import { getSlot } from "@/lib/providers/solanaRpc";
import { jupPrices } from "@/lib/providers/jupiter";
import { SOLANA_WSOL } from "@/lib/chains";

export const dynamic = "force-dynamic";

/**
 * Live provider health for the network status indicator.
 * Each check is a real, tiny request against the actual provider endpoint.
 */
interface Check {
  provider: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
}

async function timedCheck(name: string, fn: () => Promise<string>, okDetail = "ok"): Promise<Check> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { provider: name, ok: true, latencyMs: Date.now() - t0, detail: detail || okDetail };
  } catch (e) {
    return { provider: name, ok: false, latencyMs: null, detail: e instanceof Error ? e.message : "failed" };
  }
}

const evmChainCheck = (id: "ethereum" | "bsc" | "base") => async () => {
  const cfg = CHAINS[id];
  const url = process.env[cfg.rpcEnvKey] || cfg.defaultRpc;
  const rpc = (method: string) =>
    fetchJson<{ result: string }>(url, {
      provider: cfg.name,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      retries: 0,
      timeoutMs: 6000,
    });
  // Chain-ID verification: a misconfigured endpoint (e.g. an Ethereum URL
  // pasted as the Base RPC) must be reported, never trusted.
  const chainId = Number.parseInt((await rpc("eth_chainId")).result, 16);
  if (cfg.evmChainId !== null && chainId !== cfg.evmChainId) {
    throw new Error(
      `chain id mismatch — endpoint returned ${chainId} but ${cfg.name} expects ${cfg.evmChainId} (check ${cfg.rpcEnvKey})`,
    );
  }
  const block = await rpc("eth_blockNumber");
  return `chainId ${chainId} · block ${Number.parseInt(block.result, 16)}`;
};

export async function GET() {
  const checks = await Promise.all([
    timedCheck("DexScreener", async () => {
      await fetchJson(`${process.env.DEXSCREENER_BASE || "https://api.dexscreener.com"}/latest/dex/search?q=USDC`, {
        provider: "DexScreener", retries: 0, timeoutMs: 8000,
      });
      return "search ok";
    }),
    timedCheck("GeckoTerminal", async () => {
      const r = await fetchJson<{ data: unknown[] }>(
        `${process.env.GECKOTERMINAL_BASE || "https://api.geckoterminal.com"}/api/v2/networks`,
        { provider: "GeckoTerminal", retries: 0, timeoutMs: 8000 },
      );
      return `${r.data?.length ?? 0} networks`;
    }),
    timedCheck("Jupiter", async () => {
      const p = await jupPrices([SOLANA_WSOL]);
      return p[SOLANA_WSOL] ? `WSOL $${p[SOLANA_WSOL].usdPrice.toFixed(2)}` : "no price";
    }),
    timedCheck("Solana RPC", async () => {
      const slot = await getSlot();
      return slot ? `slot ${slot}` : "no slot";
    }),
    ...(["ethereum", "bsc", "base"] as const)
      .filter((id) => CHAINS[id].status !== "unconfigured")
      .map((id) => timedCheck(`${CHAINS[id].name} RPC`, evmChainCheck(id))),
  ]);

  const degraded = checks.filter((c) => !c.ok);
  return NextResponse.json({
    status: degraded.length === 0 ? "ok" : degraded.length < checks.length / 2 ? "degraded" : "down",
    checkedAt: Date.now(),
    checks,
  });
}