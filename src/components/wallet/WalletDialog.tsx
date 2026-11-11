"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CHAINS } from "@/lib/chains";
import { useUi, useWallet } from "@/lib/store";
import {
  createEmbeddedWallet,
  isVaultInitialized,
  type BackupMaterial,
  type EmbeddedWalletMeta,
  type WalletFamily,
} from "@/lib/wallet/vault";
import {
  useDetectedEvmWallets,
  useDetectedSolanaWallets,
  type DetectedEvmWallet,
  type DetectedSolanaWallet,
} from "@/lib/wallet/detect";
import { shortAddr } from "@/lib/format";
import { useToast } from "../Toast";
import { WalletIcon } from "./WalletIcons";

/**
 * Wallet dialog: CREATE WALLET and CONNECT WALLET flows.
 *
 * Security invariants implemented here:
 * - The user explicitly chooses a provider — nothing auto-connects.
 * - External connections never request seed phrases.
 * - Embedded creation shows recovery material exactly once and requires an
 *   explicit confirmation before the wallet is persisted and usable.
 * - Keys are generated client-side and never leave the browser.
 */
export type WalletDialogMode = "connect" | "create";

interface WalletDialogProps {
  open: boolean;
  mode: WalletDialogMode;
  onClose: () => void;
}

export function WalletDialog({ open, mode, onClose }: WalletDialogProps) {
  if (!open) return null;
  return mode === "create" ? (
    <CreateFlow onClose={onClose} />
  ) : (
    <ConnectFlow open={open} onClose={onClose} />
  );
}

/* ------------------------------ CONNECT ------------------------------ */

function ConnectFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeChain = useUi((s) => s.activeChain);
  const chainCfg = CHAINS[activeChain];
  const family: WalletFamily = chainCfg.kind === "solana" ? "solana" : "evm";
  const [viewFamily, setViewFamily] = useState<WalletFamily>(family);
  const [connecting, setConnecting] = useState<string | null>(null);
  const { toast } = useToast();
  const setSolana = useWallet((s) => s.setSolana);
  const setEvm = useWallet((s) => s.setEvm);

  const solanaWallets = useDetectedSolanaWallets(open && viewFamily === "solana");
  const evmWallets = useDetectedEvmWallets(open && viewFamily === "evm");

  useEffect(() => {
    setViewFamily(family);
  }, [family, open]);

  const connectSolana = async (w: DetectedSolanaWallet) => {
    if (!w.provider) return;
    setConnecting(w.id);
    try {
      const res = await w.provider.connect();
      setSolana(res.publicKey.toString(), w.name, "external", w.id);
      toast("success", `${w.name} connected`, `Solana wallet ${shortAddr(res.publicKey.toString())}`);
      onClose();
    } catch (e) {
      toast("error", `${w.name} connection rejected`, e instanceof Error ? e.message.slice(0, 140) : undefined);
    } finally {
      setConnecting(null);
    }
  };

  const connectEvm = async (w: DetectedEvmWallet) => {
    if (!w.eip1193) return;
    setConnecting(w.id);
    try {
      const accounts = (await w.eip1193.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.length) throw new Error("No accounts returned");
      setEvm(accounts[0], w.name, "external", w.id);
      toast("success", `${w.name} connected`, `EVM address ${shortAddr(accounts[0])} — verify the network before trading`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/4100|rejected|denied/i.test(msg)) toast("warn", `${w.name} connection rejected in wallet`);
      else toast("error", `${w.name} connection failed`, msg.slice(0, 140));
    } finally {
      setConnecting(null);
    }
  };

  const wallets = viewFamily === "solana" ? solanaWallets : evmWallets;

  return (
    <DialogShell title="Connect Wallet" onClose={onClose}>
      <p className="text-xs text-muted">
        Active network: <span className="font-medium text-fg">{chainCfg.name}</span> — wallets are filtered by chain
        family. SIGHT never asks for a seed phrase to connect an existing wallet.
      </p>
      {chainCfg.status === "unconfigured" && (
        <div className="rounded-md border border-warn/40 bg-warn/5 p-2.5 text-xs text-warn">
          NETWORK NOT CONFIGURED — {chainCfg.name} has no verified network configuration yet.
        </div>
      )}

      <FamilyTabs value={viewFamily} onChange={setViewFamily} />

      <div className="space-y-1.5">
        {wallets.map((wl) => {
          const installed =
            wl.installed &&
            (viewFamily === "evm"
              ? (wl as DetectedEvmWallet).eip1193 != null
              : (wl as DetectedSolanaWallet).provider != null);
          return (
            <div key={wl.id} className="flex items-center gap-3 rounded-md border border-line bg-surface p-2.5">
              <WalletIcon id={wl.id} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{wl.name}</p>
                <p className={`text-2xs ${installed ? "text-pos" : "text-muted"}`}>
                  {installed ? "Detected" : "Not installed"}
                </p>
              </div>
              {installed ? (
                <button
                  onClick={() =>
                    viewFamily === "solana"
                      ? connectSolana(wl as DetectedSolanaWallet)
                      : connectEvm(wl as DetectedEvmWallet)
                  }
                  disabled={connecting !== null}
                  className="btn-primary focus-ring h-8 px-3 text-xs"
                >
                  {connecting === wl.id ? "Connecting…" : "Connect"}
                </button>
              ) : (
                wl.installUrl && (
                  <a href={wl.installUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost h-8 px-3 text-xs">
                    Install ↗
                  </a>
                )
              )}
            </div>
          );
        })}
        {wallets.length === 0 && <p className="py-4 text-center text-xs text-muted">Detecting wallets…</p>}
      </div>
      <p className="text-2xs text-muted/70">
        Connecting an external wallet only shares its public address. Private keys stay inside the wallet app.
      </p>
    </DialogShell>
  );
}

