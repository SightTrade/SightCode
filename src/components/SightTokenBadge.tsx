"use client";

import { useState } from "react";
import { CHAINS } from "@/lib/chains";
import { getSightTokenInfo } from "@/lib/sightToken";
import { useToast } from "./Toast";

/**
 * Official SIGHT token CA entry for the header.
 *
 * - Placeholder configured → "SIGHT TOKEN · COMING SOON": purely static text.
 *   No copy action, no explorer link, and ZERO data requests — the placeholder
 *   is never treated as a real token (no price, balance, or swap calls).
 * - Real official mint configured (PublicKey-valid, not the placeholder) →
 *   shows the shortened CA with copy-to-clipboard (success feedback) and a
 *   Solscan explorer link. Configuring an address never enables trading —
 *   trading availability continues to depend on the verified swap
 *   infrastructure and real token data, exactly as before.
 * - An invalid configured value is reported as not-live and never displayed
 *   as an official CA.
 *
 * This component performs no network requests of any kind.
 */
export function SightTokenBadge() {
  const info = getSightTokenInfo();
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const live = info.isValid && !info.isPlaceholder;

  if (!live) {
    return (
      <span
        className="hidden lg:inline-flex h-9 items-center  gap-1.5 rounded-md border border-dashed border-line bg-surface px-2.5"
        title="Official SIGHT token — coming soon. The placeholder address is not a tradeable token."
        aria-label="Official SIGHT token: coming soon"
      >
        <span className="text-2xs font-bold tracking-[0.18em] text-fg/70">SIGHT</span>
        <span className="text-2xs uppercase tracking-wider text-muted">coming soon</span>
      </span>
    );
  }

  const explorerUrl = CHAINS.solana.explorer?.token(info.mint) ?? null;

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(info.mint);
      setCopied(true);
      toast("success", "Official SIGHT CA copied", info.short);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("error", "Copy failed", "Clipboard is unavailable");
    }
  };

  return (
    <span
      className="hidden lg:inline-flex h-9 items-center  gap-0.5 rounded-md border border-line bg-surface pl-2.5"
      aria-label="Official SIGHT token contract address"
    >
      <span className="text-2xs font-bold tracking-[0.18em] text-fg/70">SIGHT</span>
      <span className="px-1 font-mono text-2xs text-muted">{info.short}</span>
      <button
        onClick={copy}
        className="focus-ring flex h-9 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-fg"
        aria-label="Copy the official SIGHT token address"
        title="Copy the full official CA"
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
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring flex h-9 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-fg"
          aria-label="View the official SIGHT token on Solscan"
          title="View on Solscan"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M8 4H5.5A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16h9a1.5 1.5 0 001.5-1.5V12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M11.5 4H16v4.5M16 4l-6.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      )}
    </span>
  );
}
