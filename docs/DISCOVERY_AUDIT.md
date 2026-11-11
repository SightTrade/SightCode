# SIGHT — Real-Time Discovery Audit (2026-10-26)

Verified live on 2026-10-26. This document records the state of the
new-token / new-pair discovery pipeline, environment requirements, and
unsupported launchpads after the full audit.

## 1. Environment variables — required vs optional

| Variable | Status | Notes |
|---|---|---|
| `SOLANA_RPC_URL` | REQUIRED (set) | Helius Solana RPC — powers risk checks, balances, tx status, health. |
| `NEXT_PUBLIC_SOLANA_RPC` | REQUIRED (set) | Browser-side Solana RPC for embedded-wallet broadcast. |
| `ETHEREUM_RPC_URL` | REQUIRED (set) | Alchemy Ethereum RPC (viem public clients). |
| `BSC_RPC_URL` | REQUIRED (set) | Alchemy BNB Chain RPC. |
| `BASE_RPC_URL` | REQUIRED (set) | Alchemy Base RPC. |
| `JUPITER_API_KEY` | REQUIRED (set) | Jupiter quote/swap API (x-api-key). |
| `HELIUS_API_KEY` | OPTIONAL (not read by code yet) | UI copy only — no feature implemented; do not add until the feature exists. |
| `PUMPPORTAL_WS_URL` | OPTIONAL (not needed) | Default `wss://pumpportal.fun/api/data` works keyless. Only override if endpoint changes. |
| `DEXSCREENER_BASE` | OPTIONAL | Default `https://api.dexscreener.com` (keyless). |
| `GECKOTERMINAL_BASE` | OPTIONAL | Default `https://api.geckoterminal.com` (keyless). |
| `ETHERSCAN_API_KEY` / `BSCSCAN_API_KEY` / `BASESCAN_API_KEY` | OPTIONAL (existence-check only) | No explorer API is called; risk-report capability gate only. |
| `ROBINHOOD_RPC_URL` | DO NOT CONFIGURE | Chain is disabled; no verified official RPC. |

## 2. Integrations — verified status

| Integration | Status | Key required? | Verification |
|---|---|---|---|
| PumpPortal `subscribeNewToken` | ✅ LIVE | NO — free method | 5 live `create` events captured in 75s (fresh probe `_ppprobe3.txt`); real signatures + mints. |
| PumpPortal `subscribeMigration` | ✅ LIVE (sporadic) | NO — free method | Documented shape verified against schema; graduations are rare events, none captured in a 75s window. |
| PumpPortal metered trade streams | ⛔ NOT USED | PAID (0.01 SOL / 10k events) | Intentionally excluded — free token/pool detection does not require them. |
| DexScreener pair/price/liquidity/volume enrichment | ✅ LIVE | NO — keyless public API | Real pair returned for the live-captured mint (`GR2BYg…8hcq` on `pumpfun`, `pairCreatedAt` present). |
| GeckoTerminal new-pools poller | ✅ LIVE | NO — keyless free API | Per-network pollers emit genuinely new pool events (one per configured network). |
| Helius Solana RPC | ✅ WORKING | Yes (configured) | Risk checks, balances, health probe 7/7 providers OK. |
| Alchemy EVM RPCs (ETH/BSC/Base) | ✅ WORKING | Yes (configured) | Health probe OK; EVM quote verified live (`lc()` fix). |
| Jupiter (quote/swap) | ✅ WORKING | Yes (configured) | Keyed access; quote/swap routes unaffected by discovery changes. |

## 3. Pipeline architecture (no duplicated trading logic)

- **Server-side singleton hub** (`src/lib/discovery/hub.ts`): ref-counted —
  adapters start on first SSE subscriber and stop ~30s after the last
  disconnect. One upstream connection per provider, shared by all visitors.
- **PumpPortal adapter** (`src/lib/discovery/pumpportal.ts`): single WS
  connection, exponential backoff reconnect (1s→60s max, jittered), stale
  detection (reconnect if no events for 10 min), re-subscribe after every
  reconnect, health reporting with `eventsObserved` / `reconnects`.
- **GeckoTerminal pollers** (`src/lib/discovery/gtpoller.ts`): one poller per
  configured network; diffs pool addresses across polls to emit genuinely new
  pools (45s TTL cache shared with `/api/discover` to stay within ~30 req/min).
- **DexScreener enrichment** (`src/lib/discovery/dexEnricher.ts`): batched
  ≤30 tokens per request, paced ≤1 request per 2s (≤30 req/min budget), TTL
  cache (120s), retry with backoff (+15s/+45s/+120s) for not-yet-indexed
  tokens, bounded queue (cap 400), dedup, honest-null mapping.
- **Deduplication**: hub merges by identity (`chain:address`); pool→token
  graduation linking; bounded stores (800 tokens / 800 pools, LRU evict).
