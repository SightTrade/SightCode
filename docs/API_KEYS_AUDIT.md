# SIGHT — API Key & External Service Audit

> Generated from a full codebase inspection (all `process.env` reads traced to
> actual call sites, all hardcoded URLs inventoried, every provider adapter
> read in full). Status reflects the working tree at audit time.
> **No API keys are currently configured: `.env.local` does not exist.** The
> application has been running entirely on keyless defaults (public endpoints +
> free provider tiers), which is why every integration below has been verified
> working without keys.

## 1. Environment variables actually read by the code

Static reads (`process.env.NAME`):

| Variable | Read at | Notes |
|---|---|---|
| `SOLANA_RPC_URL` | `src/lib/providers/solanaRpc.ts` | Solana JSON-RPC via `@solana/web3.js` `Connection` |
| `JUPITER_API_KEY` | `src/lib/providers/jupiter.ts` | Sent as `x-api-key` header |
| `JUPITER_BASE` | `src/lib/providers/jupiter.ts` | Override for `https://api.jup.ag` |
| `DEXSCREENER_BASE` | `src/lib/providers/dexscreener.ts`, `/api/health` | Override for `https://api.dexscreener.com` |
| `GECKOTERMINAL_BASE` | `src/lib/providers/geckoterminal.ts`, `/api/health` | Override for `https://api.geckoterminal.com` |
| `NEXT_PUBLIC_SOLANA_RPC` | client-side Solana connection (embedded-wallet broadcast) | Public config |
| `NEXT_PUBLIC_EVM_RPC` | **removed** — was a single shared browser EVM URL; one URL cannot serve multiple EVM chains safely and Alchemy-style URLs embed credentials. Browser EVM calls now go through the chain-aware server proxy `POST /api/rpc/[chain]` (see §3a) | Removed |

Dynamic reads (`process.env[chain.rpcEnvKey]` — declared per chain in
`src/lib/chains.ts`):

| Variable | Read at | Notes |
|---|---|---|
| `ETHEREUM_RPC_URL` | `/api/balances`, `/api/health`, `/api/evm/tx/[hash]`, `chainRpcUrl()` | viem public clients |
| `BSC_RPC_URL` | same routes | viem public clients |
| `BASE_RPC_URL` | same routes | viem public clients |
| `ROBINHOOD_RPC_URL` | declared in `chains.ts` (`rpcEnvKey`), **never called**: the chain is `unconfigured` and every route rejects it before touching RPC | Placeholder |
| `ETHERSCAN_API_KEY` / `BSCSCAN_API_KEY` / `BASESCAN_API_KEY` | `/api/token/[chain]/[address]` — **existence check only** (`explorerKeyAvailable`) that shapes risk-report wording. **No explorer API is ever called.** | Capability gate |

## 2. Environment variable inventory

