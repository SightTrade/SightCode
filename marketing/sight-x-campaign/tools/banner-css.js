// Shared design system for the SIGHT campaign banners (loaded by gen.js).
const fs = require("fs");
const path = require("path");
const b64 = (f) => fs.readFileSync(f).toString("base64");
const F_SANS = b64(path.join(__dirname, "..", "assets", "fonts", "Geist-Variable.woff2"));
const F_MONO = b64(path.join(__dirname, "..", "assets", "fonts", "GeistMono-Variable.woff2"));

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
@font-face{font-family:GS;src:url(data:font/woff2;base64,${F_SANS}) format("woff2");font-weight:100 900}
@font-face{font-family:GM;src:url(data:font/woff2;base64,${F_MONO}) format("woff2");font-weight:100 900}
body{background:#000}
.banner{width:1600px;height:900px;position:relative;overflow:hidden;background:#050711;color:#F4F6FF;font-family:GS,system-ui,sans-serif}
.mono{font-family:GM,ui-monospace,monospace}
.mut{color:#929BB8}.dim{color:#5A6480}
.head{position:absolute;left:64px;top:92px;max-width:760px;z-index:5}
.kick{font-family:GM;font-size:16px;letter-spacing:.34em;color:#35BFFF;margin-bottom:20px}
.h1{font-size:80px;font-weight:800;letter-spacing:-.02em;line-height:1.04}
.sub{margin-top:22px;font-size:20px;line-height:1.55;color:#929BB8;max-width:600px}
.chip{display:inline-block;border:1px solid #2A3352;border-radius:999px;padding:10px 20px;font-family:GM;font-size:13px;letter-spacing:.2em;color:#C7CFEA;background:#0C1224}
.foot{position:absolute;left:64px;right:64px;bottom:26px;display:flex;justify-content:space-between;align-items:center;font-family:GM;font-size:13px;letter-spacing:.22em;color:#5A6480;z-index:9}
.footline{position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#7857FF,#9747FF 38%,#35BFFF 72%,#D34DFF);z-index:9}
.tick{position:absolute;top:30px;font-family:GM;font-size:13px;letter-spacing:.26em;color:#5A6480;z-index:9}
.tick.l{left:64px}.tick.r{right:64px}
.window{position:absolute;border:1px solid #26304E;border-radius:14px;overflow:hidden;background:#090D1B;box-shadow:0 40px 90px rgba(0,0,0,.55);z-index:4}
.winbar{height:38px;background:#0C1224;border-bottom:1px solid #202844;display:flex;align-items:center;padding:0 16px;gap:7px}
.winbar i{width:10px;height:10px;border-radius:50%;background:#232B49;display:block}
.winbar span{margin-left:10px;font-family:GM;font-size:12px;letter-spacing:.2em;color:#5A6480}
.winbar .live{margin-left:auto;display:flex;align-items:center;gap:7px;font-family:GM;font-size:11px;letter-spacing:.18em;color:#42D392}
.winbar .live::before{content:"";width:7px;height:7px;border-radius:50%;background:#42D392;box-shadow:0 0 8px #42D392}
.shot{display:block;width:100%;object-fit:cover}
.tile{position:absolute;background:#0C1224;border:1px solid #202844;border-radius:14px;padding:20px 24px;z-index:3}
.tlab{font-family:GM;font-size:12px;letter-spacing:.24em;color:#5A6480}
.tval{font-family:GM;font-size:38px;font-weight:700;margin-top:10px;letter-spacing:-.01em}
.glow{position:absolute;border-radius:50%;filter:blur(90px);z-index:0}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(120,87,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,87,255,.05) 1px,transparent 1px);background-size:80px 80px;z-index:1}
`;

module.exports = { CSS };
