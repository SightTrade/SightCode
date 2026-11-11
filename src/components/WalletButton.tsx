"use client";

import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/chains";
import { useUi, useWallet } from "@/lib/store";
import { shortAddr } from "@/lib/format";
import { listEmbeddedWallets, isVaultUnlocked } from "@/lib/wallet/vault";
import { detectSolanaWallets } from "@/lib/wallet/detect";
import { WalletDialog, type WalletDialogMode } from "./wallet/WalletDialog";
import { WalletIcon } from "./wallet/WalletIcons";

/**
 * Top-bar wallet control. Opens the explicit Connect / Create flows.
 * Keys are never requested or stored here — only public addresses.
 */

export function WalletButton() {
  const chain = useUi((s) => s.activeChain);
  const { solanaAddress, evmAddress, solanaWalletName, evmWalletName, solanaSource, evmSource, disconnectSolana, disconnectEvm, setSolana, setEvm } = useWallet();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WalletDialogMode>("connect");

  const chainCfg = CHAINS[chain];
  const isSol = chainCfg.kind === "solana";
  const connected = isSol ? solanaAddress : evmAddress;
  const walletName = isSol ? solanaWalletName : evmWalletName;
  const source = isSol ? solanaSource : evmSource;

  // Restore an existing trusted Solana session on first render.
  useEffect(() => {
    if (!isSol || solanaAddress) return;
    const p = detectSolanaWallets().find((w) => w.installed && w.provider?.isPhantom);
    if (!p?.provider) return;
    p.provider
      .connect({ onlyIfTrusted: true })
      .then((r) => setSolana(r.publicKey.toString(), p.name, "external", p.id))
      .catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select an unlocked embedded wallet when nothing else is connected.
  useEffect(() => {
    if (connected) return;
    if (isVaultUnlocked()) {
      const meta = listEmbeddedWallets().find((w) => w.family === (isSol ? "solana" : "evm"));
      if (meta) {
        if (isSol) setSolana(meta.address, meta.name, "embedded", meta.id);
        else setEvm(meta.address, meta.name, "embedded", meta.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, isSol]);

  const disconnect = () => {
    if (isSol) disconnectSolana();
    else disconnectEvm();
  };

  if (chainCfg.status === "unconfigured") {
    return (
      <span className="chip" title={chainCfg.capabilityNote}>
        {chainCfg.shortName}: awaiting config
      </span>
    );
  }

  if (connected) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            setMode("connect");
            setOpen(true);
          }}
          className="btn-ghost focus-ring h-9 gap-2 px-2.5 font-mono text-xs"
          title={`${walletName ?? "Wallet"} · ${connected} — click to manage wallets`}
        >
          <span className={`h-2 w-2 rounded-full ${source === "embedded" ? "bg-accent" : "bg-pos"}`} />
          {shortAddr(connected)}
        </button>
        <button onClick={disconnect} className="btn-ghost focus-ring h-9 px-2 text-xs text-muted" aria-label="Disconnect wallet">
          ✕
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            setMode("connect");
            setOpen(true);
          }}
          className="btn-primary focus-ring h-9 px-3 text-xs"
        >
          Connect Wallet
        </button>
        <button
          onClick={() => {
            setMode("create");
            setOpen(true);
          }}
          className="btn-ghost focus-ring h-9 px-3 text-xs"
          title="Create a new self-custody wallet in your browser"
        >
          <WalletIcon id={isSol ? "embedded-solana" : "embedded-evm"} size={16} />
          Create
        </button>
      </div>
      <WalletDialog open={open} mode={mode} onClose={() => setOpen(false)} />
    </>
  );
}