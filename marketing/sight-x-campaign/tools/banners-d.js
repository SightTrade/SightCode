// SIGHT campaign banners — tweets 08–09
const row = (logo, name, sub, status, statusColor, statusBorder, op) => `
  <div style="display:flex;align-items:center;gap:16px;border:1px solid #2A3352;background:#0C1224;border-radius:13px;padding:0 22px;height:84px;${op ? "opacity:" + op : ""}">
    <img src="../assets/chain/${logo}" alt="" style="width:30px;height:30px">
    <div><div style="font-size:21px;font-weight:700">${name}</div><div class="mono" style="font-size:11px;letter-spacing:.16em;color:#5A6480;margin-top:3px">${sub}</div></div>
    <div class="mono" style="margin-left:auto;border:1px solid ${statusBorder};color:${statusColor};border-radius:999px;padding:6px 16px;font-size:12px;letter-spacing:.22em">${status}</div>
  </div>`;
const LIVE = ["#42D392", "#2B5A46"];
const rows = [
  row("solana.svg", "Solana", "DATA · CHARTS · RISK · WALLET · SWAPS VIA JUPITER", "LIVE", ...LIVE),
  row("bnb-chain.svg", "BNB Chain", "DATA · CHARTS · WALLET", "LIVE", ...LIVE),
  row("ethereum.svg", "Ethereum", "DATA · CHARTS · WALLET", "LIVE", ...LIVE),
  row("base.svg", "Base", "DATA · CHARTS · WALLET", "LIVE", ...LIVE),
  row("robinhood-chain.svg", "Robinhood Chain", "AWAITING VERIFIED CONFIGURATION", "CONFIGURING", "#FFCB69", "#5A5140", ".72"),
].join("");

module.exports = [
  {
    n: 8, name: "MULTI-CHAIN — FOLLOW THE SIGNAL ACROSS CHAINS", html: `
<div class="glow" style="right:-200px;top:-240px;width:700px;height:600px;background:#7857FF;opacity:.2"></div>
<div class="tick l">MULTI-CHAIN</div>
<div class="tick r">008 / 015</div>
<div class="head" style="top:96px;max-width:1000px">
  <div class="kick">MULTI-CHAIN</div>
  <div class="h1" style="font-size:66px">FOLLOW THE SIGNAL ACROSS CHAINS.</div>
</div>
<div style="position:absolute;left:64px;top:320px;width:900px;display:flex;flex-direction:column;gap:13px;z-index:3">${rows}</div>
<div style="position:absolute;left:1080px;top:360px;width:456px;height:360px;border:1px solid #26304E;border-radius:16px;background:#0C1224;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;z-index:3">
  <img src="../assets/sight_mark.png" alt="" style="height:72px;width:auto;filter:drop-shadow(0 0 28px rgba(120,87,255,.45))">
  <div class="mono" style="font-size:13px;letter-spacing:.3em;color:#929BB8;text-align:center;line-height:2.1">SAME WORKSPACE · SAME DESIGN<br>SAME DISCIPLINE</div>
  <div class="mono" style="font-size:12px;letter-spacing:.24em;color:#5A6480;text-align:center">MORE COVERAGE SHIPS AS EACH<br>INTEGRATION VERIFIES. NOT BEFORE.</div>
</div>
<div class="foot"><span>SIGHT — SEE THE SIGNAL</span><span>STATUS EXACTLY AS THE PRODUCT STATES IT</span></div>
<div class="footline"></div>`
  },
  {
    n: 9, name: "TYPOGRAPHIC POSTER — LESS SWITCHING, MORE CONTEXT", html: `
<div class="tick l">WHY SIGHT?</div>
<div class="tick r">009 / 015</div>
<svg style="position:absolute;inset:0;z-index:2" width="1600" height="900" viewBox="0 0 1600 900" fill="none">
  <defs><linearGradient id="g9" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#7857FF"/><stop offset=".5" stop-color="#9747FF"/><stop offset="1" stop-color="#35BFFF"/>
  </linearGradient></defs>
  <path d="M-20 470 C 260 410 480 540 800 470 S 1300 400 1620 470" stroke="url(#g9)" stroke-width="10" opacity=".14"/>
  <path d="M-20 470 C 260 410 480 540 800 470 S 1300 400 1620 470" stroke="url(#g9)" stroke-width="3" opacity=".9"/>
  <circle cx="800" cy="470" r="6" fill="#35BFFF"/>
</svg>
<div style="position:absolute;left:64px;top:150px;display:flex;flex-direction:column;gap:30px;z-index:3">
  <div style="font-size:96px;font-weight:800;line-height:1;color:transparent;-webkit-text-stroke:1.5px #2A3352">DISCOVERY</div>
  <div style="font-size:96px;font-weight:800;line-height:1;color:transparent;-webkit-text-stroke:1.5px #2A3352">CHARTS</div>
  <div style="font-size:96px;font-weight:800;line-height:1;color:transparent;-webkit-text-stroke:1.5px #2A3352">RISK</div>
  <div style="font-size:96px;font-weight:800;line-height:1;color:transparent;-webkit-text-stroke:1.5px #2A3352">WALLETS</div>
  <div style="font-size:96px;font-weight:800;line-height:1;background:linear-gradient(90deg,#7857FF,#9747FF 55%,#35BFFF);-webkit-background-clip:text;background-clip:text;color:transparent">EXECUTION</div>
</div>
<div style="position:absolute;left:64px;bottom:96px;font-size:34px;font-weight:800;letter-spacing:.02em;z-index:4">LESS SWITCHING. MORE CONTEXT.</div>
<div class="foot"><span>SIGHT — SEE THE SIGNAL</span><span>ONE WORKSPACE · FOUR LOGINS LESS</span></div>
<div class="footline"></div>`
  },
];
