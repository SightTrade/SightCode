"use client";

import { useEffect } from "react";
import { Sidebar, MobileNav } from "./Sidebar";
import { TopBar } from "./TopBar";
import { GlobalSearch } from "./GlobalSearch";
import { ToastProvider } from "./Toast";
import { AlertsEngine } from "./AlertsEngine";
import { isVaultUnlocked, lockVault } from "@/lib/wallet/vault";

/** Lock an unlocked embedded-wallet vault after this much user inactivity. */
const VAULT_IDLE_LOCK_MS = 15 * 60_000;

/**
 * Shared application shell: sidebar + top bar + toast + global search + the
 * client-side alert engine (alerts evaluate while the app is open — there is
 * no background worker, and the UI says so).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  // Security: an unlocked embedded-wallet vault (decrypted private keys in
  // module memory) must not stay unlocked forever. Lock after 15 minutes
  // without user interaction; re-locking is non-destructive — the user simply
  // re-enters the vault password when they next need the wallet.
  useEffect(() => {
    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
    };
    window.addEventListener("pointerdown", bump, { passive: true });
    window.addEventListener("keydown", bump, { passive: true });
    const id = window.setInterval(() => {
      if (isVaultUnlocked() && Date.now() - lastActivity > VAULT_IDLE_LOCK_MS) {
        lockVault();
      }
    }, 30_000);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
      window.clearInterval(id);
    };
  }, []);

  return (
    <ToastProvider>
      <AlertsEngine />
      <GlobalSearch />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
        </div>
      </div>
      <MobileNav />
    </ToastProvider>
  );
}

/** Manages the ⌘K global keydown target at shell level (delegated by GlobalSearch). */
export function useGlobalShortcuts() {
  useEffect(() => {
    // placeholder for future shortcuts
  }, []);
}