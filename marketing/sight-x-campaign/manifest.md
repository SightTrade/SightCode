# SIGHT X CAMPAIGN — MANIFEST
File map for every deliverable: tweet → banner → assets → status.
All 15 banners: 1600×900 PNG, verified unique (md5-checked), rendered from
`tools/gen.js` with the official brand assets and the product's Geist fonts.

| # | Tweet | Banner | Visual type | Assets used | Status |
|---|---|---|---|---|---|
| 01 | INTRODUCING SIGHT | `tweet-01/banner.png` | Minimal brand poster | `assets/sight_mark.png`, Geist fonts | ✅ DONE |
| 02 | THE PROBLEM | `tweet-02/banner.png` | Editorial fragmentation | `assets/sight_mark.png`, CSS tiles/SVG | ✅ DONE |
| 03 | WHAT IS SIGHT? | `tweet-03/banner.png` | Authentic terminal screenshot | `shots/terminal-token.png` | ✅ DONE |
| 04 | NEW PAIR DISCOVERY | `tweet-04/banner.png` | Authentic discovery feed | `shots/new-pairs.png` | ✅ DONE |
| 05 | CHARTS & MARKET DATA | `tweet-05/banner.png` | Authentic chart interface | `shots/terminal-token.png` | ✅ DONE |
| 06 | LIVE TRADING ACTIVITY | `tweet-06/banner.png` | Activity data visual | `shots/token-detail.png` (live values) | ✅ DONE |
| 07 | WALLET INTELLIGENCE | `tweet-07/banner.png` | Original wallet diagram | SVG network diagram | ✅ DONE |
| 08 | MULTI-CHAIN VISION | `tweet-08/banner.png` | Multi-chain composition | `assets/chain/*.svg` (5 chains) | ✅ DONE |
| 09 | WHY SIGHT? | `tweet-09/banner.png` | Bold typographic poster | SVG signal line | ✅ DONE |
| 10 | POSITIONING | `tweet-10/banner.png` | Editorial principles | CSS numbered cards | ✅ DONE |
| 11 | BUILDING SIGHT | `tweet-11/banner.png` | Authentic product visual | `shots/launch-radar.png` | ✅ DONE |
| 12 | WHAT COMES NEXT? | `tweet-12/banner.png` | Roadmap graphic | CSS/SVG cards | ✅ DONE |
| 13 | REWARDS PHILOSOPHY | `tweet-13/banner.png` | Community concept | SVG dot curve | ✅ DONE |
| 14 | COMMUNITY | `tweet-14/banner.png` | Community invitation | `assets/sight_mark.png`, SVG feed | ✅ DONE |
| 15 | CLOSING STATEMENT | `tweet-15/banner.png` | Brand closing poster | `assets/sight_logo_trans.png` | ✅ DONE |

## Posting order
Post tweets 01 → 15 in numbered order. The narrative arc: problem/identity
(01–02), product proof (03–07), positioning (08–10), engineering/roadmap
(11–12), community close (13–15). Suggested cadence: 1–2 per day.

## Supporting files
- `tweets.md` — all 15 final tweets, banner headlines, alt text, checklist
- `campaign-overview.md` — strategy, verified-facts inventory, arc
- `visual-guide.md` — per-banner design notes and design-system reference
- `contact-sheet.png` — 5×3 overview of all 15 banners (review artifact)
- `assets/` — official logos copied from `sight/public/logos/` + Geist fonts
- `shots/` — genuine product screenshots captured from the running app
- `tools/` — `gen.js` (banner renderer) + `capture2.js` (screenshot capture)
- `README.md` — how to locate and post the assets
