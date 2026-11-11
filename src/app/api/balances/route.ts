import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, erc20Abi, formatUnits, type Chain } from "viem";
import { mainnet, base, bsc } from "viem/chains";
import { CHAINS, type ChainId } from "@/lib/chains";
import { getConnection } from "@/lib/providers/solanaRpc";
import { jupPrices } from "@/lib/providers/jupiter";
import { isEvmAddress, isSolanaAddress } from "@/lib/chains";
import type { WalletHoldings } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/balances?chain=&address=&tokens=a,b,c
 * Solana: full SPL token scan + native SOL via RPC, priced with Jupiter.
 * EVM: native balance via RPC plus balances for the explicitly requested
 * token list (client sends watched/traded tokens). Full EVM portfolio scans
 * require an indexer — the response says so honestly.
 */
const VIEM_CHAINS: Record<string, Chain> = { ethereum: mainnet, base, bsc };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const chainId = (sp.get("chain") ?? "") as ChainId;
  const address = sp.get("address") ?? "";
  const requestedTokens = (sp.get("tokens") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  const chain = CHAINS[chainId];
  if (!chain || chain.status === "unconfigured") {
    return NextResponse.json({ error: `Balances are not available for "${chainId}".` }, { status: 400 });
  }
  const fetchedAt = Date.now();

  if (chain.kind === "solana") {
    if (!isSolanaAddress(address)) return NextResponse.json({ error: "invalid Solana address" }, { status: 400 });
    try {
      const conn = getConnection();
      const owner = new PublicKey(address);
      const [solBalance, tokenAccounts] = await Promise.all([
        conn.getBalance(owner),
        conn.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }),
      ]);
      const mints: string[] = [];
      const holdings: WalletHoldings["tokens"] = [];
      for (const acc of tokenAccounts.value) {
        const info = acc.account.data.parsed?.info;
        if (!info) continue;
        const amount = info.tokenAmount?.amount ?? "0";
        const decimals = info.tokenAmount?.decimals ?? null;
        if (amount === "0") continue;
        const mint = info.mint as string;
        if (!mints.includes(mint)) mints.push(mint);
        holdings.push({
          address: mint,
          symbol: null,
          name: null,
          balance: amount,
          decimals,
          priceUsd: null,
          valueUsd: null,
        });
      }
      // Price everything we can with Jupiter (50 ids max per call).
      const prices: Record<string, Awaited<ReturnType<typeof jupPrices>>[string]> = mints.length
        ? await jupPrices(mints.slice(0, 50)).catch(() => ({}))
        : {};
      for (const h of holdings) {
        const p = prices[h.address];
        if (p) {
          h.priceUsd = p.usdPrice;
          if (h.decimals !== null) {
            const human = Number(BigInt(h.balance)) / 10 ** h.decimals;
            h.valueUsd = human * p.usdPrice;
          }
        }
      }
      const solPrice = prices["So11111111111111111111111111111111111111112"];
      const out: WalletHoldings = {
        chain: "solana",
        address,
        nativeBalance: String(solBalance),
        tokens: holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)),
        fetchedAt,
        coverage: "full",
        note:
          "All SPL token accounts and native SOL scanned via RPC. Prices from Jupiter where available; unlisted tokens show no price." +
          (solPrice ? ` SOL ≈ $${solPrice.usdPrice.toFixed(2)}.` : ""),
      };
      return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      return NextResponse.json(
        { error: `Solana balance scan failed: ${String(e).slice(0, 160)}` },
        { status: 502 },
      );
    }
  }

  // ---- EVM ----
  if (!isEvmAddress(address)) return NextResponse.json({ error: "invalid EVM address" }, { status: 400 });
  const rpc = process.env[chain.rpcEnvKey] || chain.defaultRpc;
  const viemChain = VIEM_CHAINS[chainId];
  try {
    const client = createPublicClient({ chain: viemChain, transport: http(rpc) });
    const native = await client.getBalance({ address: address as `0x${string}` });
    const tokens: WalletHoldings["tokens"] = [];
    for (const t of requestedTokens) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(t)) continue;
      try {
        const [balance, decimals, symbol] = await Promise.all([
          client.readContract({ address: t as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [address as `0x${string}`] }),
          client.readContract({ address: t as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
          client.readContract({ address: t as `0x${string}`, abi: erc20Abi, functionName: "symbol" }).catch(() => null),
        ]);
        if (balance === 0n) continue;
        tokens.push({
          address: t,
          symbol: symbol ?? null,
          name: null,
          balance: balance.toString(),
          decimals,
          priceUsd: null, // EVM token pricing requires a price provider — labeled unavailable
          valueUsd: null,
        });
      } catch {
        // skip unreadable contracts
      }
    }
    const out: WalletHoldings = {
      chain: chainId,
      address,
      nativeBalance: formatUnits(native, 18),
      tokens,
      fetchedAt,
      coverage: "partial",
      note: "Native balance and balances for requested tokens read directly from RPC. A full token portfolio scan on EVM requires an indexer (e.g. Alchemy); token USD pricing needs a price provider.",
    };
    return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `EVM balance read failed: ${String(e).slice(0, 160)}` }, { status: 502 });
  }
}