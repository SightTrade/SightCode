"use client";

import { useState } from "react";
import { CHAINS } from "@/lib/chains";
import { getSightTokenInfo } from "@/lib/sightToken";
import { useToast } from "./Toast";

/**
 * SIGHT Token CA — permanent header display of the configured token contract
 * address (`NEXT_PUBLIC_SIGHT_TOKEN_MINT`, see src/lib/sightToken.ts).
 *
 * - Always shows the configured CA (shortened when space is limited) with a
 *   copy action that places the COMPLETE address on the clipboard, plus clear
 *   "Copied!" feedback. On wide screens a Solscan explorer link is included.
 * - The display is INFORMATIONAL ONLY: it performs zero network requests —
 *   no price, liquidity, balance, or swap calls — and configuring an address
 *   never enables trading. Trading availability continues to depend on the
 *   verified swap infrastructure and real token data, exactly as before.
 * - Reads exclusively from NEXT_PUBLIC_SIGHT_TOKEN_MINT: updating that
 *   variable (and rebuilding) automatically updates the displayed address,
 *   the shortened form, the copied value, and the explorer link. No source
 *   changes are needed when the official mint is announced.
 * - Responsive: compact copy chip below `lg` (header space is reserved for
 *   the wallet controls), full display at `lg` and above.
 */
export function SightTokenBadge() {
  const info = getSightTokenInfo();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(info.mint);
      setCopied(true);
      toast("success", "Copied!", info.short);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("error", "Copy failed", "Clipboard is unavailable");
    }
  };

  // Misconfiguration guard: an invalid value is shown as a muted hint and is
  // never copied or linked.
  if (!info.isValid) {
    return (
      <span
        className="hidden h-9 items-center gap-1.5 rounded-md border border-dashed border-line bg-surface px-2.5 lg:inline-flex"
        title="NEXT_PUBLIC_SIGHT_TOKEN_MINT is not a valid Solana address"
        aria-label="SIGHT token CA is misconfigured"
      >
        <span className="text-2xs font-bold tracking-[0.18em] text-fg/70">SIGHT TOKEN CA</span>
        <span className="text-2xs uppercase tracking-wider text-muted">invalid CA</span>
      </span>
    );
  }

  const explorerUrl = CHAINS.solana.explorer?.token(info.mint) ?? null;

  const copyButton = (
    <button
      onClick={copy}
      className="focus-ring flex h-9 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-fg"
      aria-label="Copy the SIGHT token CA"
      title="Copy the full SIGHT Token CA"
    >
      {copied ? (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 text-pos" aria-hidden="true">
          <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <rect x="7" y="7" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v8A1.5 1.5 0 005.5 15H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );

  return (
    <>
      {/* Full display — lg and above */}
      <span
        className="hidden h-9 items-center gap-0.5 rounded-md border border-line bg-surface pl-2.5 lg:inline-flex"
        aria-label="SIGHT Token CA"
        title="SIGHT Token CA — informational display; use the copy icon for the full address"
      >
        <span className="text-2xs font-bold tracking-[0.14em] text-fg/70">SIGHT TOKEN CA</span>
        {copied ? (
          <span className="px-1 text-2xs font-semibold uppercase tracking-wide text-pos">Copied!</span>
        ) : (
          <span className="px-1 font-mono text-2xs text-muted">{info.short}</span>
        )}
        {copyButton}
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring flex h-9 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-fg"
            aria-label="View the SIGHT token on Solscan"
            title="View on Solscan"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M8 4H5.5A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16h9a1.5 1.5 0 001.5-1.5V12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M11.5 4H16v4.5M16 4l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </span>
      <span
        className="flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-1.5 lg:hidden"
        aria-label="SIGHT Token CA — copy the full address"
        title="Copy the SIGHT Token CA"
      >
        <span className="text-2xs font-bold tracking-[0.1em] text-fg/70">CA</span>
        {copied ? (
          <span className="text-2xs font-semibold uppercase text-pos">Copied!</span>
        ) : (
          <button
            onClick={copy}
            className="focus-ring flex h-5 w-5 items-center justify-center rounded text-muted transition-colors hover:text-fg"
            aria-label="Copy the SIGHT token CA"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden="true">
              <rect x="7" y="7" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v8A1.5 1.5 0 005.5 15H7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </span>
    </>
  );
}
