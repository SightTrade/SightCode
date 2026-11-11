"use client";

import { useState } from "react";
import Link from "next/link";
import { CHAINS, TRADABLE_CHAINS, isSolanaAddress, isEvmAddress, type ChainId } from "@/lib/chains";
import { useAlerts, type AlertKind } from "@/lib/store";
import { cn, fmtUsd, timeAgo } from "@/lib/format";

const KINDS: { kind: AlertKind; label: string; unit: string; hint: string }[] = [
  { kind: "price-above", label: "Price rises above", unit: "USD", hint: "Fires when price crosses the threshold." },
  { kind: "price-below", label: "Price falls below", unit: "USD", hint: "Fires when price drops under the threshold." },
  { kind: "pct-change", label: "24h change exceeds ±", unit: "%", hint: "Fires on absolute 24h change ≥ threshold." },
  { kind: "volume-spike", label: "24h volume exceeds", unit: "USD", hint: "Fires when 24h volume crosses the threshold." },
  { kind: "liquidity-below", label: "Liquidity falls below", unit: "USD", hint: "Warns when pooled liquidity drops under the threshold." },
];

/** Alerts manager. Evaluation engine runs while the app is open (see AlertsEngine). */
export function AlertsView() {
  const { alerts, addAlert, removeAlert, toggleAlert } = useAlerts();
  const [chain, setChain] = useState<ChainId>("solana");
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<AlertKind>("price-above");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const a = address.trim();
    const th = Number(threshold);
    if (!a) return setError("Enter the token address to watch.");
    const cfg = CHAINS[chain];
    if (!(cfg.kind === "solana" ? isSolanaAddress(a) : isEvmAddress(a))) {
      return setError(`That doesn't look like a ${cfg.name} address.`);
    }
    if (!Number.isFinite(th) || th <= 0) return setError("Enter a positive threshold.");
    addAlert({ kind, chain, address: a, threshold: th, active: true });
    setThreshold("");
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-fg">Alerts</h1>
        <p className="mt-1 text-xs text-muted">
          Price, change, volume and liquidity alerts on any token. Delivered as in-app notifications{" "}
          <span className="text-warn">while SIGHT is open</span> — there is no background worker yet, so alerts do not
          fire when the tab is closed. Browser/email/Telegram delivery is future work.
        </p>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">New alert</h2>
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
          <select value={chain} onChange={(e) => setChain(e.target.value as ChainId)} className="input h-9 w-auto py-0 text-xs" aria-label="Network">
            {TRADABLE_CHAINS.map((c) => (
              <option key={c} value={c}>{CHAINS[c].name}</option>
            ))}
          </select>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Token address"
            className="input h-9 w-64 flex-1 font-mono text-xs"
            aria-label="Token address"
          />
          <select value={kind} onChange={(e) => setKind(e.target.value as AlertKind)} className="input h-9 w-auto py-0 text-xs" aria-label="Condition">
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="decimal"
            placeholder={KINDS.find((k) => k.kind === kind)!.unit}
            className="input tabular h-9 w-28 text-xs"
            aria-label="Threshold"
          />
          <button type="submit" className="btn-primary focus-ring h-9 px-4 text-xs">
            Create alert
          </button>
        </form>
        {error && <p className="mt-1.5 text-xs text-neg">{error}</p>}
        <p className="mt-1.5 text-2xs text-muted/70">{KINDS.find((k) => k.kind === kind)!.hint} Re-fires are suppressed for 10 minutes per alert.</p>
      </div>

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Your alerts ({alerts.length})</h2>
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            No alerts yet. Create one above — e.g. get notified when a watched token pumps more than 50% in 24h.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-fg">
                    <span className="chip mr-1.5">{CHAINS[a.chain].shortName}</span>
                    <span className="font-mono">{a.symbol ?? a.address.slice(0, 10) + "…"}</span>
                  </p>
                  <p className="mt-0.5 text-2xs text-muted">
                    {KINDS.find((k) => k.kind === a.kind)?.label} {fmtUsd(a.threshold)}
                    {a.lastFiredAt ? ` · last fired ${timeAgo(a.lastFiredAt)}` : " · never fired"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAlert(a.id)}
                    className={cn("chip cursor-pointer", a.active ? "border-pos/40 text-pos" : "text-muted")}
                    aria-label={a.active ? "Disable alert" : "Enable alert"}
                  >
                    {a.active ? "active" : "paused"}
                  </button>
                  <Link href={`/token/${a.chain}/${a.address}`} className="btn-ghost h-6 px-2 text-2xs">
                    Token
                  </Link>
                  <button onClick={() => removeAlert(a.id)} className="btn-ghost h-6 px-2 text-2xs text-neg" aria-label="Delete alert">
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}