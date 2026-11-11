"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHAINS, TRADABLE_CHAINS } from "@/lib/chains";
import { useUi, useWallet, type WalletSource } from "@/lib/store";
import { fmtNum, shortAddr } from "@/lib/format";
import type { WalletHoldings } from "@/lib/types";
import {
  exportSecretMaterial,
  getEmbeddedWallet,
  isVaultInitialized,
  isVaultUnlocked,
  listEmbeddedWallets,
  lockVault,
  removeEmbeddedWallet,
  renameEmbeddedWallet,
  unlockVault,
  type BackupMaterial,
  type EmbeddedWalletMeta,
} from "@/lib/wallet/vault";
import { useToast } from "./Toast";
import { WalletDialog, DialogShell, type WalletDialogMode } from "./wallet/WalletDialog";
import { WalletIcon } from "./wallet/WalletIcons";

/**
 * MY WALLETS — the wallet manager.
 *
 * Distinguishes embedded SIGHT-created wallets from externally connected
 * wallets. Embedded wallet removal destroys the locally stored recovery
 * material and requires typing the vault password plus a second confirmation.
 * Disconnecting an external wallet only clears the app session.
 */
export function WalletManagerView() {
  const [init, setInit] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [embedded, setEmbedded] = useState<EmbeddedWalletMeta[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<WalletDialogMode>("create");

  const refresh = () => {
    setInit(isVaultInitialized());
    setUnlocked(isVaultUnlocked());
    setEmbedded(listEmbeddedWallets());
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-fg">My Wallets</h1>
          <p className="mt-1 text-xs text-muted">
            SIGHT-created wallets live in an encrypted browser vault. External wallets are connected sessions —
            disconnecting them never deletes the wallet or its assets.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => {
              setDialogMode("create");
              setDialogOpen(true);
            }}
            className="btn-primary focus-ring h-9 px-4 text-xs"
          >
            Create Wallet
          </button>
          <button
            onClick={() => {
              setDialogMode("connect");
              setDialogOpen(true);
            }}
            className="btn-ghost focus-ring h-9 px-4 text-xs"
          >
            Connect Wallet
          </button>
        </div>
      </div>

      {init && !unlocked && (
        <VaultUnlockCard onUnlocked={refresh} />
      )}
      {init && unlocked && (
        <div className="flex justify-end">
          <button onClick={() => { lockVault(); refresh(); }} className="btn-ghost focus-ring h-7 px-3 text-2xs">
            Lock vault
          </button>
        </div>
      )}

      <WalletFamilySection family="solana" embedded={embedded.filter((w) => w.family === "solana")} unlocked={unlocked} onChanged={refresh} />
      <WalletFamilySection family="evm" embedded={embedded.filter((w) => w.family === "evm")} unlocked={unlocked} onChanged={refresh} />

      <div className="panel p-3">
        <h2 className="text-sm font-semibold text-fg">Connected external sessions</h2>
        <ExternalSessions onChanged={refresh} />
      </div>

      <p className="text-2xs text-muted/70">
        Security: key material is generated in your browser and encrypted with PBKDF2-SHA256 → AES-GCM-256 before
        storage. It is never sent to any server. A browser profile wipe or forgotten vault password permanently removes
        embedded wallets unless you have your backup.
      </p>

      <WalletDialog open={dialogOpen} mode={dialogMode} onClose={() => { setDialogOpen(false); refresh(); }} />
    </div>
  );
}

function VaultUnlockCard({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="panel border-warn/40 p-3">
      <h2 className="text-sm font-semibold text-warn">Vault locked</h2>
      <p className="mt-1 text-xs text-muted">
        Enter your vault password to enable trading with embedded wallets and to manage backups.
      </p>
      <div className="mt-2 flex max-w-sm gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && password) {
              setBusy(true);
              unlockVault(password)
                .then(() => onUnlocked())
                .catch((err) => setError(err instanceof Error ? err.message : "Unlock failed"))
                .finally(() => setBusy(false));
            }
          }}
          placeholder="Vault password"
          className="input text-sm"
          autoComplete="current-password"
          aria-label="Vault password"
        />
        <button
          onClick={() => {
            setBusy(true);
            unlockVault(password)
              .then(() => onUnlocked())
              .catch((err) => setError(err instanceof Error ? err.message : "Unlock failed"))
              .finally(() => setBusy(false));
          }}
          disabled={busy || !password}
          className="btn-primary focus-ring h-9 px-4 text-xs"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-neg">{error}</p>}
    </div>
  );
}

