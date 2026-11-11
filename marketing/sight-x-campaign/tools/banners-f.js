// SIGHT campaign banners — tweets 12–13
const card = (x, y, num, title, body) => `
  <div style="position:absolute;left:${x}px;top:${y}px;width:360px;height:168px;border:1px solid #202844;border-radius:14px;background:#0C1224;padding:22px 26px;z-index:3">
    <div class="mono" style="font-size:12px;letter-spacing:.3em;color:#35BFFF">NEXT · ${num}</div>
    <div style="font-size:22px;font-weight:700;margin-top:12px">${title}</div>
    <div class="mut" style="font-size:15px;line-height:1.5;margin-top:8px">${body}</div>
  </div>`;
const cards = [
  card(64, 590, "01", "Deeper launchpad coverage", "More launch platforms, same verification bar."),
  card(420, 540, "02", "Richer multi-chain discovery", "Wider coverage across verified networks."),
  card(776, 490, "03", "Decoded wallet activity", "Via indexer integrations — announced when it ships."),
  card(1132, 440, "04", "Smarter filters", "Personalization without the noise."),
].join("");

// Rising dot curve for the community banner — deterministic loop, no randomness.
let dots = "";
for (let c = 0; c < 38; c++) {
  for (let r = 0; r < 12; r++) {
    const x = 42 + c * 42;
    const y = 300 + r * 42;
    const ycurve = 700 - Math.round((c * c) / 7.2) + 24 * Math.sin(c / 5.5);
    if (Math.abs(y - ycurve) < 26) continue; // leave a gap under the curve line
    dots += `<circle cx="${x}" cy="${y}" r="3" fill="#1B2340"/>`;
  }
}
const accents = [];
for (let c = 0; c < 38; c++) {
  const x = 42 + c * 42;
  const y = 700 - Math.round((c * c) / 7.2) + 24 * Math.sin(c / 5.5);
  accents.push(`<circle cx="${x}" cy="${Math.round(y)}" r="5" fill="${c < 13 ? "#7857FF" : c < 26 ? "#9747FF" : "#35BFFF"}"/>`);
}

module.exports = [
  {
    n: 12, name: "ROADMAP — WHAT COMES NEXT", html: `
<div class="tick l">ROADMAP</div>
<div class="tick r">012 / 015</div>
<div class="head" style="top:96px;max-width:900px">
  <div class="kick">ROADMAP</div>
  <div class="h1" style="font-size:66px">WHAT COMES NEXT.</div>
</div>
<svg style="position:absolute;inset:0;z-index:1" width="1600" height="900" viewBox="0 0 1600 900" fill="none">
  <defs><linearGradient id="g12" x1="0" y1="0" x2="1500" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#7857FF"/><stop offset="1" stop-color="#35BFFF"/>
  </linearGradient></defs>
  <path d="M64 690 C 400 660 700 610 960 540 S 1400 460 1536 430" stroke="url(#g12)" stroke-width="2" stroke-dasharray="3 8" opacity=".7"/>
  <circle cx="244" cy="676" r="5" fill="#7857FF"/><circle cx="600" cy="620" r="5" fill="#9747FF"/>
  <circle cx="956" cy="556" r="5" fill="#35BFFF"/><circle cx="1312" cy="486" r="5" fill="#D34DFF"/>
</svg>
${cards}
<div style="position:absolute;left:1132px;top:660px;width:360px;height:104px;border:1.5px dashed #2A3352;border-radius:14px;display:flex;align-items:center;justify-content:center;z-index:3">
  <div class="mono" style="font-size:14px;letter-spacing:.26em;color:#5A6480">+ WHAT YOU ASK FOR NEXT</div>
</div>
<div class="foot"><span>SIGHT — SEE THE SIGNAL</span><span>SHIPPED IN THE OPEN · VERIFIED BEFORE IT SHIPS</span></div>
<div class="footline"></div>`
  },
  {
    n: 13, name: "COMMUNITY — REWARD PARTICIPATION, RESPONSIBLY", html: `
<div class="tick l">COMMUNITY</div>
<div class="tick r">013 / 015</div>
<div class="head" style="top:96px;max-width:780px">
  <div class="kick">COMMUNITY</div>
  <div class="h1" style="font-size:60px">REWARD PARTICIPATION, RESPONSIBLY.</div>
  <div class="sub" style="font-size:19px">Probably — for feedback, bug reports and real contributions. But we won't airdrop promises or invent a points economy before the product earns it.</div>
</div>
<svg style="position:absolute;inset:0;z-index:1" width="1600" height="900" viewBox="0 0 1600 900" fill="none">${dots}${accents.join("")}</svg>
<div class="mono dim" style="position:absolute;left:64px;bottom:74px;font-size:12px;letter-spacing:.24em;z-index:5">IF A PROGRAM SHIPS, IT WILL BE SIMPLE, HONEST, AND ANNOUNCED PROPERLY.</div>
<div class="foot"><span>SIGHT — SEE THE SIGNAL</span><span>NO TOKEN · NO TICKER · NO AIRDROP DATE — NOTHING TO FARM</span></div>
<div class="footline"></div>`
  },
];
