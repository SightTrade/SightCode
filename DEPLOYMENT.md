# SIGHT — Production Deployment Guide

**Recommended architecture:** single Linux VPS (Ubuntu 22.04/24.04 LTS) running
Node.js 20+ with **PM2** process management, **Nginx** as the HTTPS reverse
proxy on ports 80/443, and the Next.js production server bound to
**127.0.0.1:3210**. Your domain points at the VPS; Let's Encrypt provides the
TLS certificate.

## Why this architecture (and not Vercel or Docker)

| Requirement | VPS + PM2 | Vercel (serverless) | Docker VPS |
|---|---|---|---|
| Persistent **outbound WebSocket** (PumpPortal live feed) | ✅ held open by the always-on Node process | ❌ serverless functions cannot keep a background WS alive between invocations — live discovery would reconnect/drop constantly | ✅ |
| **In-memory state** (discovery hub, TTL caches, per-client rate limiter, SSE poller registry) | ✅ single fork process keeps everything warm | ❌ state is lost between invocations; rate limiting per-instance is meaningless | ✅ |
| **Long-lived SSE responses** (`/api/discover/stream`, `/api/price/stream`) | ✅ hours-long streams behind Nginx (timeouts configured) | ⚠️ streaming works but function execution limits + per-request billing make always-on feeds impractical | ✅ |
| Operational simplicity | ✅ matches the existing `next start` model exactly | requires architectural rework | ➕ reproducibility, but more moving parts for a single-server app |

**Verdict:** VPS + PM2. Vercel is architecturally unsuitable (persistent
WebSocket + in-memory state + always-on SSE). Docker is a valid alternative to
PM2 on the same VPS if you later want image-based deploys; everything in this
guide (Nginx, env, health checks) applies unchanged.

**Rate-limit limitation (documented, intentional):** the API rate limiter is
in-memory and per-process — correct for exactly ONE app instance (the
recommended deployment). Do NOT run `instances: 2`/cluster mode or multiple
servers without first moving the limiter to a shared store (e.g. Redis). This
is a code change requiring approval — not done here, and not needed for the
recommended single-instance architecture.

---

## 1. Server requirements

- Ubuntu 22.04/24.04 LTS, 1 vCPU / 2 GB RAM minimum (2 vCPU / 4 GB recommended —
  the app holds candles, discovery state and SSE clients in memory).
- 20 GB disk (build artifacts + logs).
- Node.js **20 LTS or 22 LTS** (`node -v`), npm 10+.
- Outbound HTTPS (providers) + inbound 80/443 (users) + SSH 22.
- No database, no Redis — the app is stateless server-side.

## 2. Domain and DNS

1. Buy the domain at any registrar.
2. In the registrar's DNS panel create an **A record**: `YOUR_DOMAIN` → the
   VPS IPv4 address (and optionally `www` → same, or a CNAME to `YOUR_DOMAIN`).
3. Wait for propagation (`dig +short YOUR_DOMAIN` returns the VPS IP).
4. Nothing else — Nginx + certbot handle the rest.

## 3. One-time server setup (exact commands)

```bash
# as root on the fresh VPS
adduser --gecos "" sight            # dedicated user
usermod -aG sudo sight              # optional admin rights
apt update && apt upgrade -y
apt install -y nginx curl git

# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v && npm -v

# PM2 (process manager) — installed globally for the sight user
su - sight
npm install -g pm2
pm2 install pm2-logrotate           # log rotation module
pm2 set pm2-logrotate:max_size 10M  # rotate when a log passes 10 MB
pm2 set pm2-logrotate:retain 14     # keep 14 rotated files
pm2 set pm2-logrotate:compress true

sudo mkdir -p /var/log/sight && sudo chown sight:sight /var/log/sight
sudo mkdir -p /opt/sight && sudo chown sight:sight /opt/sight
```

## 4. Deploy the application (first time)