interface WalletRow {
  id: string;
  name: string;
  family: "solana" | "evm";
  address: string;
  source: WalletSource;
  explorerBase: string | null;
  nativeSymbol: string | null;
  chainName: string;
}

function WalletFamilySection(props: {
  family: "solana" | "evm";
  embedded: EmbeddedWalletMeta[];
  unlocked: boolean;
  onChanged: () => void;
}) {
  const { family, embedded, unlocked, onChanged } = props;
  const solanaAddress = useWallet((s) => s.solanaAddress);
  const evmAddress = useWallet((s) => s.evmAddress);
  const solanaWalletName = useWallet((s) => s.solanaWalletName);
  const evmWalletName = useWallet((s) => s.evmWalletName);
  const solanaSource = useWallet((s) => s.solanaSource);
  const evmSource = useWallet((s) => s.evmSource);
  const chains = TRADABLE_CHAINS.filter((c) => CHAINS[c].kind === family);
  const familyCfg = CHAINS[family === "solana" ? "solana" : "ethereum"];

  const rows: WalletRow[] = [
    ...embedded.map<WalletRow>((w) => ({
      id: w.id,
      name: w.name,
      family,
      address: w.address,
      source: "embedded",
      explorerBase: null,
      nativeSymbol: family === "solana" ? "SOL" : "ETH",
      chainName: family === "solana" ? "Solana" : "EVM (multi-network)",
    })),
    ...(family === "solana" && solanaAddress && solanaSource === "external"
      ? [
          {
            id: "external-solana",
            name: solanaWalletName ?? "External Solana wallet",
            family,
            address: solanaAddress,
            source: "external" as WalletSource,
            explorerBase: CHAINS.solana.explorer?.address("") ?? null,
            nativeSymbol: "SOL",
            chainName: "Solana",
          },
        ]
      : []),
    ...(family === "evm" && evmAddress && evmSource === "external"
      ? [
          {
            id: "external-evm",
            name: evmWalletName ?? "External EVM wallet",
            family,
            address: evmAddress,
            source: "external" as WalletSource,
            explorerBase: CHAINS.ethereum.explorer?.address("") ?? null,
            nativeSymbol: "ETH",
            chainName: "EVM (wallet's active network)",
          },
        ]
      : []),
  ];

  return (
    <div className="panel p-3">
      <h2 className="text-sm font-semibold text-fg">
        {family === "solana" ? "SOLANA" : "EVM"}
        <span className="chip ml-2">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">
          No {family === "solana" ? "Solana" : "EVM"} wallets yet. Create one or connect an external wallet above.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <WalletRowItem key={r.id} row={r} chains={chains} unlocked={unlocked} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {family === "evm" && (
        <p className="mt-2 text-2xs text-muted/70">
          An embedded EVM wallet is usable on Ethereum, Base and BNB Chain — SIGHT validates the active network before
          every transaction.
        </p>
      )}
    </div>
  );
}