| Variable | Provider/service | Purpose | Required for | Class | Side | Current status |
|---|---|---|---|---|---|---|
| `SOLANA_RPC_URL` | Solana public RPC (`api.mainnet-beta.solana.com`) or Helius | Risk checks (mint/freeze authority, holder concentration), balances, tx status, health | Risk analysis, balances, tx status, health | OPTIONAL (public default works; Helius strongly recommended) | Server | **Missing** — public fallback; verified working but heavily rate-limited |
| `ETHEREUM_RPC_URL` | PublicNode default, or paid RPC | ETH balances, tx receipts, health, EVM quote reads | EVM features on Ethereum | OPTIONAL | Server | **Missing** — public fallback; verified working |
| `BSC_RPC_URL` | PublicNode default | BNB balances, receipts, health, quotes | EVM features on BNB Chain | OPTIONAL | Server | **Missing** — public fallback verified |
| `BASE_RPC_URL` | PublicNode default | ETH balances on Base, receipts, health, quotes | EVM features on Base | OPTIONAL | Server | **Missing** — public fallback verified |
| `ROBINHOOD_RPC_URL` | (no verified provider) | Would power Robinhood Chain features | Robinhood Chain support | FEATURE-REQUIRED (chain disabled until verified) | Server | **Missing / UNKNOWN** — no official public RPC verified at audit time; chain honestly disabled |
| `JUPITER_API_KEY` | Jupiter (`api.jup.ag`) | Raises Solana swap/build + price rate limits | Solana trading at volume | OPTIONAL (keyless 0.5 RPS verified) | Server | **Missing** — keyless verified working |
| `JUPITER_BASE` | Jupiter | API base override | Testing/proxies | OPTIONAL | Server | Missing (default used) |
| `DEXSCREENER_BASE` | DexScreener | API base override | Testing/proxies | OPTIONAL | Server | Missing (default used) |
| `GECKOTERMINAL_BASE` | GeckoTerminal | API base override | Testing/proxies | OPTIONAL | Server | Missing (default used) |
| `NEXT_PUBLIC_SOLANA_RPC` | Solana RPC (browser) | Browser connection for embedded-wallet tx broadcast | Embedded transfers on Solana | PUBLIC CONFIG | Client | **Missing** — falls back to public mainnet RPC; verified working |
| `NEXT_PUBLIC_EVM_RPC` | (removed) | Was: shared browser EVM URL | — | **REMOVED** | — | **Removed** — replaced by the chain-aware server proxy `/api/rpc/[chain]`; Alchemy credentials stay server-side |
| `ETHERSCAN_API_KEY` | Etherscan | Currently: risk-report capability gate only. (Future: source verification, holders) | Deeper EVM risk analysis | OPTIONAL | Server | Missing — risk reports honestly note verification unavailable |
| `BSCSCAN_API_KEY` | BscScan | Same, BNB Chain | Deeper EVM risk analysis | OPTIONAL | Server | Missing |
| `BASESCAN_API_KEY` | Basescan | Same, Base | Deeper EVM risk analysis | OPTIONAL | Server | Missing |
| `HELIUS_API_KEY` | Helius | **Not read by code** — named in SmartMoney UI as future enabler | Smart Money decoded activity (planned) | FEATURE-REQUIRED (when implemented) | Server | **Not implemented** — UI placeholder only |

## 3. Provider ↔ feature mapping (verified from imports and call sites)

| Provider | Endpoints used | Features served | Auth | Historical | Streaming |
|---|---|---|---|---|---|
| **DexScreener** (`/latest/dex/search`, `/tokens/v1/{chain}/{addr}`) | Search, token detail, discovery enrichment, price snapshots | Discovery, token pages, **live price SSE stream** (poller), pair/venue lists | None (free; 300 req/min pair endpoints — docs-verified) | No (snapshots + windows) | No (no websocket on free tier) |
| **GeckoTerminal** (`/networks/{n}/new_pools`, `trending_pools`, `/pools/{p}/ohlcv/{tf}`, `/tokens/{a}`, `/tokens/{a}/info`) | Discovery pages, **all chart OHLCV** (minute 1/5/15, hour 1/4, day 1), token metadata/images/socials, GT score | Charts, discovery, token detail, risk score | None (free ~30 req/min — docs-verified) | **Yes (OHLCV)** | No |
| **Jupiter** (`/swap/v1/quote`, `/swap/v1/swap`, `/price/v3`, `/tokens/v2/search`) | Solana swap quotes, swap-tx build, SOL price health, token search (holderCount) | **Solana trading** | Optional key (keyless 0.5 RPS — docs-verified; key raises limits) | No | No |
| **Solana JSON-RPC** (`@solana/web3.js`) | `getBalance`, `getParsedTokenAccountsByOwner`, `getTokenLargestAccounts`, `getParsedAccountInfo`, `getSignatureStatus`, `getSlot`, `getLatestBlockhash`, `sendTransaction` | Balances, holdings, risk, tx status, embedded transfers, health | None (public endpoint) | Partial (status only) | No subscriptions used |
| **EVM JSON-RPC** (viem) | `getBalance`, `estimateGas`, `getGasPrice`, `getTransactionReceipt`, `eth_blockNumber`, ERC-20 calls, router bytecode checks, `sendTransaction` | EVM balances, fees, tx status, EVM quotes (router verification), embedded transfers, health | None (public endpoints) | No (receipts only) | No |

**Not used anywhere** (grep-verified): PumpPortal, Helius, Alchemy, QuickNode, any WebSocket (`wss://`), any database SDK (prisma/postgres/redis/mongoose), any auth/JWT SDK, any email/notification service, any cron/background-worker library.

## 4. Current configuration status

