import Link from "next/link";

export const metadata = { title: "Terms, Privacy & Risk Disclosure" };

/**
 * DRAFT legal/disclosure copy for beta distribution. Plain language, honest
 * about what SIGHT does and does not do. THIS PAGE IS NOT LEGAL ADVICE and the
 * final wording MUST be reviewed by a qualified professional before wider
 * release (see audit report P1 item on compliance review).
 */
export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 text-sm leading-relaxed text-muted">
      <h1 className="text-xl font-bold text-fg">Terms of Use · Privacy · Risk Disclosure</h1>
      <p className="rounded-md border border-warn/40 bg-warn/5 p-3 text-xs text-warn">
        DRAFT — prepared for limited beta distribution. This copy has not been reviewed by legal counsel.
        Before wider release, a qualified professional must review jurisdiction-specific requirements
        (securities, money-transmission, marketing/financial-promotion rules, consumer protection).
      </p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-fg">1. The service</h2>
        <p>
          SIGHT is a self-custody market-information and trading interface. It aggregates public
          third-party market data (DexScreener, GeckoTerminal, Jupiter) and lets you interact with
          your own wallets. SIGHT is not an exchange, broker, custodian, or financial adviser, and
          no part of the service is investment advice. Nothing here is an offer or solicitation to
          buy or sell any asset.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-fg">2. Self-custody and key handling</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Embedded wallets are generated in your browser. Private keys are encrypted with your password (PBKDF2-SHA256 → AES-GCM-256) and stored only on this device.</li>
          <li>SIGHT servers never receive, transmit, or log your keys or recovery material.</li>
          <li>Recovery material is shown exactly once at creation. If you lose it and your browser storage, SIGHT cannot recover your wallet or funds.</li>
          <li>External wallet connections only ever share a public address; SIGHT never asks for seed phrases.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-fg">3. Risk disclosure</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Cryptocurrency assets are volatile and can lose all value. Token launches on bonding curves and new AMM pools carry extreme risk, including rug pulls, failed migrations, and zero liquidity.</li>
          <li>Market data shown (prices, liquidity, volume, candles) comes from third-party aggregators, may be delayed, incomplete, or wrong, and must not be relied on as authoritative.</li>
          <li>Transactions broadcast from SIGHT are irreversible. Always verify chain, token address, venue, amounts, slippage, and fees in the confirmation dialog before approving in your wallet.</li>
          <li>Smart-money and risk signals are heuristics computed from public data; they are indicators, not guarantees.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-fg">4. Privacy</h2>
        <p>
          SIGHT stores your watchlists, settings, and wallet metadata locally in your browser
          (localStorage). No account is required; we do not maintain a server-side user database.
          Server logs may record standard request metadata for rate limiting and abuse prevention.
          Embedded-wallet secret material is encrypted client-side and never reaches our servers.
          Third-party providers (DexScreener, GeckoTerminal, Jupiter, public RPCs) receive requests
          for public blockchain data when you use the terminal; their own privacy policies apply to
          what they collect.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-fg">5. Acceptable use</h2>
        <p>
          Do not abuse the public data APIs behind SIGHT (rate limits are enforced), do not attempt
          to access other users&apos; browser-stored data, and do not use SIGHT where its use is
          prohibited by your local law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-fg">6. No warranty</h2>
        <p>
          The service is provided &quot;as is&quot; without warranties of any kind. To the maximum
          extent permitted by law, the operators are not liable for losses arising from use of the
          service, including trading losses, data errors, or wallet loss.
        </p>
      </section>

      <p className="text-xs">
        <Link href="/" className="underline hover:no-underline">← Back to terminal</Link>
      </p>
    </div>
  );
}