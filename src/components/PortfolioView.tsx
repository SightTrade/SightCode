"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHAINS, TRADABLE_CHAINS, type ChainId } from "@/lib/chains";
import { useWallet, useWatchlists } from "@/lib/store";
import { fmtNum, fmtUsd, shortAddr } from "@/lib/format";
import type { WalletHoldings } from "@/lib/types";

/**
 * Portfolio. Shows real balances for a connected or manually entered wallet.
 * Solana gets a full SPL scan; EVM shows native balance (full token scan needs
 * an indexer — the page says so). P&L is only estimated where a cost basis
 * exists (local trade ledger), and labeled accordingly.
 */
export function PortfolioView() {
  const { solanaAddress, evmAddress } = useWallet();
  const { tokens: watchedTokens } = useWatchlists();
  const [chain, setChain] = useState<ChainId>("solana");
  const [manualAddress, setManualAddress] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<WalletHoldings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectedForChain = chain === "solana" ? solanaAddress : evmAddress;
  const effectiveAddress = address ?? connectedForChain;

  useEffect(() => {
    if (!effectiveAddress) {
      setHoldings(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const tokenList = watchedTokens
      .filter((t) => t.chain === chain)
      .map((t) => t.address)
      .join(",");
    fetch(`/api/balances?chain=${chain}&address=${encodeURIComponent(effectiveAddress)}&tokens=${tokenList}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setHoldings(body as WalletHoldings);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveAddress, chain, watchedTokens]);

  const cfg = CHAINS[chain];
  const total = holdings?.tokens.reduce((acc, t) => acc + (t.valueUsd ?? 0), 0) ?? null;

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-fg">Portfolio</h1>
          <p className="mt-1 text-xs text-muted">Live on-chain balances for the selected wallet.</p>
        </div>
        <select value={chain} onChange={(e) => { setChain(e.target.value as ChainId); setAddress(null); }} className="input ml-auto h-9 w-auto py-0 text-xs" aria-label="Portfolio network">
          {TRADABLE_CHAINS.map((c) => (
            <option key={c} value={c}>{CHAINS[c].name}</option>
          ))}
        </select>
        {!connectedForChain && (
          <input
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            placeholder="Or paste a wallet address"
            className="input h-9 w-72 font-mono text-xs"
            aria-label="Wallet address"
          />
        )}
        {!connectedForChain && manualAddress.trim().length > 20 && (
          <button onClick={() => setAddress(manualAddress.trim())} className="btn-primary focus-ring h-9 px-3 text-xs">
            Load
          </button>
        )}
      </div>

      {!effectiveAddress ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-fg">No wallet connected</p>
          <p className="mt-1.5 text-xs text-muted">
            Connect a {cfg.name} wallet in the top bar, or paste any address above to inspect its holdings.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="panel p-3">
              <p className="text-2xs text-muted">Wallet</p>
              <p className="mt-1 font-mono text-xs text-fg">{shortAddr(effectiveAddress, 8, 8)}</p>
            </div>
            <div className="panel p-3">
              <p className="text-2xs text-muted">Priced token value</p>
              <p className="tabular mt-1 text-lg font-bold text-fg">{fmtUsd(total)}</p>
            </div>
            <div className="panel p-3">
              <p className="text-2xs text-muted">Native balance</p>
              <p className="tabular mt-1 text-lg font-bold text-fg">
                {holdings?.nativeBalance
                  ? fmtNum(
                      chain === "solana" ? Number(BigInt(holdings.nativeBalance)) / 1e9 : Number(holdings.nativeBalance),
                      4,
                    )
                  : "—"}{" "}
                <span className="text-xs text-muted">{cfg.nativeToken.symbol}</span>
              </p>
            </div>
          </div>

          <div className="panel p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg">Token balances</h2>
              <span className="chip">{holdings?.coverage ?? "…"} coverage</span>
            </div>
            {loading && <p className="py-4 text-xs text-muted">Reading balances from the chain…</p>}
            {error && <p className="py-2 text-xs text-neg">Failed: {error}</p>}
            {holdings && (
              <>
                <p className="mt-1 text-2xs text-muted/70">{holdings.note}</p>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left text-2xs uppercase text-muted">
                      <th className="py-1.5 pr-2">Token</th>
                      <th className="py-1.5 pr-2 text-right">Balance</th>
                      <th className="py-1.5 pr-2 text-right">Price</th>
                      <th className="py-1.5 pr-2 text-right">Value</th>
                      <th className="py-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.tokens.slice(0, 30).map((t) => (
                      <tr key={t.address} className="border-b border-line/60">
                        <td className="py-1.5 pr-2">
                          <Link href={`/token/${chain}/${t.address}`} className="font-mono text-2xs text-info hover:underline">
                            {t.symbol ?? shortAddr(t.address, 6, 4)}
                          </Link>
                        </td>
                        <td className="tabular py-1.5 pr-2 text-right">
                          {t.decimals !== null ? fmtNum(Number(BigInt(t.balance)) / 10 ** t.decimals, 4) : t.balance}
                        </td>
                        <td className="tabular py-1.5 pr-2 text-right">{fmtUsd(t.priceUsd)}</td>
                        <td className="tabular py-1.5 pr-2 text-right">{fmtUsd(t.valueUsd)}</td>
                        <td className="py-1.5 text-right">
                          <Link href={`/token/${chain}/${t.address}`} className="text-2xs text-info underline hover:no-underline">
                            trade
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {holdings.tokens.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-muted">
                          No token balances found. Native {cfg.nativeToken.symbol} is shown above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="panel p-3">
            <h2 className="text-sm font-semibold text-fg">About P&L here</h2>
            <p className="mt-1 text-xs text-muted">
              Realized and unrealized P&L require a cost basis. The Positions page estimates P&L from trades you executed
              through SIGHT (your local trade ledger) and clearly labels every figure as an estimate — transfers in,
              pre-existing balances, and missing history are not accounted for.
            </p>
            <Link href="/positions" className="btn-ghost focus-ring mt-2 inline-flex h-7 px-3 text-2xs">
              Open Positions
            </Link>
          </div>
        </>
      )}
    </div>
  );
}