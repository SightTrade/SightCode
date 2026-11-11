# SIGHT — X (TWITTER) LAUNCH CAMPAIGN
## REAL PRODUCT. REAL SIGNAL. NO NOISE.
### 15 tweets · 15 individually designed banners · one identity

**Campaign directory:** `sight/marketing/sight-x-campaign/`
**Status:** Publication-ready (copy final; see "Before you post" checklist)
**Prepared:** 2026-10-28

---

## 1. What SIGHT is (verified from the product)

SIGHT is a multi-chain crypto trading terminal for crypto-native traders and
on-chain analysts. Built with Next.js, TypeScript and Tailwind. One workspace
that brings discovery, market data, risk, wallets and execution together.

**Official tagline:** SEE THE SIGNAL.

## 2. Internal inventory — verified facts used in this campaign

Everything the campaign claims maps to something that exists in the product
today. Sources: codebase inspection + live probes against the running app.

### Verified working features (live-verified 2026-10-28)

| Area | What works (verified) | Where it appears |
|---|---|---|
| Discovery | Live new-token + new-pool feed across supported chains; server-side SSE stream; per-provider health strip; deduplication; polled snapshot merge | /new-pairs, /launch-radar, /discover, /terminal |
| Launchpad visibility | Pump.fun token-creation events (PumpPortal free feed, real-time), Pump.fun→PumpSwap migration events; pool-creation events for Raydium/Orca/Meteora + Uniswap/PancakeSwap/Base via GeckoTerminal pollers | /launch-radar |
| Market data | Live prices, liquidity, volume, 24h change, MC/FDV, pool age, buys/sells counts — DexScreener + GeckoTerminal | /terminal, /token/*, /discover |
| Charts | Candlestick + volume (lightweight-charts), 1m→1D timeframes, OHLCV history from GeckoTerminal, live price extension of the current candle from snapshots, line/candle + volume toggles | /terminal?token=…, /token/* |
| Token intelligence | Venue list, pool addresses, risk report: mint/freeze authority, holder concentration, venue exposure — every finding cites its data source | /token/* Security tab |
| Trading — Solana | Real swaps via Jupiter with quote → explicit confirmation dialog (slippage, price impact, min received, route) → wallet signature → on-chain status tracking | /terminal TradePanel |
| Trading — EVM | Real quotes via established V2 routers (router verified on-chain before quoting) on Ethereum, Base, BNB Chain; explicit approve step for sells; per-chain wallet selection | /terminal EvmTradePanel |
| Wallets | Wallet connect + SIGHT-created embedded vault wallets (AES-GCM encrypted locally, auto-lock after 15 min idle); balances read directly from RPC (full SPL scan on Solana; native + listed tokens on EVM) | /wallets, /portfolio, /wallet/* |
| Watchlists & alerts | Local-first watchlists (browser storage, no sign-up); alerts for price above/below, 24h change ±, volume spike, liquidity drop — evaluated while the app is open | /watchlists, /alerts |
| Search | Global ⌘K search by token name, ticker or address across chains | TopBar |
| Health | Live provider health with real probe requests + EVM chain-ID verification (a misconfigured endpoint is reported, never trusted) | /api/health, NetworkStatus |

### Provider architecture (verified)

- **DexScreener** — pairs, prices, liquidity, volume (keyless)
- **GeckoTerminal** — pool discovery (new/trending), OHLCV candles (keyless)
- **PumpPortal** — real-time Pump.fun token-creation + migration streams (free WS)
- **Jupiter** — Solana swap quotes/execution + prices
- **Solana RPC (Helius)** — risk checks, balances, tx status
- **Alchemy EVM RPCs** — Ethereum, BNB Chain, Base (chain-ID verified)
- Server-side: hard timeouts, bounded retries with backoff, TTL caching, dedup,
  bounded LRU stores, one upstream connection per provider shared by all
  visitors, per-adapter health surfaced in the UI.

### Chain status (as shipped — must be stated exactly)

| Chain | Status |
|---|---|
| Solana | **Live**: market data, search, charts, risk checks, wallet connect, swaps via Jupiter |
| BNB Chain / Ethereum / Base | **Live market data, search, charts, wallet connect; swap execution enabled via verified V2 routers** |
| Robinhood Chain | **Registered, unconfigured** — awaiting verified network config; no features enabled. UI states this honestly. |

### Honest limits (campaign never hides these)

- Decoded wallet transaction history / full P&L leaderboards **require an
  indexer** (e.g. Helius Enhanced Transactions). Not implemented yet → Smart
  Money is a **wallet tracker** with verified activity, and the UI says exactly
  what P&L ranking would need.
- Alerts fire **while the app is open** — no background worker / push delivery yet.
- Metrics a provider doesn't supply render as **"unavailable" — never fabricated.**
- No composite "safety score" — risk findings cite their data source.
- Full EVM portfolio scanning needs an indexer; Solana gets a full SPL scan.
- Robinhood Chain features are disabled until a verified RPC/chain-ID exists.

### Things deliberately NOT claimed in this campaign

- No token, no ticker, no airdrop, no points system, no snapshot dates, no
  reward multipliers — **no rewards program exists or is announced anywhere in
  the product or docs.** Tweet 13 therefore frames rewards strictly as an
  *exploratory community initiative* with zero promises.
- No invented uptime, latency, TVL or user numbers.
- No competitor bashing; Tweet 10 differentiates SIGHT on its own principles.
- No fabricated links: **no official website or social handles exist in the
  codebase**, so tweets 14–15 use "link in bio" wording and the team should
  insert real handles before posting (slots marked `⟨add official handle⟩`).

### Brand assets used (official, not redesigned)

- `public/logos/sight_mark.png` — the S mark, used on every banner
- `public/logos/sight_logo_trans.png` — full lockup with tagline (hero + posters)
- `public/Sight Logo/sight_logo_only.png` — original square lockup
- `public/Sight Banner/SIGHT_ See the Signal.png` — original banner reference
- Chain marks: `solana.svg`, `bnb-chain.svg`, `ethereum.svg`, `base.svg`,
  `robinhood-chain.svg` (multi-chain banner only, drawn as neutral pills)

### Typography & palette (from the product's design tokens)

- **Geist Sans** headlines/labels, **Geist Mono** for data — exactly what the
  terminal uses.
- bg `#050711` · surface `#090D1B` · panel `#0C1224` · line `#202844`
- accent violet `#7857FF` · bright purple `#9747FF` · electric blue `#35BFFF`
  · magenta `#D34DFF` (campaign accent) · white `#F4F6FF` · muted `#929BB8`
- pos `#42D392` / neg `#FF647C` used sparingly, as in the product.

---

## 3. Campaign narrative arc

Tweets 1–2 establish the problem and identity. 3–7 prove the product (terminal,
discovery, charts, activity, wallets). 8–10 position SIGHT (multi-chain, why,
differentiation). 11–12 show the engineering and the roadmap. 13–15 close on
community, invitation and the brand statement. Each tweet stands alone; the
sequence reads as a launch.

## 4. Deliverables in this folder

- `tweets.md` — all 15 final tweets + banner headlines + alt text
- `visual-guide.md` — per-banner design notes (system, concept, type, usage)
- `manifest.md` — file map: tweet → banner → assets → status
- `contact-sheet.png` — 5×3 overview of all 15 banners (review artifact)
- `tweet-01/banner.png` … `tweet-15/banner.png` — 15 individual 1600×900 PNGs
- `assets/` — copies of the official logos used by the banners
- `shots/` — genuine product screenshots captured from the running app
- `tools/` — deterministic banner renderer + screenshot capture (not app code)

