import { DiscoveryView } from "@/components/DiscoveryView";

export const metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <div className="mx-auto max-w-[1400px] p-3 sm:p-4">
      <DiscoveryView
        query="mode=trending"
        title="Discover"
        subtitle="The most active tokens across every supported network, ranked by 24h volume. Data from GeckoTerminal pool discovery."
        defaultSort="volume24hUsd"
      />
    </div>
  );
}