```bash
# on YOUR machine (this project folder): get the code to the server
# (any of: git push + git clone on the server, rsync, or scp an archive —
#  .env.local and .next are excluded by the transfer method you choose)

su - sight                      # on the VPS
cd /opt/sight                   # put the project files here (no node_modules)

cp .env.example .env.local      # then edit .env.local — see section 5
nano .env.local                 # paste the REAL values from your local .env.local

npm ci                          # clean install from package-lock.json
npm run build                   # production build (exit 0 expected)
mkdir -p /var/log/sight

pm2 start ecosystem.config.js   # starts SIGHT on 127.0.0.1:3210
pm2 save                        # persist the process list
pm2 startup systemd             # prints a sudo command — run it once
                                # → SIGHT auto-starts on server reboot
```

## 5. Environment variables (production)

Enter the real values **only** in `/opt/sight/.env.local` on the VPS (owner
readable: `chmod 600 .env.local`). Values are never placed in PM2 config, Git,
or any client bundle. Copy the values from your local `.env.local` — do not
email/commit them.

| Variable | Where it is used | Required |
|---|---|---|
| `SOLANA_RPC_URL` | server routes (risk, balances, tx status) + Helius Enhanced API (key embedded) | REQUIRED |
| `NEXT_PUBLIC_SOLANA_RPC` | browser (embedded-wallet broadcast) — public keyless URL | REQUIRED |
| `JUPITER_API_KEY` | server (swap quotes/build) | REQUIRED |
| `ETHEREUM_RPC_URL` | server (Alchemy; key embedded) | REQUIRED |
| `BSC_RPC_URL` | server (Alchemy; key embedded) | REQUIRED |
| `BASE_RPC_URL` | server (Alchemy; key embedded) | REQUIRED |
| `HELIUS_API_KEY` | optional standalone override (already covered by `SOLANA_RPC_URL`) | optional |
| `ETHERSCAN_API_KEY` / `BSCSCAN_API_KEY` / `BASESCAN_API_KEY` | existence-check only today | optional |
| `JUPITER_BASE` / `DEXSCREENER_BASE` / `GECKOTERMINAL_BASE` / `PUMPPORTAL_WS_URL` | endpoint overrides (defaults verified) | optional |

