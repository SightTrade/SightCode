# SIGHT X CAMPAIGN — VALIDATION REPORT
**Validated:** 2026-10-28 · **Project:** `sight` · **Campaign:** `marketing/sight-x-campaign/`

**Verdict: 15/15 tweet-banner pairs PASS.** 15 complete tweets · 15 finished
banners · all 1600×900 · all unique (md5-verified) · all visually reviewed.

---

## 1. Tweet–banner pair validation

Source of tweet copy: `tweets.md` (15/15 sections, each with Theme, Banner
reference, Alt text, final Copy, CTA — programmatically verified).

| # | Tweet (in `tweets.md`) | Banner file | Dimensions | md5 (uniq.) | Visually finished | Pairing | Status |
|---|---|---|---|---|---|---|---|
| 01 | INTRODUCING SIGHT | `tweet-01/banner.png` | 1600×900 | `2b6bce25531f` | ✓ brand poster, lockup + tagline | OK | **PASS** |
| 02 | THE PROBLEM | `tweet-02/banner.png` | 1600×900 | `0bc43f5500fc` | ✓ fragmentation editorial | OK | **PASS** |
| 03 | WHAT IS SIGHT? | `tweet-03/banner.png` | 1600×900 | `4476265b3fe0` | ✓ genuine terminal screenshot | OK | **PASS** |
| 04 | NEW PAIR DISCOVERY | `tweet-04/banner.png` | 1600×900 | `23ed56dc450b` | ✓ genuine New Pairs feed | OK | **PASS** |
| 05 | CHARTS & MARKET DATA | `tweet-05/banner.png` | 1600×900 | `b876cfadb8a1` | ✓ genuine candlestick chart | OK | **PASS** |
| 06 | LIVE TRADING ACTIVITY | `tweet-06/banner.png` | 1600×900 | `6c9376b51790` | ✓ real activity stat tiles | OK | **PASS** |
| 07 | WALLET INTELLIGENCE | `tweet-07/banner.png` | 1600×900 | `284551ad04a2` | ✓ original network diagram | OK | **PASS** |
| 08 | MULTI-CHAIN VISION | `tweet-08/banner.png` | 1600×900 | `55270313a21e` | ✓ chain status rows (4 live + 1 configuring) | OK | **PASS** |
| 09 | WHY SIGHT? | `tweet-09/banner.png` | 1600×900 | `495d8f4fcfc6` | ✓ type stack + signal line | OK | **PASS** |
| 10 | POSITIONING | `tweet-10/banner.png` | 1600×900 | `66d7e3489749` | ✓ four principles editorial | OK | **PASS** |
| 11 | BUILDING SIGHT | `tweet-11/banner.png` | 1600×900 | `7275babddbb3` | ✓ genuine Launch Radar + health strip | OK | **PASS** |
| 12 | WHAT COMES NEXT? | `tweet-12/banner.png` | 1600×900 | `030d0bb7fc94` | ✓ roadmap cards, no dates promised | OK | **PASS** |
| 13 | REWARDS PHILOSOPHY | `tweet-13/banner.png` | 1600×900 | `21b9905a9a6a` | ✓ dot-signal community concept | OK | **PASS** |
| 14 | COMMUNITY | `tweet-14/banner.png` | 1600×900 | `eb376986ef7b` | ✓ invitation + feed window + chips | OK | **PASS** |
| 15 | THE CLOSING STATEMENT | `tweet-15/banner.png` | 1600×900 | `96f6611939af` | ✓ closing lockup + signal line | OK | **PASS** |

**Checks performed**
- Dimensions: PNG header read of all 15 → `1600×900` exactly (DIMENSIONS ALL-OK).
- Uniqueness: MD5 of every file → 15 distinct hashes, zero duplicates.
- Visual review: every banner opened and inspected individually (3 review
  passes) plus the `contact-sheet.png` overview; no blank, placeholder or
  unfinished graphics; no clipped text.
- Pairing: regex extraction of each tweet's `**Banner:**` reference from
  `tweets.md` → folder matches tweet number and file exists (15/15 OK).
- Completeness: every tweet section contains Theme + Alt text + Copy + CTA.


---

## 2. Problems-panel issues — identified and repaired

