"use client";

import { useSettings, useUi, useWatchlists, useAlerts } from "@/lib/store";
import { useTrades } from "@/lib/tradeHistory";
import { CHAINS, TRADABLE_CHAINS, type ChainId } from "@/lib/chains";
import { cn } from "@/lib/format";

/** Settings: trading defaults, network, and local data management. */
export function SettingsView() {
  const settings = useSettings();
  const activeChain = useUi((s) => s.activeChain);
  const setActiveChain = useUi((s) => s.setActiveChain);
  const trades = useTrades();
  const watchlists = useWatchlists();
  const alerts = useAlerts();

  return (
    <div className="mx-auto max-w-[900px] space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-fg">Settings</h1>
        <p className="mt-1 text-xs text-muted">Trading defaults and local data. Everything here is stored in your browser.</p>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Default network</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(CHAINS) as ChainId[]).map((c) => (
            <button
              key={c}
              onClick={() => CHAINS[c].status !== "unconfigured" && setActiveChain(c)}
              disabled={CHAINS[c].status === "unconfigured"}
              className={cn(
                "focus-ring rounded-md border px-3 py-1.5 text-xs transition-colors",
                activeChain === c ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted hover:text-fg",
                CHAINS[c].status === "unconfigured" && "cursor-not-allowed opacity-40",
              )}
              title={CHAINS[c].capabilityNote}
            >
              {CHAINS[c].name}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-2xs text-muted/70">{CHAINS[activeChain].capabilityNote}</p>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Trading defaults (Solana swaps)</h2>
        <div className="mt-2 space-y-3 text-xs">
          <div>
            <label className="block text-muted" htmlFor="slippage">
              Slippage tolerance: <span className="tabular text-fg">{(settings.slippageBps / 100).toFixed(2)}%</span>
            </label>
            <input
              id="slippage"
              type="range"
              min={10}
              max={1000}
              step={10}
              value={settings.slippageBps}
              onChange={(e) => settings.setSlippageBps(Number(e.target.value))}
              className="mt-1 w-full accent-[#7857FF]"
            />
            <p className="mt-0.5 text-2xs text-muted/70">
              Applied to every quote as your tolerance — never silently increased by SIGHT. Above 3% you are exposed to sandwich attacks.
            </p>
          </div>
          <div>
            <p className="text-muted">Priority fee level</p>
            <div className="mt-1 flex gap-1.5">
              {(["low", "medium", "high", "veryHigh"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => settings.setPriorityLevel(p)}
                  className={cn(
                    "focus-ring rounded-md border px-2.5 py-1 text-2xs",
                    settings.priorityLevel === p ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted hover:text-fg",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="mt-0.5 text-2xs text-muted/70">Higher priority fees land transactions faster during congestion, at higher cost.</p>
          </div>
          <div>
            <label className="block text-muted" htmlFor="maxfee">
              Max priority fee cap: <span className="tabular text-fg">{settings.maxPriorityLamports.toLocaleString()} lamports</span>
            </label>
            <input
              id="maxfee"
              type="range"
              min={0}
              max={10_000_000}
              step={100_000}
              value={settings.maxPriorityLamports}
              onChange={(e) => settings.setMaxPriorityLamports(Number(e.target.value))}
              className="mt-1 w-full accent-[#7857FF]"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-muted" htmlFor="buypresets">Buy presets (native units, comma-separated)</label>
              <input
                id="buypresets"
                value={settings.buyPresets.join(", ")}
                onChange={(e) => settings.setBuyPresets(e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)))}
                className="input mt-1 font-mono text-xs"
                aria-label="Buy presets"
              />
              <p className="mt-0.5 text-2xs text-muted/70">Quick-amount buttons in the trade panel.</p>
            </div>
            <div>
              <label className="block text-muted" htmlFor="sellpresets">Sell presets (percent, comma-separated)</label>
              <input
                id="sellpresets"
                value={settings.sellPresets.join(", ")}
                onChange={(e) => settings.setSellPresets(e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)))}
                className="input mt-1 font-mono text-xs"
                aria-label="Sell presets"
              />
              <p className="mt-0.5 text-2xs text-muted/70">Percent-of-position buttons; capped at 100%.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Local data</h2>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          <li>• {watchlists.tokens.length} watchlisted tokens, {watchlists.wallets.length} tracked wallets</li>
          <li>• {alerts.alerts.length} alerts ({alerts.alerts.filter((a) => a.active).length} active)</li>
          <li>• {trades.trades.length} recorded trades</li>
        </ul>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              if (confirm("Clear your local trade history? Watchlists and alerts are kept.")) trades.clear();
            }}
            className="btn-ghost focus-ring h-8 px-3 text-2xs"
          >
            Clear trade history
          </button>
        </div>
        <p className="mt-2 text-2xs text-muted/70">
          SIGHT never stores keys or seed phrases — wallets sign in their own apps. Watchlists/alerts/trades live in
          browser storage only; a server-side account sync is future work.
        </p>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Data sources</h2>
        <p className="mt-1.5 text-xs text-muted">
          Market data: GeckoTerminal (pool discovery, OHLCV) and DexScreener (pairs, prices, liquidity). Solana prices
          and swaps: Jupiter. Risk checks: direct Solana RPC reads. Wallet connections run entirely in your browser
          (injected providers). Provider API keys, when configured, stay server-side and are never exposed to the client.
        </p>
      </div>
    </div>
  );
}