function WalletRowItem(props: {
  row: WalletRow;
  chains: (typeof TRADABLE_CHAINS)[number][];
  unlocked: boolean;
  onChanged: () => void;
}) {
  const { row, unlocked, onChanged } = props;
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceNote, setBalanceNote] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(row.name);
  const [backup, setBackup] = useState<BackupMaterial | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const { toast } = useToast();

  const fetchBalance = async () => {
    const chain = row.family === "solana" ? "solana" : "ethereum";
    setLoadingBalance(true);
    try {
      const res = await fetch(`/api/balances?chain=${chain}&address=${encodeURIComponent(row.address)}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as WalletHoldings & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const decimals = chain === "solana" ? 9 : 18;
      const native =
        chain === "solana"
          ? Number(BigInt(body.nativeBalance ?? "0")) / 10 ** decimals
          : Number(body.nativeBalance ?? "0");
      setBalance(fmtNum(native, 6));
      setBalanceNote(body.coverage === "full" ? null : body.note ?? "Partial coverage");
    } catch (e) {
      setBalance(null);
      setBalanceNote(`Balance unavailable: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setLoadingBalance(false);
    }
  };

  const explorerUrl =
    row.explorerBase !== null
      ? `${row.explorerBase}${row.address}`
      : row.family === "solana"
        ? `https://solscan.io/account/${row.address}`
        : null;

  const isActive =
    (row.family === "solana" ? useWallet.getState().solanaWalletId : useWallet.getState().evmWalletId) === row.id;

  return (
    <li className="rounded-md border border-line bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <WalletIcon id={row.source === "embedded" ? (row.family === "solana" ? "embedded-solana" : "embedded-evm") : row.id} />
        <div className="min-w-0 flex-1">
          {editingName && row.source === "embedded" ? (
            <div className="flex items-center gap-1.5">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="input h-7 w-40 py-0 text-xs"
                aria-label="Wallet name"
              />
              <button
                onClick={async () => {
                  await renameEmbeddedWallet(row.id, nameDraft.trim() || row.name);
                  setEditingName(false);
                  onChanged();
                }}
                className="btn-ghost h-7 px-2 text-2xs"
              >
                Save
              </button>
            </div>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
              {row.name}
              <span className={`chip ${row.source === "embedded" ? "border-accent/40 text-accent" : "text-muted"}`}>
                {row.source === "embedded" ? "SIGHT wallet" : "Connected"}
              </span>
              {isActive && <span className="chip border-pos/40 text-pos">Active</span>}
            </p>
          )}
          <p className="mt-0.5 font-mono text-2xs text-muted">{shortAddr(row.address, 10, 8)}</p>
          <p className="text-2xs text-muted/70">{row.chainName}</p>
        </div>
        <div className="text-right">
          <p className="tabular text-sm text-fg">
            {loadingBalance ? "…" : balance !== null ? `${balance} ${row.nativeSymbol ?? ""}` : "—"}
          </p>
          <button onClick={fetchBalance} className="text-2xs text-info underline hover:no-underline">
            {balance === null ? "Fetch balance" : "Refresh"}
          </button>
        </div>
        <WalletRowActions
          row={row}
          unlocked={unlocked}
          onChanged={onChanged}
          onEditName={() => {
            setNameDraft(row.name);
            setEditingName(true);
          }}
          onBackup={setBackup}
          onRemove={() => setRemoveOpen(true)}
          onCopy={() => navigator.clipboard?.writeText(row.address).then(() => toast("success", "Address copied"))}
        />
      </div>
      {balanceNote && <p className="mt-1.5 text-2xs text-warn">{balanceNote}</p>}

      {backup && (
        <DialogShell title={`Backup — ${row.name}`} onClose={() => setBackup(null)}>
          <div className="rounded-md border border-warn/40 bg-warn/5 p-3">
            <p className="text-2xs text-muted">{backup.kind}</p>
            <div className="mt-2 break-all rounded border border-line bg-surface p-2 font-mono text-xs text-fg">
              {backup.value}
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(backup.value).then(() => toast("success", "Copied"))}
              className="btn-ghost focus-ring mt-2 h-7 px-2.5 text-2xs"
            >
              Copy
            </button>
            <p className="mt-2 text-2xs text-neg">{backup.warning}</p>
          </div>
        </DialogShell>
      )}

      {removeOpen && (
        <RemoveDialog
          row={row}
          onChanged={onChanged}
          onClose={() => setRemoveOpen(false)}
        />
      )}
    </li>
  );
}

