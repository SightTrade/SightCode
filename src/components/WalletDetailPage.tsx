"use client";

import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/chains";
import type { ChainId } from "@/lib/chains";
import { fmtUsd, fmtNum, shortAddr, timeAgo } from "@/lib/format";
import type { WalletHoldings } from "@/lib/types";
import { useWatchlists } from "@/lib/store";

interface Activity {
  transactions: {
    signature: string;
    timestamp: number | null;
    status: string;
    description: string | null;
    explorerUrl: string | null;
    classification?: "BUY" | "SELL" | "TRANSFER" | "LIQUIDITY" | "UNKNOWN";
    classificationConfidence?: "high" | "medium" | "low";
    classificationReason?: string;
    tokenIn?: { asset: string; symbol: string | null; amount: number | null } | null;
    tokenOut?: { asset: string; symbol: string | null; amount: number | null } | null;
    quoteValue?: number | null;
    quoteCurrency?: string | null;
  }[];
  coverage: string;
  note: string;
}

const CLASS_BADGE: Record<string, { label: string; className: string }> = {
  BUY: { label: "BUY", className: "text-pos" },
  SELL: { label: "SELL", className: "text-neg" },
  LIQUIDITY: { label: "LIQ", className: "text-info" },
  TRANSFER: { label: "TRANSFER", className: "text-muted" },
  UNKNOWN: { label: "UNKNOWN", className: "text-muted" },
};

/** Compact readable label for a classified asset: "1.5 USDC" / "token 0x1234…". */
function assetLabel(t: { asset: string; symbol: string | null; amount: number | null } | null | undefined): string | null {
  if (!t) return null;
  const sym = t.symbol ?? (t.asset === "native" ? "native" : `${t.asset.slice(0, 6)}…${t.asset.slice(-4)}`);
  return t.amount !== null ? `${t.amount} ${sym}` : sym;
}


/**
 * Wallet detail page. Shows real on-chain holdings and recent activity:
 *  - Solana: full SPL token scan + native SOL (RPC) + signature feed.
 *  - EVM: native balance + explicit token list; tx history requires an
 *    indexer, so the page says so and links to the block explorer.
 */
