"use client";

import Link from "next/link";
import { CHAINS } from "@/lib/chains";
import { useTrades } from "@/lib/tradeHistory";
import { fmtNum, fmtTime, shortAddr } from "@/lib/format";

/**
 * Trade history — the local ledger of trades executed through SIGHT.
 * Only real, signed transactions appear here. Failed transactions are kept
 * and marked so the ledger never pretends a failed trade happened.
 */
export function HistoryView() {
  const trades = useTrades((s) => s.trades);

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-fg">Trade History</h1>
        <p className="mt-1 text-xs text-muted">
          Trades you executed through SIGHT, stored locally in your browser. Failed transactions are included and marked
          — no balance changes resulted from them.
        </p>
      </div>

      {trades.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-fg">No trades yet</p>
          <p className="mt-1.5 text-xs text-muted">
            Execute a swap in the terminal and confirmed transactions will appear here with explorer links.
          </p>
          <Link href="/terminal" className="btn-ghost mt-3 inline-flex">
            Open the Terminal
          </Link>
        </div>
      ) : (
        <div className="panel p-3">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase text-muted">
                <th className="py-1.5 pr-2">Time</th>
                <th className="py-1.5 pr-2">Side</th>
                <th className="py-1.5 pr-2">Token</th>
                <th className="py-1.5 pr-2 text-right">Tokens</th>
                <th className="py-1.5 pr-2 text-right">Native</th>
                <th className="py-1.5 pr-2">Status</th>
                <th className="py-1.5">Tx</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-line/60">
                  <td className="py-1.5 pr-2 text-muted">{fmtTime(t.timestamp)}</td>
                  <td className="py-1.5 pr-2">
                    <span className={t.kind === "buy" ? "text-pos" : "text-neg"}>{t.kind.toUpperCase()}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Link href={`/token/${t.chain}/${t.tokenAddress}`} className="text-info hover:underline">
                      {t.tokenSymbol}
                    </Link>
                    <span className="chip ml-1.5">{CHAINS[t.chain].shortName}</span>
                  </td>
                  <td className="tabular py-1.5 pr-2 text-right">{t.amountToken !== null ? fmtNum(t.amountToken, 6) : "—"}</td>
                  <td className="tabular py-1.5 pr-2 text-right">{t.amountNative !== null ? `${fmtNum(t.amountNative, 4)} ${t.nativeSymbol}` : "—"}</td>
                  <td className="py-1.5 pr-2">
                    <span className={t.status === "confirmed" ? "text-pos" : t.status === "failed" ? "text-neg" : "text-warn"}>{t.status}</span>
                  </td>
                  <td className="py-1.5">
                    {t.explorerUrl ? (
                      <a href={t.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-2xs text-info underline hover:no-underline">
                        {shortAddr(t.signature, 6, 4)} ↗
                      </a>
                    ) : (
                      <span className="font-mono text-2xs text-muted">{shortAddr(t.signature, 6, 4)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}