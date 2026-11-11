# SIGHT — X (TWITTER) LAUNCH CAMPAIGN

**Real product. Real signal. No noise.**
15 tweets · 15 individually designed banners · 1600×900 · one identity.

This folder is the complete, ready-to-post launch campaign for SIGHT — a
multi-chain trading terminal (Solana, BNB Chain, Ethereum, Base live for
market data + wallet connect; swaps via Jupiter on Solana and verified V2
routers on EVM; Robinhood Chain registered but unconfigured). Every claim in
the copy maps to a verified product fact; nothing is fabricated, no token,
no airdrop, no invented points economy.

---

## Posting order

Post tweets 01 → 15 **in numbered order**. The narrative arc:

| Phase | Tweets | Story |
|---|---|---|
| Hook | 01–02 | The problem and the identity |
| Proof | 03–07 | The product: terminal, discovery, charts, activity, wallets |
| Position | 08–10 | Multi-chain, why SIGHT, principles |
| Build | 11–12 | Engineering and roadmap |
| Close | 13–15 | Rewards philosophy, community, brand statement |

Suggested cadence: 1–2 tweets per day; each tweet also stands alone.

## Assets

- **Tweet copy:** `tweets.md` — all 15 final tweets, alt text, and a
  pre-posting checklist.
- **Banner per tweet:** `tweet-01/banner.png` … `tweet-15/banner.png`
  (each exactly 1600×900 PNG; md5-verified unique).
- **Overview:** `campaign-overview.md` — strategy, verified-facts inventory.
- **Design notes:** `visual-guide.md` — per-banner design system.
- **File map:** `manifest.md` — tweet → banner → assets → status.
- **Review sheet:** `contact-sheet.png` — all 15 banners on one page.
- **Genuine screenshots:** `shots/` — captured from the running app
  (terminal workspace, new pairs, launch radar, wallet, landing).
- **Official brand assets:** `assets/` — copies of `sight_mark.png`,
  `sight_logo_trans.png` and the chain logos from `sight/public/logos/`,
  plus the product's Geist Sans/Mono fonts.

## How to post

1. Open `tweets.md`, copy tweet 01's copy block.
2. Attach `tweet-01/banner.png` as the media.
3. Paste the matching alt text (X: *Add description*) for accessibility.
4. Post, then repeat for 02 → 15 in order.
5. Before posting tweets 14–15, replace the `⟨add official handle⟩` slot
   with the real handle(s) — no handles were invented in this campaign.

## Regenerating (only if needed)

The banners are deterministic renders; do not hand-edit the PNGs.

```
cd sight/marketing/sight-x-campaign/tools
node gen.js          # renders all 15 banners at 1600×900
node gen.js sheet    # regenerates contact-sheet.png
node capture2.js     # re-captures genuine product screenshots (app must run)
```

`tools/` belongs to the campaign only — it is not part of the SIGHT
application and does not touch app code or configuration.