There is **no database and no `DATABASE_URL`** — the app is stateless
server-side (watchlists/vault live in the visitor's browser).

## 6. Nginx reverse proxy + HTTPS

```bash
# copy the prepared config and set your domain
sudo cp /opt/sight/deploy/nginx-sight.conf /etc/nginx/sites-available/sight.conf
sudo nano /etc/nginx/sites-available/sight.conf   # replace YOUR_DOMAIN (2 places)
sudo ln -s /etc/nginx/sites-available/sight.conf /etc/nginx/sites-enabled/sight.conf
sudo rm -f /etc/nginx/sites-enabled/default       # remove the default site
sudo nginx -t                                     # must say: syntax ok

# TLS via Let's Encrypt (HTTP-01 challenge through the :80 block)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN
# certbot rewrites the config with certificate paths + auto-redirect to HTTPS
# auto-renewal: a systemd timer is installed automatically; test with:
sudo certbot renew --dry-run
```

The prepared config already handles what SIGHT needs:
- `proxy_buffering off` + 12 h timeouts on `/api/discover/stream` and
  `/api/price/stream` (SSE must not be buffered or cut short);
- WebSocket `Upgrade` mapping (forward-compatible);
- gzip for pages/JSON (streams excluded);
- `client_max_body_size 1m` (the app caps RPC bodies at 64 KiB anyway);
- HSTS + `server_tokens off` at the edge (the app sets X-Frame-Options,
  nosniff, Referrer-Policy, Permissions-Policy and COOP itself).

Reload after any change: `sudo nginx -t && sudo systemctl reload nginx`.

## 7. Start / restart / logs

```bash
pm2 start ecosystem.config.js     # first start
pm2 restart sight                 # restart (keeps the saved process list)
pm2 reload sight                  # graceful reload (drains connections)
pm2 stop sight                    # stop
pm2 logs sight                    # follow combined logs (live)
pm2 logs sight --lines 200        # last 200 lines
less /var/log/sight/sight-out.log # raw stdout log
less /var/log/sight/sight-error.log # raw stderr log
pm2 status                        # uptime, restarts, memory
pm2 monit                         # live CPU/memory dashboard
```

Log rotation is provided by `pm2-logrotate` (configured in section 3):
10 MB per file, 14 retained files, compressed.

## 8. Updating SIGHT after a git push

```bash
su - sight
cd /opt/sight
git pull                          # fetch the new code
npm ci                            # only when package-lock.json changed
npm run build                     # production build (required after code changes)
pm2 restart sight                 # serve the new build
# verify before celebrating:
curl -s http://127.0.0.1:3210/api/health | head -c 400
```

If the new code changed `.env.example`, diff it against the live
`.env.local` and add any NEW required variable before restarting.

## 9. Verifying production health

```bash
# from the VPS:
curl -s http://127.0.0.1:3210/api/health | python3 -m json.tool
# → every provider in "checks" must be "ok": DexScreener, GeckoTerminal,
#   Jupiter, Solana RPC, Ethereum RPC, BNB Chain RPC, Base RPC.

# from the public internet:
curl -sI https://YOUR_DOMAIN/ | head -n 1                 # HTTP/2 200
curl -sI https://YOUR_DOMAIN/terminal | head -n 1         # HTTP/2 200
curl -s https://YOUR_DOMAIN/api/health | head -c 400
# SSE smoke (should stay open and print `event:`/`data:` lines):
curl -N --max-time 15 https://YOUR_DOMAIN/api/discover/stream | head -c 600
```

Note: a provider check going `ok:false` in `/api/health` means exactly that —
the upstream provider was unreachable from the server at that moment. The UI
renders the affected data honestly as unavailable; it does not fabricate data.
If ALL checks fail at once, first check the VPS outbound internet, then the
provider status pages.

## 10. Rolling back a failed deployment

```bash
cd /opt/sight
git log --oneline -10             # find the last known-good commit
git checkout <good-commit>        # detach to it (or: git revert <bad-commit>)
npm ci && npm run build
pm2 restart sight
curl -s http://127.0.0.1:3210/api/health | head -c 200   # confirm recovery
```

Keep the existing `.env.local` (deploys never regenerate it). If a build
fails, the running PM2 process keeps serving the previous build — the site
does not go down while you fix it.

## 11. Production security checklist (all verified for the current code)

- Secrets only in `/opt/sight/.env.local` (chmod 600, git-ignored); never in
  PM2 env, never `NEXT_PUBLIC_`-prefixed, never logged (audit found zero
  secret-adjacent console statements).
- Browser bundles contain no provider credentials: EVM RPC access goes through
  the same-origin `/api/rpc/[chain]` proxy (method allowlist `eth_`/`net_`/
  `web3_`, 64 KiB body cap, batch ≤100, 15 s upstream timeout); the Solana
  browser endpoint is a public keyless RPC.
- Security headers: app sets X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy and COOP (`next.config.mjs`); Nginx adds
  HSTS. No CORS headers are needed — the frontend is same-origin by design.
- Rate limiting: every `/api/*` request passes a per-client token bucket
  (90 req/min, 429 with retry-after). **Single-instance by design** — do not
  scale to multiple processes/hosts without moving the limiter to a shared
  store (explicit approval required; not needed for this architecture).
- Wallet security: keys are generated and AES-GCM-encrypted in the visitor's
  browser; the server never sees or signs with them. Swap building returns an
  unsigned transaction for the user's wallet to sign.
- Data honesty: every provider failure renders as an explicit
  unavailable/unknown state — no fabricated market data anywhere.
