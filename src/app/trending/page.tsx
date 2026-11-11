import { DiscoveryView } from "@/components/DiscoveryView";

export const metadata = { title: "Trending" };

export default function TrendingPage() {
  return (
    <div className="mx-auto max-w-[1400px] p-3 sm:p-4">
      <DiscoveryView
        query="mode=trending"
        title="Trending"
        subtitle="Trending pools as ranked by GeckoTerminal across supported networks."
        defaultSort="volume24hUsd"
      />
    </div>
  );
}