/**
 * Official SIGHT token configuration — the single source of truth for the
 * official SIGHT token mint across the app.
 *
 * The mint is public configuration (NEXT_PUBLIC_* → embedded into browser
 * assets at BUILD time). The header always shows the configured CA as an
 * informational, copyable address; it never triggers price, liquidity, or
 * swap requests, and configuring an address never enables trading.
 *
 * Rules enforced here:
 *  - The configured value is trimmed; whitespace never changes the address.
 *  - Structural validity is verified with the existing Solana PublicKey
 *    implementation (no new dependency).
 *  - The placeholder is always recognizable via an exact-match check
 *    (`isPlaceholder`) and `isOfficialSightMintLive()` stays available for
 *    future gating (e.g. enabling trade flows only once the real mint is
 *    configured).
 *  - There is NO fallback to any other token address: when the variable is
 *    missing we use the declared placeholder, nothing else. When an invalid
 *    value is configured, it is reported invalid — never silently replaced.
 */
import { PublicKey } from "@solana/web3.js";

/**
 * Placeholder mint configured until the official SIGHT token CA is announced.
 * A syntactically valid Solana burn-style address that is NOT a real token.
 * The header displays it as an informational, copyable CA — it is never used
 * for price, liquidity, or swap requests.
 */
export const SIGHT_TOKEN_PLACEHOLDER_MINT =
  "1nc1nerator11111111111111111111111111111111";

export interface SightTokenInfo {
  /** Trimmed configured value (the placeholder default when unset). */
  mint: string;
  /** True when the configured value IS the placeholder — not a real token. */
  isPlaceholder: boolean;
  /** True when the value is a structurally valid Solana public key. */
  isValid: boolean;
  /** Short display form ("1nc1…1111") when valid, otherwise "". */
  short: string;
}

/** The configured official SIGHT mint, trimmed; placeholder default if unset. */
export function configuredSightTokenMint(): string {
  const raw = process.env.NEXT_PUBLIC_SIGHT_TOKEN_MINT;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : SIGHT_TOKEN_PLACEHOLDER_MINT;
}

/** Inspect the configured official SIGHT mint (no network requests, ever). */
export function getSightTokenInfo(): SightTokenInfo {
  const mint = configuredSightTokenMint();
  const isPlaceholder = mint === SIGHT_TOKEN_PLACEHOLDER_MINT;
  let isValid = false;
  try {
    new PublicKey(mint);
    isValid = true;
  } catch {
    isValid = false;
  }
  const short = isValid ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : "";
  return { mint, isPlaceholder, isValid, short };
}

/**
 * True only when the configured official mint is real (structurally valid
 * AND not the placeholder). Drives whether the UI may show copy/explorer
 * controls for the official CA.
 */
export function isOfficialSightMintLive(): boolean {
  const info = getSightTokenInfo();
  return info.isValid && !info.isPlaceholder;
}
