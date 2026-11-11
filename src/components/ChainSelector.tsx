"use client";

import { useEffect, useRef, useState } from "react";
import { CHAINS, TRADABLE_CHAINS, type ChainId } from "@/lib/chains";
import { ChainLogo } from "./ChainLogo";
import { useUi } from "@/lib/store";
import { cn } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  live: "bg-pos",
  limited: "bg-warn",
  unconfigured: "bg-muted/50",
};
const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  limited: "Limited",
  unconfigured: "Awaiting config",
};

export function ChainSelector() {
  const active = useUi((s) => s.activeChain);
  const setActive = useUi((s) => s.setActiveChain);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const chain = CHAINS[active];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost focus-ring h-9 gap-2 px-2.5 text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Network: ${chain.name}`}
      >
        <ChainLogo id={active} className="h-5 w-5 shrink-0" />
        <span className="hidden sm:inline">{chain.name}</span>
        <span className="sm:hidden">{chain.shortName}</span>
        <svg viewBox="0 0 20 20" fill="none" className={cn("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")}>
          <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select network"
          className="animate-fade-in absolute left-0 top-11 z-50 w-80 rounded-lg border border-line bg-panel p-1.5 shadow-xl shadow-black/40"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-2xs uppercase tracking-wider text-muted">Networks</p>
          {(Object.keys(CHAINS) as ChainId[]).map((id) => {
            const c = CHAINS[id];
            const disabled = c.status === "unconfigured";
            const selected = id === active;
            return (
              <button
                key={id}
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => {
                  setActive(id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                  disabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface",
                  selected && "bg-surface",
                )}
                title={disabled ? c.capabilityNote : undefined}
              >
                <ChainLogo id={id} className="mt-0.5 h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-fg">{c.name}</span>
                    <span className="chip">
                      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLE[c.status])} />
                      {STATUS_LABEL[c.status]}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{c.capabilityNote}</span>
                </span>
                {selected && <span className="mt-1 text-accent">✓</span>}
              </button>
            );
          })}
          <p className="px-2.5 py-1.5 text-2xs text-muted">
            {TRADABLE_CHAINS.length} networks with live market data. Robinhood Chain appears once its network configuration is verified.
          </p>
        </div>
      )}
    </div>
  );
}