function FamilyTabs({ value, onChange }: { value: WalletFamily; onChange: (f: WalletFamily) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-surface p-1" role="tablist" aria-label="Wallet family">
      {(["solana", "evm"] as WalletFamily[]).map((f) => (
        <button
          key={f}
          role="tab"
          aria-selected={value === f}
          onClick={() => onChange(f)}
          className={`focus-ring rounded py-1.5 text-xs font-semibold transition-colors ${
            value === f ? "bg-accent/15 text-accent" : "text-muted hover:text-fg"
          }`}
        >
          {f === "solana" ? "SOLANA WALLETS" : "EVM WALLETS"}
        </button>
      ))}
    </div>
  );
}

/**
 * Shared modal shell for all wallet dialogs (connect / create / backup / remove).
 *
 * Renders through a React portal onto document.body: dialogs are often
 * triggered from inside the sticky top bar, whose `backdrop-blur` creates a
 * CSS containing block that would otherwise re-anchor any `fixed` overlay to
 * the header instead of the viewport (the classic "modal clipped at top" bug).
 *
 * Also locks background scroll while open, closes on Escape, and sizes the
 * panel to the dynamic viewport (dvh + safe-area insets) so it fits on mobile.
 */
export function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock background page scrolling while the dialog is open.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const prevRootOverflow = root.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const scrollbar = window.innerWidth - root.clientWidth;
    const prevBodyPad = body.style.paddingRight;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      root.style.overflow = prevRootOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPad;
    };
  }, []);

  // Escape closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    // Viewport-level overlay: always relative to the browser viewport.
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="animate-slide-up max-h-[calc(100dvh-32px)] w-full max-w-[520px] overflow-y-auto rounded-xl border border-line bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          <button onClick={onClose} className="focus-ring rounded p-1 text-muted hover:text-fg" aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------ CREATE ------------------------------ */

type CreateStep = "family" | "password" | "backup" | "done";

function CreateFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<CreateStep>("family");
  const [family, setFamily] = useState<WalletFamily>("solana");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<BackupMaterial | null>(null);
  const [created, setCreated] = useState<EmbeddedWalletMeta | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const { toast } = useToast();
  const setSolana = useWallet((s) => s.setSolana);
  const setEvm = useWallet((s) => s.setEvm);

  const pwValid = password.length >= 8 && password === confirmPassword;
  const vaultInit = typeof window !== "undefined" && isVaultInitialized();

  const generate = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await createEmbeddedWallet({ family, name, password });
      setBackup(res.backup);
      setCreated(res.meta);
      setStep("backup");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Key generation failed");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (!created) return;
    if (created.family === "solana") setSolana(created.address, created.name, "embedded", created.id);
    else setEvm(created.address, created.name, "embedded", created.id);
    toast("success", "Wallet created", `${created.name} · ${shortAddr(created.address)} — unfunded until you send assets`);
    setStep("done");
  };

  return (
    <DialogShell title="Create Wallet" onClose={onClose}>
      {step === "family" && (
        <>
          <p className="text-xs text-muted">
            A self-custody wallet is generated in your browser. Keys are encrypted with your password and never leave
            this device. SIGHT cannot recover a lost wallet.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["solana", "evm"] as WalletFamily[]).map((f) => (
              <button
                key={f}
                onClick={() => setFamily(f)}
                className={`focus-ring rounded-md border p-3 text-left transition-colors ${
                  family === f ? "border-accent/60 bg-accent/10" : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                <p className="text-sm font-semibold text-fg">{f === "solana" ? "Solana" : "EVM"}</p>
                <p className="mt-1 text-2xs text-muted">
                  {f === "solana"
                    ? "Ed25519 keypair · Solana networks"
                    : "secp256k1 keypair · Ethereum, Base, BNB Chain"}
                </p>
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-2xs text-muted" htmlFor="wallet-name">Wallet name (optional)</label>
            <input id="wallet-name" value={name} onChange={(e) => setName(e.target.value)} className="input text-sm" placeholder={family === "solana" ? "Solana Wallet" : "EVM Wallet"} />
          </div>
          <button onClick={() => setStep("password")} className="btn-primary w-full">Continue</button>
        </>
      )}

      {step === "password" && (
        <>
          <p className="text-xs text-muted">
            {vaultInit
              ? "Your vault already exists — enter its password to add this wallet."
              : "Choose a strong password. It encrypts the wallet keys stored in this browser. There is no reset: if you forget it, embedded wallets can only be recovered with the backup you will see next."}
          </p>
          <div>
            <label className="mb-1 block text-2xs text-muted" htmlFor="vault-pw">Vault password</label>
            <input id="vault-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input text-sm" autoComplete="new-password" />
          </div>
          <div>
            <label className="mb-1 block text-2xs text-muted" htmlFor="vault-pw2">Confirm password</label>
            <input id="vault-pw2" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input text-sm" autoComplete="new-password" />
          </div>
          {password.length > 0 && password.length < 8 && <p className="text-2xs text-warn">Use at least 8 characters.</p>}
          {password.length >= 8 && confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="text-2xs text-neg">Passwords do not match.</p>
          )}
          {error && <p className="text-xs text-neg">{error}</p>}
          <button onClick={generate} disabled={!pwValid || busy} className="btn-primary w-full">
            {busy ? "Generating keypair…" : "Generate wallet"}
          </button>
          <p className="text-2xs text-muted/70">
            Keys are generated locally with your browser&apos;s cryptographic RNG and encrypted (PBKDF2-SHA256 → AES-GCM-256)
            before storage. No key material is ever sent to any server.
          </p>
        </>
      )}

      {step === "backup" && backup && created && (
        <BackupStep backup={backup} created={created} acknowledged={acknowledged} onAck={setAcknowledged} onFinish={finish} />
      )}

      {step === "done" && created && <DoneStep created={created} onClose={onClose} />}
    </DialogShell>
  );
}

function BackupStep(props: {
  backup: BackupMaterial;
  created: EmbeddedWalletMeta;
  acknowledged: boolean;
  onAck: (v: boolean) => void;
  onFinish: () => void;
}) {
  const { toast } = useToast();
  return (
    <>
      <div className="rounded-md border border-warn/40 bg-warn/5 p-3">
        <p className="text-xs font-semibold text-warn">Back up your wallet NOW — shown only once</p>
        <p className="mt-1 text-2xs text-muted">{props.backup.kind}</p>
        <div className="mt-2 break-all rounded border border-line bg-surface p-2 font-mono text-xs text-fg">
          {props.backup.value}
        </div>
        <button
          onClick={() =>
            navigator.clipboard?.writeText(props.backup.value).then(() => toast("success", "Copied to clipboard"))
          }
          className="btn-ghost focus-ring mt-2 h-7 px-2.5 text-2xs"
        >
          Copy recovery material
        </button>
        <p className="mt-2 text-2xs text-neg">{props.backup.warning}</p>
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
        <input type="checkbox" checked={props.acknowledged} onChange={(e) => props.onAck(e.target.checked)} className="mt-0.5" />
        <span>
          I have saved this recovery material in a safe place. I understand that losing it may permanently prevent
          recovery of this wallet ({shortAddr(props.created.address)}) and its funds.
        </span>
      </label>
      <button onClick={props.onFinish} disabled={!props.acknowledged} className="btn-primary w-full">
        I&apos;ve backed it up — finish setup
      </button>
      <p className="text-2xs text-muted/70">
        Nothing was funded, signed, or transmitted during creation. The wallet stays unused until you send assets to it.
      </p>
    </>
  );
}

function DoneStep({ created, onClose }: { created: EmbeddedWalletMeta; onClose: () => void }) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm font-semibold text-pos">✓ {created.name} is ready</p>
      <p className="font-mono text-xs text-muted">{created.address}</p>
      <p className="text-2xs text-muted">
        Set as your active {created.family === "solana" ? "Solana" : "EVM"} trading wallet. Manage all wallets under My
        Wallets.
      </p>
      <button onClick={onClose} className="btn-primary w-full">Done</button>
    </div>
  );
}