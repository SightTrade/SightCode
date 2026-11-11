// SIGHT campaign banners — tweets 14–15
// Rising live-feed line inside the invitation window — deterministic loop.
let pts = [];
for (let i = 0; i <= 24; i++) {
  const x = 20 + i * 35;
  const y = 150 - Math.round((i * i) / 24) + 14 * Math.sin(i / 3.2);
  pts.push(x + "," + Math.round(y));
}
const feed = `<polyline points="${pts.join(" ")}" fill="none" stroke="#35BFFF" stroke-width="2.5"/>` +
  `<circle cx="870" cy="${pts[24].split(",")[1]}" r="5" fill="#35BFFF"/>` +
  `<circle cx="820" cy="${pts[23].split(",")[1]}" r="4" fill="#9747FF"/>` +
  `<circle cx="770" cy="${pts[22].split(",")[1]}" r="4" fill="#7857FF"/>`;

module.exports = [
  {
    n: 14, name: "COMMUNITY — HELP SHAPE WHAT SIGHT BECOMES", html: `
<div class="glow" style="left:-180px;bottom:-240px;width:700px;height:600px;background:#35BFFF;opacity:.18"></div>
<div class="tick l">COMMUNITY</div>
<div class="tick r">014 / 015</div>
<div class="head" style="top:96px;max-width:900px">
  <div class="kick">JOIN THE BUILD</div>
  <div class="h1" style="font-size:62px">HELP SHAPE WHAT SIGHT BECOMES.</div>
  <div class="sub" style="font-size:19px;max-width:640px">SIGHT is built by people who trade. Try the terminal. Break it. Tell us what's missing — the roadmap gets written from real feedback.</div>
</div>
<div class="window" style="left:64px;top:480px;width:920px;height:300px">
  <div class="winbar"><i></i><i></i><i></i><span>SIGHT — LIVE FEED</span><div class="live">LIVE</div></div>
  <svg width="920" height="262" viewBox="0 0 920 262" fill="none" style="display:block;background:#090D1B">${feed}</svg>
</div>
<div style="position:absolute;left:1032px;top:480px;width:504px;display:flex;flex-direction:column;gap:16px;z-index:3">
  <span class="chip" style="padding:14px 22px;font-size:14px">FEEDBACK</span>
  <span class="chip" style="padding:14px 22px;font-size:14px">BUG REPORTS</span>
  <span class="chip" style="padding:14px 22px;font-size:14px">IDEAS</span>
  <span class="chip" style="padding:14px 22px;font-size:14px;border-color:#4A3AA0;color:#C9BCFF">FOLLOW THE BUILD →</span>
</div>
<div class="foot"><span>SIGHT — SEE THE SIGNAL</span><span>OFFICIAL LINKS IN BIO — NOTHING FABRICATED</span></div>
<div class="footline"></div>`
  },
  {
    n: 15, name: "CLOSING POSTER — SEE THE SIGNAL", html: `
<div class="glow" style="left:-240px;top:-260px;width:820px;height:680px;background:#7857FF;opacity:.32"></div>
<div class="glow" style="right:-240px;bottom:-300px;width:860px;height:700px;background:#35BFFF;opacity:.22"></div>
<div class="grid" style="opacity:.5"></div>
<svg style="position:absolute;inset:0;z-index:2" width="1600" height="900" viewBox="0 0 1600 900" fill="none">
  <defs><linearGradient id="g15" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#7857FF"/><stop offset=".55" stop-color="#9747FF"/><stop offset="1" stop-color="#35BFFF"/>
  </linearGradient></defs>
  <path d="M-30 640 C 240 590 420 700 700 640 S 1180 570 1630 620" stroke="url(#g15)" stroke-width="9" opacity=".16"/>
  <path d="M-30 640 C 240 590 420 700 700 640 S 1180 570 1630 620" stroke="url(#g15)" stroke-width="2.5" opacity=".85"/>
</svg>
<div class="tick l">X LAUNCH CAMPAIGN</div>
<div class="tick r">015 / 015</div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:3">
  <img src="../assets/sight_logo_trans.png" alt="" style="height:250px;width:auto;display:block;filter:drop-shadow(0 0 40px rgba(120,87,255,.4))">
  <div style="font-size:88px;font-weight:800;letter-spacing:.04em;margin-top:44px;line-height:1">SEE THE SIGNAL.</div>
  <div class="mono" style="margin-top:30px;font-size:14px;letter-spacing:.28em;color:#929BB8;text-align:center;line-height:2">ONE WORKSPACE FOR DISCOVERY · CHARTS · RISK · WALLETS<br>AND EXECUTION ACROSS CHAINS</div>
</div>
<div class="foot"><span>SIGHT — SEE THE SIGNAL</span><span>TRY THE TERMINAL · FOLLOW THE BUILD</span></div>
<div class="footline"></div>`
  },
];
