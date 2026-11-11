# SIGHT X CAMPAIGN — VISUAL GUIDE
How the 15 banners are built, what each one says, and how they stay recognizably
SIGHT while never repeating a layout.

---

## THE SYSTEM (shared by all 15)

| Element | Rule |
|---|---|
| Canvas | 1600×900, 16:9, PNG |
| Background | Deep navy `#080A18` / dark surface `#101329` — matches the app |
| Type | Geist Sans for headlines, Geist Mono for data/labels (the product's own fonts) |
| Headline size | 72–150px, always fully inside the frame |
| Accents | violet `#7857FF`, bright purple `#9747FF`, electric blue `#35BFFF`, magenta `#D34DFF` — never all at once |
| Green/red | Only for price indicators, exactly as the product uses them |
| Logo | Official `sight_mark.png` / `sight_logo_trans.png` — never redrawn |
| Margins | ≥64px safe zone; nothing critical near the edges |
| Texture | Subtle grain (≤4% opacity), thin 1px rules, no heavy glow |
| Honesty | Screenshots are genuine captures from the running app; no invented data |

## THE 15 COMPOSITIONS (one-line identities)

1. **Brand poster** — huge SIGHT wordmark, mark above, diagonal violet/blue
   light field. Quiet. Zero product UI.
2. **Fragmentation** — scattered muted panels (CHARTS/PRICES/WALLETS/RISK/NEWS)
   drift left; one violet SIGHT panel sits aligned right. "TOO MANY TABS."
3. **Terminal hero** — real screenshot in a framed browser-like panel, headline
   band above: "ONE TERMINAL. MORE CONTEXT."
4. **Discovery feed** — real /new-pairs table cropped to its most readable
   third, annotated with two mono callouts. "FIND THE MARKET EARLIER."
5. **Chart study** — chart panel on the right third, oversized stacked headline
   on the left. "MARKETS DO NOT STAND STILL."
6. **Activity rows** — real buys/sells, liquidity and venue rows rendered as a
   data sheet with a magenta accent rule. "SEE THE ACTIVITY BEHIND THE CHART."
7. **Wallet network** — original diagram: center node (wallet), verified data
   points around it, thin violet lines. "A WALLET IS MORE THAN AN ADDRESS."
8. **Chain grid** — five horizontal chain rows (Solana/BNB/Ethereum/Base LIVE,
   Robinhood CONFIGURING) crossed by one signal line. "FOLLOW THE SIGNAL
   ACROSS CHAINS."
9. **Type stack** — DISCOVERY/CHARTS/RISK/WALLETS muted, EXECUTION violet, one
   signal line through the stack. "LESS SWITCHING. MORE CONTEXT."
10. **Principles** — four numbered mono rows (sourced data / unavailable over
    fabricated / one workspace / verified chains). "DIFFERENT TERMINALS.
    DIFFERENT PRIORITIES."
11. **Annotated build** — real Launch Radar screenshot with provider-health
    strip, four restrained mono annotations. "BUILT WITH INTENTION."
12. **Roadmap** — four milestone cards on a rising baseline; honest footer
    "SHIPPED IN THE OPEN. VERIFIED BEFORE IT SHIPS." "WHAT COMES NEXT?"
13. **Participation** — dots rising into a signal curve; no coins, no gold.
    "REWARD PARTICIPATION, RESPONSIBLY."
14. **Invitation** — open terminal window with rising feed line + three chips
    (feedback / bugs / ideas). "HELP SHAPE WHAT SIGHT BECOMES."
15. **Closing poster** — signal line entering from the left into the full
    lockup; tagline set large. "SEE THE SIGNAL. IGNORE THE NOISE."

## CATEGORY COVERAGE (per the brief)

- Product-focused: 03, 04, 11 (+ chart crop in 05)
- Typography-led editorial: 01, 09, 15 (+ 10)
- Chart/data-focused: 05, 06
- Wallet/transaction-focused: 06 (activity rows), 07 (network diagram)
- Community/roadmap: 12, 13, 14
- Competitor differentiation: 10
- Opening brand poster: 01 — Closing brand poster: 15

## ART DIRECTION NOTES

- **Never** cover live UI numbers with decorative elements.
- The violet→blue diagonal gradient appears only in 01 and 15 (bookends).
- Banners 04 and 11 reuse the same screenshot family intentionally — they are
  the "proof" pair — but crops and treatments differ completely.
- Magenta is reserved for the activity story (06) and the closing accent (15).
- All mono captions use uppercase, letter-spaced, muted `#929BB8`.
- Grain overlay on every banner keeps the flat renders from feeling sterile.

## HOW TO REGENERATE

All banners are deterministic renders (HTML/CSS screenshotted at 1600×900 via
headless Chrome) — no AI image generation, no fake interfaces, exact text:

```
cd sight/marketing/sight-x-campaign/tools
node gen.js             # renders all 15 banners (banner-01..15)
node gen.js sheet       # renders contact-sheet.png
node capture2.js        # re-captures genuine product screenshots
```

Brand assets are copied from `sight/public/logos/` into `assets/` — the single
source of truth remains the app's public folder.
