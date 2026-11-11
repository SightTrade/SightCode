"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChainId } from "./chains";

/**
 * Client-side persisted stores. All user data lives in the browser — no
 * user data leaves the device unless an explicit trade is signed.
 */

export interface WatchedToken {
  chain: ChainId;
  address: string;
  symbol?: string;
}
export interface WatchedWallet {
  chain: ChainId;
  address: string;
  label?: string;
}

interface WatchlistsState {
  tokens: WatchedToken[];
  wallets: WatchedWallet[];
  addToken: (t: WatchedToken) => void;
  removeToken: (chain: ChainId, address: string) => void;
  isTokenWatched: (chain: ChainId, address: string) => boolean;
  addWallet: (w: WatchedWallet) => void;
  removeWallet: (chain: ChainId, address: string) => void;
}

export const useWatchlists = create<WatchlistsState>()(
  persist(
    (set, get) => ({
      tokens: [],
      wallets: [],
      addToken: (t) =>
        set((s) =>
          s.tokens.some((x) => x.chain === t.chain && x.address === t.address)
            ? s
            : { tokens: [...s.tokens, t] },
        ),
      removeToken: (chain, address) =>
        set((s) => ({ tokens: s.tokens.filter((x) => !(x.chain === chain && x.address === address)) })),
      isTokenWatched: (chain, address) => get().tokens.some((x) => x.chain === chain && x.address === address),
      addWallet: (w) =>
        set((s) =>
          s.wallets.some((x) => x.chain === w.chain && x.address === w.address)
            ? s
            : { wallets: [...s.wallets, w] },
        ),
      removeWallet: (chain, address) =>
        set((s) => ({ wallets: s.wallets.filter((x) => !(x.chain === chain && x.address === address)) })),
    }),
    { name: "sight.watchlists" },
  ),
);

export type AlertKind = "price-above" | "price-below" | "pct-change" | "volume-spike" | "liquidity-below";

export interface AlertConfig {
  id: string;
  kind: AlertKind;
  chain: ChainId;
  address: string;
  symbol?: string;
  /** threshold: USD price for price alerts, % for pct-change, USD for volume/liquidity. */
  threshold: number;
  active: boolean;
  createdAt: number;
  lastFiredAt: number | null;
  lastFiredValue: number | null;
}

interface AlertsState {
  alerts: AlertConfig[];
  addAlert: (a: Omit<AlertConfig, "id" | "createdAt" | "lastFiredAt" | "lastFiredValue">) => AlertConfig;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  markFired: (id: string, value: number) => void;
}

export const useAlerts = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      addAlert: (a) => {
        const alert: AlertConfig = {
          ...a,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          lastFiredAt: null,
          lastFiredValue: null,
        };
        set((s) => ({ alerts: [...s.alerts, alert] }));
        return alert;
      },
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id) })),
      toggleAlert: (id) =>
        set((s) => ({ alerts: s.alerts.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) })),
      markFired: (id, value) =>
        set((s) => ({
          alerts: s.alerts.map((x) => (x.id === id ? { ...x, lastFiredAt: Date.now(), lastFiredValue: value } : x)),
        })),
    }),
    { name: "sight.alerts" },
  ),
);

interface SettingsState {
  slippageBps: number;
  priorityLevel: "low" | "medium" | "high" | "veryHigh";
  maxPriorityLamports: number;
  compactTables: boolean;
  /** Buy presets in native units (SOL). */
  buyPresets: number[];
  /** Sell presets in percent of the position. */
  sellPresets: number[];
  setSlippageBps: (n: number) => void;
  setPriorityLevel: (p: SettingsState["priorityLevel"]) => void;
  setMaxPriorityLamports: (n: number) => void;
  setCompactTables: (b: boolean) => void;
  setBuyPresets: (p: number[]) => void;
  setSellPresets: (p: number[]) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      slippageBps: 50,
      priorityLevel: "medium",
      maxPriorityLamports: 1_000_000,
      compactTables: false,
      buyPresets: [0.1, 0.5, 1, 5],
      sellPresets: [25, 50, 75, 100],
      setSlippageBps: (n) => set({ slippageBps: Math.min(Math.max(n, 0), 3000) }),
      setPriorityLevel: (p) => set({ priorityLevel: p }),
      setMaxPriorityLamports: (n) => set({ maxPriorityLamports: n }),
      setCompactTables: (b) => set({ compactTables: b }),
      setBuyPresets: (p) => set({ buyPresets: p.filter((x) => x > 0).slice(0, 6) }),
      setSellPresets: (p) =>
        set({ sellPresets: p.filter((x) => x > 0 && x <= 100).slice(0, 6) }),
    }),
    { name: "sight.settings" },
  ),
);

