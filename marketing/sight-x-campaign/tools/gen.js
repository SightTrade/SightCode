// SIGHT campaign banner renderer — deterministic HTML/CSS -> PNG via puppeteer-core.
// Renders 15 banner compositions (banners-a..e.js) at exactly 1600x900 using the
// official brand assets and the product's own Geist fonts (embedded as base64).
// Usage: node gen.js [1..15]   |   node gen.js sheet   (contact sheet)
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const { CSS } = require("./banner-css.js");
const banners = [
  ...require("./banners-a.js"),
  ...require("./banners-b.js"),
  ...require("./banners-c.js"),
  ...require("./banners-d.js"),
  ...require("./banners-e.js"),
  ...require("./banners-f.js"),
  ...require("./banners-g.js"),
];

function wrap(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><section class="banner">${html}</section></body></html>`;
}
const pad = (n) => String(n).padStart(2, "0");

(async () => {
  const arg = process.argv[2];
  const mode = arg === "sheet" ? "sheet" : arg ? Number(arg) : null;
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--no-first-run", "--no-default-browser-check"],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  if (mode === "sheet") {
    const cells = banners.map((b) =>
      `<figure><img src="../tweet-${pad(b.n)}/banner.png"><figcaption>0${b.n} · ${b.name}</figcaption></figure>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{margin:0;box-sizing:border-box}body{background:#050711;font-family:GM,monospace;padding:26px}
      h1{color:#F4F6FF;font-family:GS,sans-serif;font-size:24px;letter-spacing:.12em;margin:0 0 22px 4px;font-weight:700}
      h1 span{color:#35BFFF}
      .sheet{display:grid;grid-template-columns:repeat(5,400px);gap:18px}
      figure{margin:0}img{width:400px;height:225px;object-fit:cover;border:1px solid #202844;border-radius:6px;display:block}
      figcaption{color:#929BB8;font-size:12px;letter-spacing:.14em;margin-top:7px;text-align:center}
    </style></head><body><h1>SIGHT — X CAMPAIGN <span>·</span> 15-BANNER CONTACT SHEET</h1><div class="sheet">${cells}</div></body></html>`;
    const hp = path.join(__dirname, "contact-sheet.html");
    fs.writeFileSync(hp, html);
    await page.setViewport({ width: 2160, height: 880 });
    await page.goto("file:///" + hp.replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: path.join(__dirname, "..", "contact-sheet.png") });
    console.log("OK contact-sheet");
  } else {
    for (const b of banners) {
      if (mode !== null && b.n !== mode) continue;
      const dir = path.join(__dirname, "..", "tweet-" + pad(b.n));
      fs.mkdirSync(dir, { recursive: true });
      const hp = path.join(__dirname, "banner-" + pad(b.n) + ".html");
      fs.writeFileSync(hp, wrap(b.html));
      await page.goto("file:///" + hp.replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      const fontsOk = await page.evaluate(() => document.fonts.check("800 20px GS") && document.fonts.check("400 20px GM"));
      await new Promise((r) => setTimeout(r, 250));
      const el = await page.$(".banner");
      await el.screenshot({ path: path.join(dir, "banner.png") });
      console.log("OK " + pad(b.n) + (fontsOk ? "" : " (FONTS MISSING)"));
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