function WalletRowActions(props: {
  row: WalletRow;
  unlocked: boolean;
  onChanged: () => void;
  onEditName: () => void;
  onBackup: (b: BackupMaterial) => void;
  onRemove: () => void;
  onCopy: () => void;
}) {
  const { row, unlocked, onChanged, onEditName, onBackup, onRemove, onCopy } = props;
  const { toast } = useToast();
  const setSolana = useWallet((s) => s.setSolana);
  const setEvm = useWallet((s) => s.setEvm);
  const disconnectSolana = useWallet((s) => s.disconnectSolana);
  const disconnectEvm = useWallet((s) => s.disconnectEvm);
  const explorerUrl =
    row.family === "solana"
      ? `https://solscan.io/account/${row.address}`
      : row.explorerBase
        ? `${row.explorerBase}${row.address}`
        : null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <button onClick={onCopy} className="btn-ghost h-7 px-2 text-2xs">
        Copy
      </button>
      {explorerUrl && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost h-7 px-2 text-2xs">
          Explorer ↗
        </a>
      )}
      <button
        onClick={() => {
          if (row.family === "solana") setSolana(row.address, row.name, row.source, row.id);
          else setEvm(row.address, row.name, row.source, row.id);
          toast("success", "Active wallet", `${row.name} (${row.family})`);
        }}
        className="btn-ghost h-7 px-2 text-2xs"
      >
        Set active
      </button>
      {row.source === "embedded" ? (
        <>
          <button
            onClick={async () => {
              if (!unlocked) {
                toast("warn", "Vault is locked", "Unlock the vault to export recovery material.");
                return;
              }
              const material = await exportSecretMaterial(row.id);
              if (material) onBackup(material);
            }}
            disabled={!unlocked}
            className="btn-ghost h-7 px-2 text-2xs"
            title={unlocked ? "Show recovery material" : "Unlock the vault first"}
          >
            Backup
          </button>
          <button onClick={onEditName} className="btn-ghost h-7 px-2 text-2xs">
            Rename
          </button>
          <button onClick={onRemove} className="btn-ghost h-7 px-2 text-2xs text-neg">
            Remove
          </button>
        </>
      ) : (
        <button
          onClick={() => {
            if (row.family === "solana") disconnectSolana();
            else disconnectEvm();
            toast("info", "Session disconnected", "The wallet itself and its assets are untouched.");
            onChanged();
          }}
          className="btn-ghost h-7 px-2 text-2xs text-neg"
        >
          Disconnect
        </button>
      )}
    </div>
  );
}
function RemoveDialog(props: { row: WalletRow; onChanged: () => void; onClose: () => void }) {
  const { row, onChanged, onClose } = props;
  const [pw, setPw] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  return (
    <DialogShell title={`Remove ${row.name}?`} onClose={onClose}>
      <p className="text-xs text-muted">
        Removing this embedded wallet destroys the locally stored recovery material. If you have not backed it up, its
        funds become permanently inaccessible. This action cannot be undone.
      </p>
      <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        <span>I understand this permanently deletes the stored keys for {shortAddr(row.address)}.</span>
      </label>
      <div>
        <label className="mb-1 block text-2xs text-muted" htmlFor="rm-pw">Vault password</label>
        <input
          id="rm-pw"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="input text-sm"
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-xs text-neg">{error}</p>}
      <button
        onClick={async () => {
          setError(null);
          try {
            await removeEmbeddedWallet(row.id, pw);
            toast("warn", "Wallet removed", "Locally stored recovery material was destroyed.");
            onClose();
            onChanged();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Removal failed");
          }
        }}
        disabled={!confirmed || !pw}
        className="btn-primary w-full bg-neg text-[#1a040a] hover:bg-neg/90"
      >
        Permanently remove wallet
      </button>
    </DialogShell>
  );
}

function ExternalSessions({ onChanged }: { onChanged: () => void }) {
  const solanaAddress = useWallet((s) => s.solanaAddress);
  const solanaWalletName = useWallet((s) => s.solanaWalletName);
  const solanaSource = useWallet((s) => s.solanaSource);
  const evmAddress = useWallet((s) => s.evmAddress);
  const evmWalletName = useWallet((s) => s.evmWalletName);
  const evmSource = useWallet((s) => s.evmSource);
  const disconnectSolana = useWallet((s) => s.disconnectSolana);
  const disconnectEvm = useWallet((s) => s.disconnectEvm);
  const sessions: { family: string; name: string | null; address: string }[] = [];
  if (solanaAddress && solanaSource === "external")
    sessions.push({ family: "Solana", name: solanaWalletName, address: solanaAddress });
  if (evmAddress && evmSource === "external")
    sessions.push({ family: "EVM", name: evmWalletName, address: evmAddress });
  return (
    <div className="mt-2 space-y-1.5">
      {sessions.length === 0 ? (
        <p className="py-2 text-xs text-muted">No external wallets are currently connected to this session.</p>
      ) : (
        sessions.map((s) => (
          <div
            key={s.family}
            className="flex items-center justify-between gap-2 rounded border border-line/60 bg-surface px-2.5 py-1.5 text-xs"
          >
            <span className="text-fg">
              <span className="chip mr-2">{s.family}</span>
              {s.name} · <span className="font-mono">{shortAddr(s.address)}</span>
            </span>
            <button
              onClick={() => {
                if (s.family === "Solana") disconnectSolana();
                else disconnectEvm();
                onChanged();
              }}
              className="btn-ghost h-6 px-2 text-2xs text-neg"
            >
              Disconnect session
            </button>
          </div>
        ))
      )}
    </div>
  );
}