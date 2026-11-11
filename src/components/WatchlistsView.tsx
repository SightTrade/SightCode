"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHAINS, isEvmAddress, isSolanaAddress, type ChainId } from "@/lib/chains";
import { useWatchlists } from "@/lib/store";
import { shortAddr } from "@/lib/format";

/** Watchlists: locally stored token + wallet watchlists. */
export function WatchlistsView() {
  const { tokens, wallets, removeToken, removeWallet, addToken } = useWatchlists();
  const [chain, setChain] = useState<ChainId>("solana");
  const [addr, setAddr] = useState("");
  const router = useRouter();

  const add = () => {
    const a = addr.trim();
    if (!a) return;
    const cfg = CHAINS[chain];
    const valid = cfg.kind === "solana" ? isSolanaAddress(a) : isEvmAddress(a);
    if (!valid) {
      alert(`That doesn't look like a ${cfg.name} address.`);
      return;
    }
    addToken({ chain, address: a });
    setAddr("");
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-fg">Watchlists</h1>
        <p className="mt-1 text-xs text-muted">
          Saved tokens and wallets, stored locally in your browser. Add any token by address.
        </p>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Tokens ({tokens.length})</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={chain} onChange={(e) => setChain(e.target.value as ChainId)} className="input h-9 w-auto py-0 text-xs" aria-label="Token network">
            {Object.values(CHAINS)
              .filter((c) => c.status !== "unconfigured")
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Token mint / contract address"
            className="input h-9 flex-1 font-mono text-xs"
            aria-label="Token address"
          />
          <button onClick={add} className="btn-primary focus-ring h-9 px-4 text-xs">
            Add token
          </button>
        </div>
        {tokens.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            Nothing watchlisted yet. Star tokens from any discovery table, or add one by address above.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {tokens.map((t) => (
              <li key={`${t.chain}:${t.address}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5 text-sm">
                <button onClick={() => router.push(`/token/${t.chain}/${t.address}`)} className="min-w-0 flex-1 text-left">
                  <span className="font-medium text-fg hover:text-accent">{t.symbol ?? shortAddr(t.address, 6, 4)}</span>
                  <span className="chip ml-2">{CHAINS[t.chain].shortName}</span>
                  <span className="ml-2 font-mono text-2xs text-muted">{shortAddr(t.address, 8, 6)}</span>
                </button>
                <button onClick={() => removeToken(t.chain, t.address)} className="btn-ghost h-7 px-2 text-2xs text-neg" aria-label="Remove from watchlist">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Wallets ({wallets.length})</h2>
        {wallets.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">No tracked wallets. Add them on the Smart Money page.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {wallets.map((w) => (
              <li key={`${w.chain}:${w.address}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5 text-sm">
                <button onClick={() => router.push(`/wallet/${w.chain}/${w.address}`)} className="min-w-0 flex-1 text-left">
                  <span className="font-medium text-fg hover:text-accent">{w.label ?? shortAddr(w.address)}</span>
                  <span className="chip ml-2">{CHAINS[w.chain].shortName}</span>
                  <span className="ml-2 font-mono text-2xs text-muted">{shortAddr(w.address, 8, 6)}</span>
                </button>
                <button onClick={() => removeWallet(w.chain, w.address)} className="btn-ghost h-7 px-2 text-2xs text-neg" aria-label="Remove tracked wallet">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}