/**
 * SIGHT — PM2 production process configuration.
 *
 * Recommended deployment: single Linux VPS, Node.js 20+, PM2 process manager,
 * Nginx reverse proxy on ports 80/443 terminating HTTPS, proxying to the
 * Next.js production server on 127.0.0.1:3210.
 *
 * Why PM2/fork (and not cluster/serverless):
 *  - The app holds long-lived in-process state: the PumpPortal outbound
 *    WebSocket feeding the discovery hub, in-memory TTL caches, the SSE
 *    poller registry, and the per-client rate-limit buckets. A single fork
 *    process preserves all of it. `instances: 1` is REQUIRED — the rate
 *    limiter and discovery hub are in-memory and not shared across processes.
 *  - Serverless platforms (e.g. Vercel) cannot hold a persistent outbound
 *    WebSocket or per-instance state and would break live discovery.
 *
 * Secrets are NOT passed through this file. Next.js loads them at runtime
 * from `.env.local` in the app directory (git-ignored). Only non-secret
 * runtime settings (NODE_ENV, PORT) are set here.
 */
module.exports = {
  apps: [
    {
      // Process name used by all pm2 commands: pm2 restart sight, pm2 logs sight…
      name: "sight",
      // Run the Next.js CLI directly (no npm wrapper) so signals reach Node.
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3210",
      // Adjust to the actual deploy directory on the server.
      cwd: "/opt/sight",
      // Single instance is required (in-memory rate limiter + discovery hub).
      instances: 1,
      exec_mode: "fork",
      // Auto-restart on crash; give the process time to settle before
      // counting an uptime as stable, and back off if it crash-loops.
      autorestart: true,
      watch: false,
      min_uptime: "20s",
      max_restarts: 20,
      restart_delay: 3000,
      // Restart if the process leaks memory beyond this (safety net).
      max_memory_restart: "700M",
      // Grace period for in-flight SSE responses on stop/reload.
      kill_timeout: 10000,
      env: {
        NODE_ENV: "production",
        // Port is preserved: 3210 internally (Nginx proxies 443 → 3210).
        PORT: "3210",
      },
      // Logs (create the directory first: mkdir -p /var/log/sight).
      // Rotate with: pm2 install pm2-logrotate (see DEPLOYMENT.md).
      out_file: "/var/log/sight/sight-out.log",
      error_file: "/var/log/sight/sight-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      time: true,
    },
  ],
};
