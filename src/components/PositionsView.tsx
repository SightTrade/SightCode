"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CHAINS } from "@/lib/chains";
import { useTrades, estimatePositions } from "@/lib/tradeHistory";
import { fmtNum } from "@/lib/format";

/**
 * Positions — estimated open positions derived from the LOCAL trade ledger
 * (trades executed through SIGHT). Every figure is an estimate: the ledger
 * may not contain pre-existing balances or transfers. Solana balances can be
 * cross-checked on the Portfolio page (full on-chain scan).
 */
export function PositionsView() {
  const trades = useTrades((s) => s.trades);
  const positions = useMemo(() => estimatePositions(trades).filter((p) => p.netAmount > 1e-9), [trades]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-fg">Positions</h1>
        <p className="mt-1 text-xs text-muted">
          Estimated open positions from trades executed in SIGHT. This is <span className="text-warn">not</span> a full
          accounting view: tokens acquired outside the app, transfers, and airdrops are not included. Cross-check with
          the Portfolio page for real on-chain balances.
        </p>
      </div>

      {positions.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-fg">No open positions recorded</p>
          <p className="mt-1.5 text-xs text-muted">
            Positions appear here after you execute trades in the terminal. Nothing is recorded from page views or token
            selection — only signed, confirmed transactions.
          </p>
          <Link href="/terminal" className="btn-ghost mt-3 inline-flex">
            Open the Terminal
          </Link>
        </div>
      ) : (
        <div className="panel p-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase text-muted">
                <th className="py-1.5 pr-2">Token</th>
                <th className="py-1.5 pr-2">Chain</th>
                <th className="py-1.5 pr-2 text-right">Est. net amount</th>
                <th className="py-1.5 pr-2 text-right">Avg cost</th>
                <th className="py-1.5 text-right">Trades</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={`${p.chain}:${p.tokenAddress}`} className="border-b border-line/60">
                  <td className="py-1.5 pr-2">
                    <Link href={`/token/${p.chain}/${p.tokenAddress}`} className="text-info hover:underline">
                      {p.tokenSymbol}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="chip">{CHAINS[p.chain].shortName}</span>
                  </td>
                  <td className="tabular py-1.5 pr-2 text-right">{fmtNum(p.netAmount, 6)}</td>
                  <td className="tabular py-1.5 pr-2 text-right">
                    {p.avgCostNative !== null ? `${fmtNum(p.avgCostNative, 4)} ${p.nativeSymbol}` : "—"}
                  </td>
                  <td className="tabular py-1.5 text-right">{p.tradesCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-2xs text-muted/70">
            Avg cost = total {positions[0]?.nativeSymbol ?? "native"} paid ÷ tokens received across your recorded buys.
            Estimates only — see the disclosure above.
          </p>
        </div>
      )}
    </div>
  );
}