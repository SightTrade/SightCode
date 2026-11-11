import Image from "next/image";
import Link from "next/link";

/**
 * Landing page. Positions the product and routes into the terminal.
 * No market data is rendered here — data-driven views live in the app routes.
 */
const FEATURES = [
  {
    title: "Discover early",
    body: "New pairs and launches across Solana, BNB Chain, Ethereum and Base — with pool age, liquidity and trading activity from live on-chain data.",
  },
  {
    title: "Read the market",
    body: "Liquidity depth, holder concentration, mint and freeze authorities, and venue exposure — every risk finding traced to its data source.",
  },
  {
    title: "Trade with clarity",
    body: "Jupiter-routed swaps on Solana with explicit quotes, price impact, minimum received, and real on-chain confirmation tracking.",
  },
  {
    title: "Follow the flow",
    body: "Track wallets, watchlist tokens, and set alerts. Your watchlists stay local to your browser — nothing to sign up for.",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center text-center">
        <Image
          src="/logos/sight_logo_trans.png"
          alt="SIGHT — See the Signal"
          width={200}
          height={Math.round((200 * 240) / 335)}
          priority
        />
        <p className="mt-4 max-w-xl text-sm text-muted">
          Discover early. Read the market. Trade with clarity.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/terminal" className="btn-primary focus-ring">
            Open the Terminal
          </Link>
          <Link href="/discover" className="btn-ghost focus-ring">
            Explore markets
          </Link>
        </div>
      </div>

      <div className="mt-12 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="panel p-4">
            <h2 className="text-sm font-semibold text-accent">{f.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-8 p-4">
        <h2 className="text-sm font-semibold text-fg">Supported networks</h2>
        <ul className="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-2">
          <li>
            <span className="font-medium text-fg">Solana</span> — live market data, search, charts, risk checks, wallet connect, and swaps via Jupiter.
          </li>
          <li>
            <span className="font-medium text-fg">BNB Chain · Ethereum · Base</span> — live market data, search, charts, and wallet connect. Swap execution not enabled yet.
          </li>
          <li>
            <span className="font-medium text-fg">Robinhood Chain</span> — awaiting verified network configuration; no features enabled.
          </li>
        </ul>
        <p className="mt-3 text-2xs text-muted/70">
          SIGHT shows only data it can verify. Missing metrics render as unavailable — never fabricated.
        </p>
      </div>
    </div>
  );
}