"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHAINS, TRADABLE_CHAINS, isSolanaAddress, isEvmAddress, type ChainId } from "@/lib/chains";
import { useWatchlists } from "@/lib/store";
import { cn, shortAddr } from "@/lib/format";
import { useToast } from "./Toast";

/**
 * Smart Money / Wallet Tracker.
 *
 * HONESTY NOTE (surfaced in the UI): a wallet leaderboard with realized /
 * unrealized P&L requires indexed transaction history to classify buys/sells
 * and compute cost basis. Without an indexer (Helius etc.), ranking wallets
 * by "profitability" would be fabrication — so this page is a wallet tracker:
 * you add wallets, SIGHT shows real on-chain activity it can verify, and
 * clearly states what P&L estimation would need.
 */
export function SmartMoneyView() {
  const { wallets, addWallet, removeWallet } = useWatchlists();
  const [chain, setChain] = useState<ChainId>("solana");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const { toast } = useToast();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = address.trim();
    if (!a) return;
    const cfg = CHAINS[chain];
    const valid = cfg.kind === "solana" ? isSolanaAddress(a) : isEvmAddress(a);
    if (!valid) {
      toast("error", "Invalid address", `That doesn't look like a ${cfg.name} address.`);
      return;
    }
    addWallet({ chain, address: a, label: label.trim() || undefined });
    setAddress("");
    setLabel("");
    toast("success", "Wallet tracked", `${shortAddr(a)} added to your tracker.`);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-fg">Smart Money</h1>
        <p className="mt-1 text-xs text-muted">
          Track wallets and inspect their on-chain activity with evidence. SIGHT does not publish a wallet
          &ldquo;leaderboard&rdquo;: reliable P&L ranking requires indexed, classified trade history (an indexer such as
          Helius), and presenting an incomplete history as performance would be misleading.
        </p>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Track a wallet</h2>
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
          <select value={chain} onChange={(e) => setChain(e.target.value as ChainId)} className="input h-9 w-auto py-0 text-xs" aria-label="Wallet network">
            {TRADABLE_CHAINS.map((c) => (
              <option key={c} value={c}>{CHAINS[c].name}</option>
            ))}
          </select>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Wallet address"
            className="input h-9 w-72 flex-1 font-mono text-xs"
            aria-label="Wallet address"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="input h-9 w-40 text-xs"
            aria-label="Wallet label"
          />
          <button type="submit" className="btn-primary focus-ring h-9 px-4 text-xs">
            Track wallet
          </button>
        </form>
        <p className="mt-1.5 text-2xs text-muted/70">
          Watched wallets are stored locally in your browser. Activity feeds use live RPC data; decoded buy/sell
          classification requires configuring an indexer API key.
        </p>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Tracked wallets ({wallets.length})</h2>
        {wallets.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            No wallets tracked yet. Add a wallet above to follow its on-chain activity.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {wallets.map((w) => (
              <li key={`${w.chain}:${w.address}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {w.label ?? shortAddr(w.address)} <span className="chip">{CHAINS[w.chain].shortName}</span>
                  </p>
                  <p className="font-mono text-2xs text-muted">{shortAddr(w.address, 10, 8)}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => router.push(`/wallet/${w.chain}/${w.address}`)} className="btn-ghost focus-ring h-7 px-2.5 text-2xs">
                    Open
                  </button>
                  <button
                    onClick={() => removeWallet(w.chain, w.address)}
                    className="btn-ghost focus-ring h-7 px-2.5 text-2xs text-neg"
                    aria-label={`Stop tracking ${w.label ?? shortAddr(w.address)}`}
                  >
                    Untrack
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">What real wallet intelligence requires</h2>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          <li>• <span className="text-fg">Transaction classification</span> — transfers are not trades; buys/sells must be decoded from program logs.</li>
          <li>• <span className="text-fg">Cost basis accounting</span> — full history, partial fills, and fees are needed before realized P&L means anything.</li>
          <li>• <span className="text-fg">Unrealized P&L</span> — needs reliable mark prices for held tokens.</li>
          <li>• Configure <code className="font-mono">HELIUS_API_KEY</code> in the server environment to enable decoded wallet activity on Solana where supported.</li>
        </ul>
      </div>
    </div>
  );
}