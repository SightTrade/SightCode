# SIGHT — See the Signal.

A multi-chain cryptocurrency trading terminal for crypto-native users, meme-coin traders, and on-chain analysts. Built with Next.js (App Router), TypeScript, Tailwind CSS, and a provider-abstracted data layer.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional configuration: copy `.env.example` to `.env.local` and add keys (all optional — the app runs with public endpoints and free provider tiers):

- `SOLANA_RPC_URL` — Solana RPC. The public endpoint is rate-limited; a Helius key makes risk checks and tx tracking reliable.
- `HELIUS_API_KEY` — enables decoded Solana wallet activity (Smart Money pages).
- `JUPITER_API_KEY` — raises Jupiter rate limits (keyless access works at 0.5 RPS).
- `ETHERSCAN_API_KEY` / `BSCSCAN_API_KEY` / `BASESCAN_API_KEY` — enables EVM contract verification checks.

## Verification

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest unit tests
npm run lint        # eslint (next/core-web-vitals)
npm run build       # production build
```

## Architecture

### Chain abstraction
- `src/lib/chains.ts` — explicit chain registry (network config, explorers, provider ids, operational status). Robinhood Chain is registered as `unconfigured` until its chain ID / RPC / data source are verified.
- Provider adapters in `src/lib/providers/`:
  - `dexscreener.ts` — pairs, prices, liquidity, volume (free API)
  - `geckoterminal.ts` — pool discovery (new/trending), OHLCV candles, token info (free API)
  - `jupiter.ts` — Solana swap quotes/execution, prices, token search (keyless tier; key optional)
  - `solanaRpc.ts` — direct on-chain risk reads: mint/freeze authority, holder concentration, tx status
- All requests: hard timeouts, bounded retries with backoff, TTL caching. Server routes never expose keys.

### Pages
`/terminal` (main workspace), `/discover`, `/trending`, `/new-pairs`, `/launch-radar`, `/token/[chain]/[address]`, `/smart-money`, `/wallet/[chain]/[address]`, `/watchlists`, `/portfolio`, `/positions`, `/history`, `/analytics`, `/alerts`, `/settings`.

### Data honesty rules
- Every metric that a provider doesn't supply renders as "unavailable" — never fabricated.
- Risk findings always cite their data source; no composite "safety score" is issued.
- Trade execution only exists where verified (Solana via Jupiter). Other chains show a clear "not enabled" state.
- Alerts evaluate while the app is open; there is no background worker, and the UI says so.

### Data storage
Watchlists, alerts, settings, and the trade ledger persist in browser storage (zustand + localStorage). No user accounts; no keys or seed phrases ever touch the app. A Postgres schema (Prisma) is a future extension point for server-side sync.

## Known limitations

- EVM swap execution is not enabled (needs a verified aggregator integration per chain).
- Full EVM portfolio scanning and wallet transaction history need an indexer (e.g. Alchemy/Helius).
- Launchpad identity (Pump.fun / Raydium LaunchLab / Four.meme) is shown only when the data provider reports it.
- Alerts are in-app only while a tab is open.
