"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { ChainSelector } from "./ChainSelector";
import { NetworkStatus } from "./NetworkStatus";
import { WalletButton } from "./WalletButton";
import { SightTokenBadge } from "./SightTokenBadge";
import { useUi } from "@/lib/store";

/** Official SIGHT social presence. */
const X_URL = "https://x.com/SightTerminal";
const GITHUB_URL = "https://github.com/SightTrade";

export function TopBar() {
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-line bg-surface/95 px-2 backdrop-blur sm:gap-2 sm:px-3">
      {/* Compact mobile header brand (mark only below sm to keep the row fitting) */}
      <Link href="/" className="md:hidden" aria-label="SIGHT home">
        <Logo size={22} collapsed />
      </Link>

      <ChainSelector />

      {/* Global search trigger (icon-only below sm on narrow phones) */}
      <button
        onClick={() => setSearchOpen(true)}
        className="btn-ghost focus-ring h-9 min-w-0 flex-1 max-w-md justify-start gap-2 px-3 text-muted overflow-hidden"
        aria-label="Open global search"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0"><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6"/><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        <span className="hidden truncate sm:inline">Search tokens, wallets, signatures…</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 py-0.5 text-2xs text-muted sm:block">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <SightTokenBadge />
        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="SIGHT on X (Twitter)"
          title="SIGHT on X"
          className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-fg sm:hidden lg:flex lg:h-9 lg:w-9 lg:border lg:border-line lg:bg-surface lg:hover:border-line-strong"
        >
          {/* Official X brand mark */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.636 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
          </svg>
        </a>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="SIGHT on GitHub"
          title="SIGHT on GitHub"
          className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-fg sm:hidden lg:flex lg:h-9 lg:w-9 lg:border lg:border-line lg:bg-surface lg:hover:border-line-strong"
        >
          {/* Official GitHub brand mark */}
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.898-.015 3.293 0 .319.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12z" />
          </svg>
        </a>
        <NetworkStatus />
        <Link
          href="/alerts"
          className={`focus-ring hidden h-9 items-center rounded-md border border-line bg-surface px-2.5 text-sm sm:flex ${pathname === "/alerts" ? "text-accent" : "text-muted hover:text-fg"}`}
          aria-label="Alerts"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 3a5 5 0 015 5v3l1.5 2.5H3.5L5 11V8a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8.5 16a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}
