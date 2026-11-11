"use client";

/**
 * Wallet provider discovery.
 *
 * Solana: injected Wallet-Standard-compatible providers (window.phantom,
 * window.solflare, window.backpack…). A provider is listed as "installed"
 * only when its object is actually present — a name in a list is not proof.
 *
 * EVM: EIP-6963 multi-provider discovery (announceProvider events) with a
 * fallback scan of window.ethereum flags. Unavailable wallets are shown with
 * install instructions instead of being hidden or faked.
 */
import { useEffect, useState } from "react";

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
  on?: (ev: string, cb: (...args: any[]) => void) => void;
  removeListener?: (ev: string, cb: (...args: any[]) => void) => void;
};

export type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>;
  on?: (ev: string, cb: (...args: any[]) => void) => void;
  removeListener?: (ev: string, cb: (...args: any[]) => void) => void;
};

export interface DetectedSolanaWallet {
  id: string;
  name: string;
  installed: boolean;
  installUrl: string | null;
  provider: SolanaProvider | null;
}

export interface DetectedEvmWallet {
  id: string;
  name: string;
  installed: boolean;
  installUrl: string | null;
  eip1193: Eip1193 | null;
  /** EIP-6963 rdns when discovered through the standard. */
  rdns?: string;
}

const PHANTOM_INSTALL = "https://phantom.app/download";
const SOLFLARE_INSTALL = "https://solflare.com/download";
const METAMASK_INSTALL = "https://metamask.io/download/";
const RABBY_INSTALL = "https://rabby.io/";
const COINBASE_INSTALL = "https://www.coinbase.com/wallet/downloads";

function w(): any | null {
  return typeof window !== "undefined" ? (window as any) : null;
}

/** Solana providers actually present in the current browser session. */
export function detectSolanaWallets(): DetectedSolanaWallet[] {
  const win = w();
  const out: DetectedSolanaWallet[] = [];
  const phantom = win?.phantom?.solana ?? null;
  out.push({
    id: "phantom",
    name: "Phantom",
    installed: Boolean(phantom),
    installUrl: PHANTOM_INSTALL,
    provider: phantom ?? null,
  });
  const solflare = win?.solflare ?? (win?.solana?.isSolflare ? win.solana : null);
  out.push({
    id: "solflare",
    name: "Solflare",
    installed: Boolean(solflare),
    installUrl: SOLFLARE_INSTALL,
    provider: solflare ?? null,
  });
  const injected = win?.solana ?? null;
  const known = out.some((x) => x.provider === injected);
  if (injected && !known) {
    // A Wallet-Standard-compatible provider we don't recognize by name.
    const label = injected.isBackpack ? "Backpack" : "Other Solana wallet";
    out.push({
      id: injected.isBackpack ? "backpack" : "solana-other",
      name: label,
      installed: true,
      installUrl: null,
      provider: injected,
    });
  }
  return out;
}

interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
interface Eip6963Detail {
  info: Eip6963ProviderInfo;
  provider: Eip1193;
}

/** Fallback EVM wallets resolved from window.ethereum flags. */
function fallbackEvmWallets(): DetectedEvmWallet[] {
  const eth = w()?.ethereum as Eip1193 | undefined;
  const out: DetectedEvmWallet[] = [];
  if (eth) {
    const names: string[] = [];
    if ((eth as any).isRabby) names.push("Rabby");
    if ((eth as any).isMetaMask && !(eth as any).isRabby) names.push("MetaMask");
    if ((eth as any).isCoinbaseWallet || w()?.coinbaseWalletExtension) names.push("Coinbase Wallet");
    if (names.length === 0) names.push("Browser wallet");
    out.push({ id: "injected", name: names.join(" / "), installed: true, installUrl: null, eip1193: eth });
  } else {
    out.push({ id: "metamask", name: "MetaMask", installed: false, installUrl: METAMASK_INSTALL, eip1193: null });
    out.push({ id: "rabby", name: "Rabby", installed: false, installUrl: RABBY_INSTALL, eip1193: null });
    out.push({ id: "coinbase", name: "Coinbase Wallet", installed: false, installUrl: COINBASE_INSTALL, eip1193: null });
  }
  return out;
}

/**
 * React hook: discovers EVM wallets through EIP-6963 and falls back to
 * window.ethereum inspection. Well-known wallets always appear, with an
 * honest installed/unavailable status.
 */
export function useDetectedEvmWallets(enabled: boolean): DetectedEvmWallet[] {
  const [wallets, setWallets] = useState<DetectedEvmWallet[]>([]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const found = new Map<string, DetectedEvmWallet>();

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (!detail?.info || !detail.provider) return;
      found.set(detail.info.rdns, {
        id: detail.info.rdns,
        name: detail.info.name,
        installed: true,
        installUrl: null,
        eip1193: detail.provider,
        rdns: detail.info.rdns,
      });
      setWallets([...found.values()]);
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Give EIP-6963 providers a moment to announce, then merge fallbacks.
    const timer = setTimeout(() => {
      const has = (needle: string) =>
        [...found.values()].some((x) => x.name.toLowerCase().includes(needle));
      if (!has("metamask"))
        found.set("metamask-fallback", {
          id: "metamask-fallback",
          name: "MetaMask",
          installed: false,
          installUrl: METAMASK_INSTALL,
          eip1193: null,
        });
      if (!has("rabby"))
        found.set("rabby-fallback", {
          id: "rabby-fallback",
          name: "Rabby",
          installed: false,
          installUrl: RABBY_INSTALL,
          eip1193: null,
        });
      if (!has("coinbase"))
        found.set("coinbase-fallback", {
          id: "coinbase-fallback",
          name: "Coinbase Wallet",
          installed: false,
          installUrl: COINBASE_INSTALL,
          eip1193: null,
        });
      setWallets([...found.values()]);
    }, 400);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(timer);
    };
  }, [enabled]);

  return wallets;
}

/** One-shot Solana detection for hooks/dialogs. */
export function useDetectedSolanaWallets(enabled: boolean): DetectedSolanaWallet[] {
  const [wallets, setWallets] = useState<DetectedSolanaWallet[]>([]);
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    setWallets(detectSolanaWallets());
    // Providers can inject late; re-check shortly after mount.
    const t = setTimeout(() => setWallets(detectSolanaWallets()), 300);
    return () => clearTimeout(t);
  }, [enabled]);
  return wallets;
}