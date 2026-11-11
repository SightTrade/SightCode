import { DiscoveryView } from "@/components/DiscoveryView";

export const metadata = { title: "Launch Radar" };

/**
 * Launch Radar — live new-token launches (PumpPortal) plus newest pools from
 * market-data providers. Launchpad identity (Pump.fun, Raydium LaunchLab,
 * Four.meme) is only shown when the venue label comes from the data provider;
 * we do not guess it. Bonding-curve tokens appear here before they have a
 * tradable AMM pool — the UI shows "no pool yet" state honestly.
 */
export default function LaunchRadarPage() {
  return (
    <div className="mx-auto max-w-[1400px] p-3 sm:p-4">
      <div className="mb-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs text-info">
        Launch Radar tracks <span className="font-semibold">token-creation events</span> (PumpPortal free feed) and{" "}
        <span className="font-semibold">liquidity-pool creation events</span> from market-data providers. Tokens without a
        tradable pool yet are shown with liquidity &quot;—&quot;; launchpad identity is shown only when the provider
        reports it.
      </div>
      <DiscoveryView
        query="mode=new"
        title="Launch Radar"
        subtitle="Newest token launches and pools across supported networks. Check risk signals before trading anything new."
        defaultSort="createdAt"
        filters={{ maxAgeHours: 72 }}
        live
        liveFeeds="tokens"
      />
    </div>
  );
}