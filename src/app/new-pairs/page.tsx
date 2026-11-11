import { DiscoveryView } from "@/components/DiscoveryView";

export const metadata = { title: "New Pairs" };

export default function NewPairsPage() {
  return (
    <div className="mx-auto max-w-[1400px] p-3 sm:p-4">
      <DiscoveryView
        query="mode=new"
        title="New Pairs"
        subtitle="Live: new liquidity pools (GeckoTerminal + PumpPortal migrations) and new token launches, merged with the polled snapshot. Age shown is pool/token creation time from the source."
        defaultSort="createdAt"
        live
        liveFeeds="both"
      />
    </div>
  );
}