export function WalletDetailPage({ chain, address }: { chain: string; address: string }) {
  const cfg = CHAINS[chain as keyof typeof CHAINS];
  const [holdings, setHoldings] = useState<WalletHoldings | null>(null);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const { addWallet } = useWatchlists();

  useEffect(() => {
    let cancelled = false;
    setHoldingsError(null);
    setLoadingHoldings(true);
    setLoadingActivity(true);
    fetch(`/api/balances?chain=${chain}&address=${encodeURIComponent(address)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setHoldings(body as WalletHoldings);
      })
      .catch((e) => {
        if (!cancelled) setHoldingsError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingHoldings(false);
      });
    fetch(`/api/wallet/${chain}/${encodeURIComponent(address)}`, { cache: "no-store" })
      .then(async (res) => res.json())
      .then((body) => {
        if (!cancelled) setActivity(body as Activity);
      })
      .catch(() => void 0)
      .finally(() => {
        if (!cancelled) setLoadingActivity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chain, address]);

  if (!cfg) {
    return <div className="p-6 text-center text-sm text-neg">Unknown chain &ldquo;{chain}&rdquo;.</div>;
  }

  const totalValue = holdings?.tokens.reduce((acc, t) => acc + (t.valueUsd ?? 0), 0) ?? null;
  const nativeHuman =
    holdings?.nativeBalance && cfg.nativeToken.decimals
      ? Number(BigInt(holdings.nativeBalance)) / 10 ** cfg.nativeToken.decimals
      : null;

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-fg">
            Wallet <span className="chip">{cfg.shortName}</span>
          </h1>
          <p className="font-mono text-xs text-muted">{shortAddr(address, 12, 10)}</p>
        </div>
        <div className="ml-auto flex gap-2">
          {cfg.explorer && (
            <a className="btn-ghost h-8 px-3 text-2xs" href={cfg.explorer.address(address)} target="_blank" rel="noopener noreferrer">
              {cfg.explorer.name} ↗
            </a>
          )}
          <button onClick={() => addWallet({ chain: chain as ChainId, address })} className="btn-ghost focus-ring h-8 px-3 text-2xs">
            Track wallet
          </button>
        </div>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Holdings</h2>
        {loadingHoldings && <p className="py-4 text-xs text-muted">Scanning on-chain balances…</p>}
        {holdingsError && <p className="py-2 text-xs text-neg">Balance scan failed: {holdingsError}</p>}
        {holdings && (
          <>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span className="text-muted">
                {cfg.nativeToken.symbol}: <span className="tabular text-fg">{nativeHuman !== null ? fmtNum(nativeHuman, 4) : "—"}</span>
              </span>
              <span className="text-muted">
                Priced token value: <span className="tabular text-fg">{fmtUsd(totalValue)}</span>
              </span>
              <span className="chip">{holdings.coverage} coverage</span>
            </div>
            <p className="mt-1 text-2xs text-muted/70">{holdings.note}</p>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase text-muted">
                  <th className="py-1.5 pr-2">Token</th>
                  <th className="py-1.5 pr-2 text-right">Balance</th>
                  <th className="py-1.5 pr-2 text-right">Price</th>
                  <th className="py-1.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {holdings.tokens.slice(0, 20).map((t) => (
                  <tr key={t.address} className="border-b border-line/60">
                    <td className="py-1.5 pr-2 font-mono text-2xs">{shortAddr(t.address, 6, 4)}</td>
                    <td className="tabular py-1.5 pr-2 text-right">{t.decimals !== null ? fmtNum(Number(BigInt(t.balance)) / 10 ** t.decimals, 4) : t.balance}</td>
                    <td className="tabular py-1.5 pr-2 text-right">{fmtUsd(t.priceUsd)}</td>
                    <td className="tabular py-1.5 text-right">{fmtUsd(t.valueUsd)}</td>
                  </tr>
                ))}
                {holdings.tokens.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted">No token balances found on this wallet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Recent activity</h2>
        {loadingActivity && <p className="py-4 text-xs text-muted">Fetching recent transactions…</p>}
        {activity && (
          <>
            <p className="mt-1 text-2xs text-muted">{activity.note}</p>
            <span className="chip mt-2">{activity.coverage} coverage</span>
            {activity.transactions.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">No recent activity found.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {activity.transactions.map((t) => {
                  const badge = t.classification ? CLASS_BADGE[t.classification] : null;
                  const inLabel = assetLabel(t.tokenIn);
                  const outLabel = assetLabel(t.tokenOut);
                  return (
                    <li key={t.signature} className="rounded border border-line/60 bg-surface px-2.5 py-1.5 text-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-muted">{shortAddr(t.signature, 8, 8)}</span>
                        {badge && (
                          <span className={`font-bold tabular ${badge.className}`} title={t.classificationReason ?? undefined}>
                            {badge.label}
                            {t.classificationConfidence && t.classificationConfidence !== "high" ? `\u00b7${t.classificationConfidence}` : ""}
                          </span>
                        )}
                        <span className="text-muted">{t.timestamp ? timeAgo(t.timestamp) : ""}</span>
                        <span className={t.status === "confirmed" ? "text-pos" : t.status === "failed" ? "text-neg" : "text-muted"}>{t.status}</span>
                        {t.explorerUrl && (
                          <a href={t.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-info underline hover:no-underline">
                            ↗
                          </a>
                        )}
                      </div>
                      {badge && (inLabel || outLabel) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {outLabel && <span className="tabular text-neg">− {outLabel}</span>}
                          {outLabel && inLabel && <span className="text-muted">→</span>}
                          {inLabel && <span className="tabular text-pos">+ {inLabel}</span>}
                          {t.quoteValue != null && t.quoteCurrency && (
                            <span className="chip text-2xs">
                              {t.quoteValue} {t.quoteCurrency}
                            </span>
                          )}
                        </div>
                      )}
                      {t.classification === "UNKNOWN" && t.classificationReason && (
                        <div className="mt-1 text-muted">{t.classificationReason}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
        <p className="mt-2 text-2xs text-muted/70">
          P&L and performance estimates are intentionally not shown here: without classified, complete trade history any
          number would be an estimate built on missing data.
        </p>
      </div>
    </div>
  );
}