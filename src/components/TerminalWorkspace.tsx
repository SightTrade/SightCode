"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DiscoveryView } from "@/components/DiscoveryView";
import PriceChart from "./PriceChart";
import { TradePanel } from "./TradePanel";
import { TokenInfoTabs } from "./TokenInfoTabs";
import { CHAINS } from "@/lib/chains";
import { fmtPrice, shortAddr } from "@/lib/format";
import type { TokenDetail } from "@/lib/types";

/**
 * Terminal workspace. Market discovery panel + optional selected-token
 * workspace (chart + info + trade panel) driven by ?token=<chain>:<address>.
 */
export function TerminalWorkspace() {
  const params = useSearchParams();
  const tokenParam = params.get("token");
  const [chain, address] = tokenParam ? tokenParam.split(":") : [null, null];

  if (!chain || !address || !CHAINS[chain as keyof typeof CHAINS]) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
          Select a token in the table below to open its chart and trade panel. Use ⌘K to search anything by name,
          ticker, or address.
        </div>
        <div className="min-h-0 flex-1">
          <DiscoveryView
            query="mode=trending"
            title="Market Discovery"
            subtitle="Live pools across supported networks — click a token symbol to open the full workspace."
            defaultSort="volume24hUsd"
          />
        </div>
      </div>
    );
  }
  return <TokenWorkspace chain={chain} address={address} />;
}

function TokenWorkspace({ chain, address }: { chain: string; address: string }) {
  const [detail, setDetail] = useState<TokenDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/token/${chain}/${encodeURIComponent(address)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setDetail(body as TokenDetail);
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
  }, [chain, address]);

  if (loading) {
    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="panel h-[520px] animate-pulse" />
        <div className="panel h-[520px] animate-pulse" />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="panel p-6 text-center">
        <p className="text-sm text-neg">Token data unavailable: {error}</p>
        <p className="mt-2 text-xs text-muted">The token may not be indexed yet, or the address may not exist on this network.</p>
      </div>
    );
  }

  const r = detail.summary;
  const chainCfg = CHAINS[chain as keyof typeof CHAINS];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
          <div>
            <h1 className="text-base font-bold text-fg">
              {r.symbol} <span className="text-sm font-normal text-muted">{chainCfg?.name}</span>
            </h1>
            <p className="font-mono text-2xs text-muted">{shortAddr(r.address, 8, 8)}</p>
          </div>
          <p className="tabular ml-auto text-xl font-bold text-fg">{fmtPrice(r.priceUsd)}</p>
        </div>
        <PriceChart chain={chain} poolAddress={r.poolAddress} tokenAddress={r.address} tokenSymbol={r.symbol} />
        <TokenInfoTabs detail={detail} chain={chain} />
      </div>
      <div className="min-w-0">
        <TradePanel detail={detail} />
      </div>
    </div>
  );
}