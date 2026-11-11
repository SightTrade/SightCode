# SIGHT — API Keys Setup Guide

Step-by-step provider setup for SIGHT. Every value here goes into `.env.local`
(local dev) or your hosting provider's environment settings (production).
**Never commit `.env.local`.** Values marked 🔒 are secrets; values marked 🌐
are public config (safe in the browser).

The app runs fully keyless — each step below upgrades an already-working
integration to production quality.

---

## 1. Helius (Solana RPC + future Enhanced APIs)

Why: the public Solana RPC (`api.mainnet-beta.solana.com`) rate-limits
aggressively. SIGHT's risk checks, balances, holder analysis, and tx status all
improve with Helius. The free plan ($0) includes 1M credits/month, 10 RPC req/s,
2 req/s on Enhanced/DAS APIs (per Helius docs; re-verify at signup).

1. Create an account at <https://dashboard.helius.dev>.
2. Create an RPC API key and copy it (🔒 secret).
3. Set server-side variables:

```
# 🔒 secret — server-side only (do NOT prefix with NEXT_PUBLIC_)
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

4. If you want the browser (embedded-wallet transfers) on Helius too:

```
# 🌐 public config — intentionally exposed to the browser
NEXT_PUBLIC_SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=YOUR_BROWSER_KEY
```

> Helius keys embedded in `NEXT_PUBLIC_*` are visible to anyone who opens your
> site's JS. Use a separate key for the browser and accept public usage, or
> proxy browser traffic through your own server route.

**Verify (server):** start SIGHT and open `/api/health` — "Solana RPC: ok" with
sub-second latency. Open a Solana token page and confirm the risk section shows
mint-authority and holder data.

**Future:** `HELIUS_API_KEY` (plain key, server-side) is reserved for the
planned Smart-Money decoded wallet activity. It is **not read by the current
code** — setting it today does nothing.

---

## 2. Jupiter (Solana swaps)

Why: all Solana swap quotes/builds go through Jupiter. Keyless access works at
0.5 requests/second; a free key raises limits.

1. Create an account at <https://developers.jup.ag/portal>.
2. Create an API key (🔒 secret).
3. Set:

```
JUPITER_API_KEY=your_jupiter_key
```

**Verify:** open any Solana token page and request a swap quote — the trade
panel shows routes. Watch server logs for `429` from Jupiter (a sign you're
keyless-throttled without a key).

---

## 3. Alchemy (EVM RPC — Ethereum, BNB Chain, Base)

Defaults use PublicNode free endpoints (`ethereum-rpc.publicnode.com`,
`bsc-rpc.publicnode.com`, `base-rpc.publicnode.com`) — verified working, but
shared and rate-limited. Alchemy gives each network a dedicated, key-bearing
endpoint.

1. Create an account at <https://dashboard.alchemy.com>.
2. Click **Create App**. Create **one app per network** — Alchemy apps are
   chain-specific:
   - App "SIGHT Ethereum" → Chain: **Ethereum** → Network: **Ethereum Mainnet**
   - App "SIGHT BNB" → Chain: **BNB Smart Chain** → Network: **BNB Smart Chain Mainnet**
   - App "SIGHT Base" → Chain: **Base** → Network: **Base Mainnet**
   Verify in each app's dashboard that the network label matches the chain you
   intend — a mismatched endpoint is rejected by SIGHT's health check.
3. Copy each app's **HTTPS API URL** (format
   `https://<network>.g.alchemy.com/v2/YOUR_KEY`). These URLs embed your key
   (🔒 secret — server-side only).
4. Set **one variable per network** in `.env.local`:

```
# 🔒 secrets — server-side only (never NEXT_PUBLIC_)
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
BSC_RPC_URL=https://bnb-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### Browser-side EVM RPC (read this)

Browser EVM calls do **not** use a `NEXT_PUBLIC_` variable. They are routed
through the built-in chain-aware proxy `POST /api/rpc/[chain]`, which resolves
each network to the server-side `ETHEREUM/BSC/BASE_RPC_URL` above. This:

- guarantees a Base request can never land on an Ethereum endpoint (and
  vice versa) — one shared browser URL cannot serve multiple EVM chains safely;
- keeps provider credentials that are embedded in Alchemy-style URLs on the
  server — never exposed through `NEXT_PUBLIC_` variables;
- is covered by the global API rate limiter and an `eth_*` method allowlist.

The old `NEXT_PUBLIC_EVM_RPC` variable was therefore **removed** from SIGHT
(and is no longer read by any code).

**Verify:** `GET /api/health` now reports `chainId N · block M` per network and
**fails with a chain-id mismatch error** if an endpoint serves the wrong
network (e.g. Ethereum expects `chainId 1`, BNB Chain `56`, Base `8453`).
Browser flows (embedded transfers, fee estimation) hit `/api/rpc/[chain]`,
which the browser DevTools network tab will show as same-origin requests —
no provider URL or key is ever visible client-side.

---

## 4. Robinhood Chain (BLOCKED — do not configure yet)

`ROBINHOOD_RPC_URL` exists in the chain registry but the chain is disabled
because no official RPC/chain-ID/market-data source has been verified. Do **not**
point it at a community endpoint: a wrong chain ID would make embedded signing
produce wrong-network transactions. It stays disabled until an official source
is verified — that is honest behavior, not a bug.

---

## 5. Block explorers (OPTIONAL — currently capability-gate only)

`ETHERSCAN_API_KEY`, `BSCSCAN_API_KEY`, `BASESCAN_API_KEY` are read **only** as
an existence check today (the risk report says verification is unavailable
without them). No explorer API is called by the current code. Obtain keys from
<https://etherscan.io/apis>, <https://bscscan.com/apis>,
<https://basescan.org/apis> (free tiers exist) **only when** the
source-verification risk feature is implemented — setting them earlier changes
nothing except the risk-report wording.