- `.env.local`: **does not exist**. `.env`: does not exist. No secrets exist in the repo; nothing to rotate.
- The running application is **fully functional on keyless defaults** — every integration in section 3 was verified live (candles on 4 chains, SSE snapshots, balances on Solana/ETH/Base, Jupiter quotes, EVM quotes with honest failures).
- All chains target **mainnet**: `api.mainnet-beta.solana.com`, Ethereum/BNB/Base mainnet viem chains (`mainnet`, `bsc`, `base`). Robinhood Chain is disabled (unverified). No testnet endpoints are referenced.
- No mock/demo/fixture data in runtime paths (fixtures exist only in unit tests).
- No deployment configuration exists (no `vercel.json`, Dockerfile, etc.); `next start` self-hosted assumed.

## 5. Feature → provider gap analysis

| Feature (planned) | Status | Missing requirement |
|---|---|---|
| Smart Money decoded wallet activity | **NOT IMPLEMENTED** (UI says so) | Solana indexer — Helius Enhanced Transactions (`HELIUS_API_KEY`) or equivalent; EVM: Alchemy/dRPC enhanced APIs or a dedicated analytics provider |
| On-chain wallet transaction history | **NOT IMPLEMENTED** for EVM; Solana only in-session signed txs | Same indexer requirement — an ordinary RPC cannot list historical txs per wallet |
| Real-time trade streams (per-trade ticks) | **NOT IMPLEMENTED** (SSE snapshots only, honestly labeled) | Solana: Helius LaserStream/WebSocket or PumpPortal; EVM: provider websockets. None referenced in code |
| Robinhood Chain | **BLOCKED BY MISSING CONFIGURATION** | Verified official RPC + chain ID + market-data source; everything else honestly disabled until then |
| Broad multi-chain new-pair detection | Partial (GT new_pools + DexScreener) | Optional dedicated launch feeds (e.g. PumpPortal for Pump.fun events) — not referenced in code |
| Launch-event disambiguation (creation vs first trade vs pool creation vs liquidity add vs migration) | **NOT IMPLEMENTED as distinct events** — only pool creation time + venue labels are surfaced | PumpPortal (Pump.fun / Raydium LaunchLab events) or indexer-derived event stream |
| EVM risk source-code verification | Capability-gated (report says key needed) | Explorer API keys **plus an explorer client module** (does not exist yet — keys alone do nothing today) |
| Portfolio USD valuation on EVM tokens | Honest "unavailable" | An EVM token price source (DexScreener is already integrated and could serve this) |
| Push/email notifications | **NOT IMPLEMENTED** (alerts evaluate client-side while the app is open) | Optional web-push/email provider — not referenced in code |
| Monitoring / error tracking | **NOT IMPLEMENTED** | Optional: Sentry or similar |

## 6. Security findings

| Severity | Finding |
|---|---|
| — (none) | No `NEXT_PUBLIC_` variable carries a secret (only public RPC URLs). No hardcoded credentials, no secret-bearing URLs, `.env*` gitignored, `.env.local` doesn't exist. Explorer keys are existence-checked server-side only. Vault keys are client-side generated, AES-GCM encrypted, never transmitted; the server has no custody and never signs. |
| Medium | Public-RPC defaults are rate-limited and can throttle app IPs under load — a reliability risk for production, not a credential risk. Configure dedicated RPCs before wider release. |
| Low | `*_BASE` overrides point provider trust at an operator-chosen host (server-side only; documented). |
| Low | `ROBINHOOD_RPC_URL` reads nothing today; do not point it at an unverified community endpoint (chainId mismatch = wrong-network signing risk). |
| Info | Wallet signing credentials are correctly treated separately from API keys; no server-side custody wallet exists (and none should be introduced). |

## 7. Minimum to launch (recommendation order)

Nothing is strictly required — the app runs keyless today. Recommended before public beta:

1. `SOLANA_RPC_URL` → Helius free plan (public Solana RPC throttles aggressively under load).
2. `JUPITER_API_KEY` → Jupiter free key (trading rate limits).
3. `NEXT_PUBLIC_SOLANA_RPC` → the same Helius RPC (separate restricted key) for browser-side embedded Solana transfers. Browser EVM calls need no browser key — they use the chain-aware server proxy with `ETHEREUM/BSC/BASE_RPC_URL`.
4. `ETHEREUM_RPC_URL` / `BSC_RPC_URL` / `BASE_RPC_URL` → Alchemy (or another reputable provider) to replace publicnode defaults.
5. Explorer keys → optional now; only become actionable once an explorer client module is implemented.