interface UiState {
  activeChain: ChainId;
  sidebarCollapsed: boolean;
  searchOpen: boolean;
  setActiveChain: (c: ChainId) => void;
  toggleSidebar: () => void;
  setSearchOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      activeChain: "solana",
      sidebarCollapsed: false,
      searchOpen: false,
      setActiveChain: (c) => set({ activeChain: c }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSearchOpen: (open) => set({ searchOpen: open }),
    }),
    { name: "sight.ui", partialize: (s) => ({ activeChain: s.activeChain, sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);

export type WalletSource = "embedded" | "external";

/** A public address tracked read-only in the Wallets page. Never holds keys. */
export interface TrackedWallet {
  id: string;
  family: "solana" | "evm";
  address: string;
  name: string;
}

interface TrackedWalletsState {
  tracked: TrackedWallet[];
  addTracked: (w: Omit<TrackedWallet, "id">) => boolean; // false when duplicate
  removeTracked: (id: string) => void;
  renameTracked: (id: string, name: string) => void;
}

export const useTrackedWallets = create<TrackedWalletsState>()(
  persist(
    (set, get) => ({
      tracked: [],
      addTracked: (w) => {
        if (get().tracked.some((x) => x.address === w.address)) return false;
        set((s) => ({ tracked: [...s.tracked, { ...w, id: crypto.randomUUID() }] }));
        return true;
      },
      removeTracked: (id) => set((s) => ({ tracked: s.tracked.filter((x) => x.id !== id) })),
      renameTracked: (id, name) =>
        set((s) => ({ tracked: s.tracked.map((x) => (x.id === id ? { ...x, name } : x)) })),
    }),
    { name: "sight.trackedWallets" },
  ),
);

interface WalletState {
  solanaAddress: string | null;
  evmAddress: string | null;
  solanaWalletName: string | null;
  evmWalletName: string | null;
  /** How the wallet is held: created in SIGHT (encrypted vault) or externally connected. */
  solanaSource: WalletSource | null;
  evmSource: WalletSource | null;
  /** Vault id for embedded wallets; provider id for external ones. */
  solanaWalletId: string | null;
  evmWalletId: string | null;
  setSolana: (address: string | null, name: string | null, source?: WalletSource | null, id?: string | null) => void;
  setEvm: (address: string | null, name: string | null, source?: WalletSource | null, id?: string | null) => void;
  /** Disconnect an external wallet's session. Embedded wallets are managed in /wallets. */
  disconnectSolana: () => void;
  disconnectEvm: () => void;
}

/** Connected wallet addresses (never keys). Set by wallet adapters at runtime. */
export const useWallet = create<WalletState>()((set) => ({
  solanaAddress: null,
  evmAddress: null,
  solanaWalletName: null,
  evmWalletName: null,
  solanaSource: null,
  evmSource: null,
  solanaWalletId: null,
  evmWalletId: null,
  setSolana: (address, name, source = null, id = null) =>
    set({
      solanaAddress: address,
      solanaWalletName: name,
      solanaSource: address ? source : null,
      solanaWalletId: address ? id : null,
    }),
  setEvm: (address, name, source = null, id = null) =>
    set({
      evmAddress: address,
      evmWalletName: name,
      evmSource: address ? source : null,
      evmWalletId: address ? id : null,
    }),
  disconnectSolana: () =>
    set({ solanaAddress: null, solanaWalletName: null, solanaSource: null, solanaWalletId: null }),
  disconnectEvm: () =>
    set({ evmAddress: null, evmWalletName: null, evmSource: null, evmWalletId: null }),
}));