Two diagnostics originated from this project: the campaign's own tooling
scripts (`marketing/sight-x-campaign/tools/`), which VS Code type-checks as
loose JavaScript files:

1. **`tools/gen.js` — TS2322:** `headless: "new"` is not assignable to
   puppeteer-core's `boolean | "shell"` launch option type.
2. **`tools/capture2.js` — TS2322 + TS2345/TS2339/TS2769 (×4):** the same
   `headless: "new"` type error, plus `string | number` errors from
   destructuring the untyped `jobs` array (`.includes`, `.replace`,
   `waitForFunction`, `setTimeout` calls).

**Repairs applied (type-level only, rendering unchanged):**
- `gen.js`: `headless: "new"` → `headless: true`.
- `capture2.js`: `headless: "new"` → `headless: true`, and the `jobs` array
  annotated with `/** @type {[string, string, string, number][]} */`.

**Verification:** `tsc --checkJs` over all 10 tool scripts now reports **zero
diagnostics**. The 15 regenerated banners are byte-identical to the originals
(all 15 md5 hashes match), confirming the fixes did not alter any artwork.
The SIGHT app itself was never part of this issue: `npx tsc --noEmit` on the
app reports **zero errors**, and ESLint shows only 6 pre-existing
`react-hooks/exhaustive-deps` warnings in app code (`AnalyticsView.tsx`,
`EvmTradePanel.tsx`) that predate and are unrelated to the campaign — left
untouched per the do-not-modify instruction.

## 3. Production-integrity check

- The campaign session wrote only inside `marketing/sight-x-campaign/**`
  (documents, banners, shots, assets, tools) and transient `_*.txt` scratch
  files at the workspace/sight roots.
- No file under `src/`, `public/`, `docs/`, `package.json`, `tsconfig.json`,
  `tailwind.config.ts`, `.env*` or any other production path was edited by
  this campaign.
- The `sight` folder is not a git repository, so the check was done via
  modification timestamps: during the audit two production files
  (`src/components/TokenInfoTabs.tsx` 17:26:38, `docs/DISCOVERY_AUDIT.md`
  17:40:16) were observed changing — **outside this campaign** (parallel
  development activity); the campaign's write log contains no production
  paths. The production server was started read-only for authentic
  screenshot capture and no trading functionality was altered.

## 4. Honest-content verification

- Screenshots in banners 03/04/05/11 are genuine captures from the running
  app (PUMP/Solana workspace, live New Pairs feed, Launch Radar with
  provider-health strip).
- Banner 06 shows real, live-at-capture market values (buys 8,412 / sells
  6,584 / volume $2.93M / liquidity $18.7M / +5.19% / PumpSwap) with the
  source line "DEXSCREENER · LIVE AT CAPTURE — 2026-10-28".
- Chain status in banner 08 states exactly what the product states
  (Solana full; BNB/Ethereum/Base data+wallet, swaps via verified V2
  routers; Robinhood Chain configuring).
- No airdrop, token ticker, points, snapshot or reward promises anywhere;
  tweet 13 explicitly says nothing is announced yet.
- No official links/handles were invented: tweets 14–15 carry a marked
  `⟨add official handle⟩` slot for the team (see `tweets.md` checklist).

## 5. Deliverable inventory

| File | Present |
|---|---|
| `README.md` (index, posting order, tweets, banner map) | ✅ |
| `tweets.md` — 15 final tweets | ✅ |
| `campaign-overview.md` — strategy + verified-facts inventory | ✅ |
| `visual-guide.md` — design system + per-banner notes | ✅ |
| `manifest.md` — tweet → banner → assets → status | ✅ |
| `VALIDATION_REPORT.md` — this report | ✅ |
| `contact-sheet.png` — all 15 banners on one page | ✅ |
| `tweet-01/banner.png` … `tweet-15/banner.png` — 15 unique 1600×900 PNGs | ✅ |
| `assets/` — official logo, lockup, 5 chain logos, Geist fonts | ✅ |
| `shots/` — 14 genuine app screenshots | ✅ |
| `tools/` — deterministic renderer + capture scripts (0 diagnostics) | ✅ |

**Final result: ALL 15 tweet-banner pairs PASS — the campaign is complete.**