- **Last-updated status**: `lastUpdatedAt` on every record + adapter health
  (`status`, `lastEventAt`, `lastError`, `reconnects`, `eventsObserved`)
  surfaced via `/api/discover/status` and SSE snapshot/health events.

## 4. Launchpad coverage

| Launchpad | Coverage | Mechanism |
|---|---|---|
| Pump.fun (Solana) | Real-time token creation + migration | PumpPortal free WS streams. |
| PumpSwap (Solana) | Real-time migration → AMM pool | PumpPortal `subscribeMigration`. |
| Raydium / Orca / Meteora / LaunchLab etc. (Solana) | Poll-based (~one poll cycle latency) | GeckoTerminal new-pools poller. |
| Uniswap / PancakeSwap / Base-launchpads (EVM) | Poll-based (~one poll cycle latency) | GeckoTerminal new-pools poller. |
| Bitquery / Birdeye / paid indexers | ⛔ NOT INTEGRATED | No demonstrated coverage gap; not approved by user. |

## 5. Verification record (2026-10-26)

- `typecheck` exit 0; `lint` exit 0; `vitest` **69/69 pass** (incl. 7 new
  `dexEnricher.test.ts` unit tests + 10 PumpPortal adapter/parser tests).
- Live probe: 75s PumpPortal capture → 5 live `subscribeNewToken` events;
  real mint cross-checked against DexScreener → real pair data returned.
- Probe artifacts: `_ppprobe3.txt`, `_dexprobe3.txt`.

## 6. Security audit (2026-10-26, follow-up)

| Finding | Severity | Detail |
|---|---|---|
| `NEXT_PUBLIC_SOLANA_RPC` ships the Helius API key to every browser | **FIXED (2026-10-26, owner-approved)** | The variable previously held the same credential-bearing Helius URL as `SOLANA_RPC_URL` (bundled into client JS via `TradePanel.tsx` and `wallets/TransferPanel.tsx`). **Applied fix:** `NEXT_PUBLIC_SOLANA_RPC=https://api.mainnet-beta.solana.com` (keyless public mainnet RPC); the credential-bearing URL remains server-side in `SOLANA_RPC_URL` only. Verified post-rebuild: 0 hits for the old key value and 0 `api-key=` patterns across all 70 client JS chunks; the server bundle retains its (server-only) references. Browser wallet flows unaffected — all three call sites use standard public-RPC methods (getLatestBlockhash, sendTransaction, sendRawTransaction), each already falling back to the public RPC in code. |
| Server-side Helius key derivation | OK | `heliusApiKey()` (`src/lib/providers/helius.ts`) is imported only by the token API route (server). No client component imports it. The `server-only` package is not installed, so the guard is by import graph, not compiler-enforced. |
| EVM credentials | OK | Alchemy keys stay server-side; browser EVM calls go through `/api/rpc/[chain]` with a strict method allowlist (`eth_/net_/web3_` only) — `alchemy_getAssetTransfers` is intentionally NOT exposed through the proxy; it runs server-side in the wallet route. |

## 7. Wallet analytics capabilities (2026-10-26, follow-up)

| Feature | Data source | Verified |
|---|---|---|
| Holders tab (Solana) | Direct RPC: `getTokenLargestAccounts` + `getMultipleAccountsInfo` (raw SPL owner parse). **Current balances only — no historical holdings without an indexer.** Pool/vault/custody accounts indistinguishable from wallets and labeled as such. | ✅ Live: 15 accounts for the trending mint; #1 holder was the pool itself (99.98% of supply) — the honesty note reflects reality. |
| Buy/sell direction (Solana activity) | Inferred from decoded transfer direction relative to the tx `feePayer` (Helius Enhanced API). Labeled "est." — never asserted as intent. `unknown` when ambiguous. | ✅ Live: `sell,buy,sell,buy,…,unknown` on the trending mint. |
| EVM wallet transfers (ETH/BSC/Base) | `alchemy_getAssetTransfers` — part of the **existing** Alchemy integration (no new credentials; verified supported on all three configured hosts). Direction relative to wallet (in/out). Swap-level classification still needs deeper indexing — rows are transfer records. | ✅ Live: 15 real rows for the Uniswap V2 Router (e.g. "Sent 2.5 WETH (erc20)", 2020-06-05). |

## 8. Verification record (2026-10-26, follow-up)

- `typecheck` exit 0 · `lint` exit 0 · `vitest` exit 0 · `next build` exit 0.
- End-to-end against the production server on :3210 (`_e2e.txt`): token detail 200 (pool + venue + price), activity with directions, holders with owner resolution, 1h candles 200 (100 candles, lastClose = live price), EVM wallet transfers 200 (15 rows).
- GeckoTerminal OHLCV returned HTTP 429 for two rapid sequential timeframes during probing and the route surfaced it honestly as 502 — rate-limit handling working as designed (shared 60s TTL cache absorbs normal UI usage).
