"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { ChainSelector } from "./ChainSelector";
import { NetworkStatus } from "./NetworkStatus";
import { WalletButton } from "./WalletButton";
import { useUi } from "@/lib/store";

export function TopBar() {
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:gap-3 sm:px-4">
      {/* Compact mobile header brand */}
      <Link href="/" className="md:hidden" aria-label="SIGHT home">
        <Logo size={22} />
      </Link>

      <ChainSelector />

      {/* Global search trigger */}
      <button
        onClick={() => setSearchOpen(true)}
        className="btn-ghost focus-ring h-9 flex-1 max-w-md justify-start gap-2 px-3 text-muted"
        aria-label="Open global search"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6"/><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        <span className="hidden sm:inline">Search tokens, wallets, signatures…</span>
        <span className="sm:hidden">Search</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 py-0.5 text-2xs text-muted sm:block">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
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