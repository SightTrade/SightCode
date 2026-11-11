"use client";

import { useState } from "react";
import { CHAINS, isEvmAddress, isSolanaAddress, type ChainId } from "@/lib/chains";
import { useTrackedWallets } from "@/lib/store";
import { useToast } from "../Toast";
import { DialogShell } from "../wallet/WalletDialog";
import { ChainLogo } from "../ChainLogo";
import { cn, shortAddr } from "@/lib/format";
import { familyForChain } from "./shared";

/**
 * Import wallet modal — offers ONLY operations the existing architecture
 * supports, clearly separated:
 *  1. CONNECT — an external browser wallet signs in its own app; SIGHT only
 *     receives a public address.
 *  2. TRACK — a read-only public address; no keys ever involved.
 * Private-key / seed-phrase import is intentionally NOT offered (documented).
 */
export function ImportModal({
  chain,
  open,
  onClose,
  onOpenConnect,
  onImported,
  existingAddresses,
}: {
  chain: ChainId;
  open: boolean;
  onClose: () => void;
  onOpenConnect: () => void;
  onImported: () => void;
  existingAddresses: Set<string>;
}) {
  const chainCfg = CHAINS[chain];
  const family = familyForChain(chain);
  const [tab, setTab] = useState<"connect" | "track">("track");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const addTracked = useTrackedWallets((s) => s.addTracked);

  if (!open) return null;

  const addr = address.trim();
  const valid = addr.length > 0 && (family === "solana" ? isSolanaAddress(addr) : isEvmAddress(addr));
  const duplicate = existingAddresses.has(addr.toLowerCase());

  const track = () => {
    setError(null);
    if (!valid) {
      setError(`Not a valid ${chainCfg.name} address — expected ${family === "solana" ? "a base58 Solana address" : "a 0x EVM address"}.`);
      return;
    }
    if (duplicate) {
      setError("This address is already in your wallet list.");
      return;
    }
    const ok = addTracked({ family, address: addr, name: name.trim() || `Tracked ${shortAddr(addr, 4, 4)}` });
    if (!ok) {
      setError("This address is already tracked.");
      return;
    }
    toast("success", "Address tracked", `${shortAddr(addr)} added read-only on ${chainCfg.name}`);
    setAddress("");
    setName("");
    onImported();
    onClose();
  };

  return (
    <DialogShell title="Import wallet" onClose={onClose}>
      <div className="flex items-center gap-2">
        <ChainLogo id={chain} className="h-4 w-4" />
        <p className="text-2xs text-muted">
          Selected network: <span className="text-fg">{chainCfg.name}</span> — imported entries appear under
          this network. An EVM address works on Ethereum, Base, BNB Chain and Robinhood Chain; a Solana
          address only on Solana.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-surface p-1" role="tablist" aria-label="Import method">
        {(["track", "connect"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setError(null);
            }}
            className={cn(
              "focus-ring rounded py-1.5 text-xs font-semibold",
              tab === t ? "bg-accent/15 text-accent" : "text-muted hover:text-fg",
            )}
          >
            {t === "track" ? "TRACK ADDRESS" : "CONNECT WALLET"}
          </button>
        ))}
      </div>

      {tab === "track" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Read-only tracking of a public address: balances and holdings are fetched for display. SIGHT
            cannot sign or move funds for a tracked address — it holds no keys.
          </p>
          <div>
            <label className="mb-1 block text-2xs text-muted" htmlFor="imp-name">
              Label (optional)
            </label>
            <input
              id="imp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cold Wallet"
              className="input text-sm"
              maxLength={40}
            />
          </div>
          <div>
            <label className="mb-1 block text-2xs text-muted" htmlFor="imp-addr">
              {chainCfg.name} address
            </label>
            <input
              id="imp-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={family === "solana" ? "Base58 address" : "0x…"}
              className="input font-mono text-xs"
            />
          </div>
          {error && <p className="text-xs text-neg">{error}</p>}
          <button onClick={track} disabled={!valid || duplicate} className="btn-primary w-full">
            Track address
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Connect a browser wallet (Phantom, or an injected EVM wallet). The wallet app signs everything;
            SIGHT never sees keys and never asks for a seed phrase. The connected account appears in this
            list for the network family it supports.
          </p>
          <button
            onClick={() => {
              onImported();
              onOpenConnect();
              onClose();
            }}
            className="btn-primary w-full"
          >
            Connect {family === "solana" ? "a Solana wallet" : "an EVM wallet"}
          </button>
        </div>
      )}

      <p className="text-2xs text-muted/70">
        Private-key / seed-phrase import is intentionally not offered — generated vault wallets are the
        supported self-custody option.
      </p>
    </DialogShell>
  );
}