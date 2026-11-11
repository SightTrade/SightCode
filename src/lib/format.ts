/**
 * Formatting helpers. All inputs are plain numbers derived from decimal-safe
 * server-side computations; authoritative raw amounts always stay strings.
 */

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function fmtUsd(v: number | null | undefined, opts?: { compact?: boolean; signed?: boolean }): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const signed = opts?.signed && v > 0 ? "+" : "";
  if (opts?.compact !== false && Math.abs(v) >= 10_000) {
    return `${signed}${fmtCompact(v, "$")}`;
  }
  const digits = Math.abs(v) < 0.0001 ? 8 : Math.abs(v) < 1 ? 4 : Math.abs(v) < 1000 ? 2 : 0;
  return `${signed}$${v.toLocaleString("en-US", {
    minimumFractionDigits: digits === 0 ? 0 : Math.min(2, digits),
    maximumFractionDigits: digits,
  })}`;
}

export function fmtCompact(v: number | null | undefined, prefix = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${prefix}${trimZeros((abs / 1e9).toFixed(2))}B`;
  if (abs >= 1e6) return `${sign}${prefix}${trimZeros((abs / 1e6).toFixed(2))}M`;
  if (abs >= 1e3) return `${sign}${prefix}${trimZeros((abs / 1e3).toFixed(1))}K`;
  return `${sign}${prefix}${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function trimZeros(s: string): string {
  return s.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

export function fmtPct(v: number | null | undefined, opts?: { signed?: boolean }): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = opts?.signed === false ? v.toFixed(2) : `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
  return `${s}%`;
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Convert raw token units (string/BigInt) with decimals — decimal-safe. */
export function fromRaw(raw: string | bigint, decimals: number | null): number | null {
  if (decimals === null) return null;
  try {
    const bi = typeof raw === "bigint" ? raw : BigInt(raw);
    const base = BigInt(10) ** BigInt(decimals);
    const whole = bi / base;
    const frac = bi % base;
    return Number(`${whole}.${frac.toString().padStart(decimals, "0").slice(0, 12)}`);
  } catch {
    return null;
  }
}

/** Convert a human amount to raw units (string). */
export function toRaw(amount: string, decimals: number): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  try {
    const [whole, frac = ""] = amount.replace(",", ".").split(".");
    const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
    return `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  } catch {
    return null;
  }
}

/** Age string from a duration in ms: 42s / 3m / 5h / 2d / 19d */
export function fmtAge(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

export function timeAgo(ts: number | null | undefined, now = Date.now()): string {
  if (ts === null || ts === undefined || !Number.isFinite(ts)) return "—";
  return `${fmtAge(now - ts)} ago`;
}

export function fmtTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined || !Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortAddr(a: string | null | undefined, head = 4, tail = 4): string {
  if (!a) return "—";
  if (a.length <= head + tail + 1) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function decimalsForPrice(price: number | null): number {
  if (price === null || !Number.isFinite(price)) return 2;
  if (price === 0) return 2;
  if (price >= 1) return 2;
  if (price >= 0.01) return 4;
  if (price >= 0.0001) return 6;
  return 9;
}

export function fmtPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: decimalsForPrice(price) })}`;
}

export function deltaColor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "text-muted";
  return v > 0 ? "text-pos" : "text-neg";
}

/** Truncate a string for safe display (token names from external metadata are untrusted). */
export function sanitizeText(s: string | null | undefined, max = 280): string {
  if (!s) return "";
  // strip control chars & anything that looks like markup injection
  return s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}