// SIGHT campaign screenshot capture - authentic product shots via puppeteer-core
const puppeteer = require("puppeteer-core");
const path = require("path");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const OUT_DIR = path.join(__dirname, "..", "shots");
const token = process.env.TOKEN_ADDR;
const wallet = process.env.WALLET_ADDR;
/** @type {[string, string, string, number][]} */
const jobs = [
  ["landing", "/", "Open the Terminal", 800],
  ["terminal-discovery", "/terminal", "Market Discovery", 4000],
  ["terminal-token", "/terminal?token=TOKENC", "Live price", 20000],
  ["new-pairs", "/new-pairs", "New Pairs", 5000],
  ["launch-radar", "/launch-radar", "Launch Radar", 5000],
  ["trending", "/trending", "Trending", 4000],
  ["discover", "/discover", "Discover", 4000],
  ["token-detail", "/token/TOKENQ", "Overview", 5000],
  ["wallet", "/wallet/WALLETQ", "Portfolio", 7000],
  ["smart-money", "/smart-money", "Smart Money", 1500],
  ["portfolio", "/portfolio", "Portfolio", 6000],
  ["analytics", "/analytics", "Analytics", 2500],
  ["alerts", "/alerts", "Alerts", 1500],
  ["watchlists", "/watchlists", "Watchlists", 1500],
];
async function main() {
  const only = process.argv[2] ? [process.argv[2]] : null;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ["--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--no-first-run", "--disable-extensions"],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  for (const [name, p, waitText, extraMs] of jobs) {
    if (only && !only.includes(name)) continue;
    const url = BASE + p.replace("TOKENQ", "solana/" + token).replace("TOKENC", "solana%3A" + token).replace("WALLETQ", "solana/" + wallet);
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
      await page.waitForFunction((t) => document.body && document.body.innerText.includes(t), { timeout: 20000 }, waitText);
      await new Promise((r) => setTimeout(r, extraMs));
      await page.screenshot({ path: path.join(OUT_DIR, name + ".png") });
      console.log("OK " + name);
    } catch (e) {
      console.log("FAIL " + name + ": " + String(e.message).split("\n")[0]);
      try { await page.screenshot({ path: path.join(OUT_DIR, name + ".png") }); } catch (e2) {}
    }
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
