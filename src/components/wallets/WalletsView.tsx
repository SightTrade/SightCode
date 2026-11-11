"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHAINS, type ChainId } from "@/lib/chains";
import { useTrackedWallets, useWallet } from "@/lib/store";
import { fmtCompact, fmtNum, shortAddr } from "@/lib/format";
import {
  exportSecretMaterial,
  isVaultInitialized,
  isVaultUnlocked,
  listEmbeddedWallets,
  lockVault,
  removeEmbeddedWallet,
  renameEmbeddedWallet,
  setArchivedWallet,
  unlockVault,
  type BackupMaterial,
  type EmbeddedWalletMeta,
} from "@/lib/wallet/vault";
import { useToast } from "../Toast";
import { WalletDialog, DialogShell, type WalletDialogMode } from "../wallet/WalletDialog";
import { WalletIcon } from "../wallet/WalletIcons";
import { ChainLogo } from "../ChainLogo";
import { cn } from "@/lib/format";
import { balanceKey, familyForChain, type BalanceInfo, type WalletRow } from "./shared";
import { TransferPanel } from "./TransferPanel";
import { ImportModal } from "./ImportModal";

/**
 * WALLETS — Axiom-inspired chain-aware wallet workspace (SIGHT identity).
 *
 * - Chain-logo selector drives the whole workspace: wallet list, balances,
 *   holdings, transfer sources/destinations, native symbol.
 * - EVM wallet identity is shared across EVM networks; balances/holdings are
 *   per network. Solana and EVM families never mix.
 * - Balances come from the existing /api/balances provider (Solana: full SPL
 *   scan; EVM: native + honest partial coverage). Missing data is never zero.
 * - No fabricated balances, holdings, or history anywhere.
 */

const CHAIN_ORDER: ChainId[] = ["solana", "bsc", "ethereum", "base", "robinhood"];
const BALANCE_TTL_MS = 60_000;

export function WalletsView() {
  const [chain, setChain] = useState<ChainId>("solana");
  const [embedded, setEmbedded] = useState<EmbeddedWalletMeta[]>([]);
  const [init, setInit] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [balances, setBalances] = useState<Map<string, BalanceInfo>>(new Map());
  const [refreshTick, setRefreshTick] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<WalletDialogMode>("create");
  const [renaming, setRenaming] = useState<EmbeddedWalletMeta | null>(null);
  const [removing, setRemoving] = useState<EmbeddedWalletMeta | null>(null);
  const [backingUp, setBackingUp] = useState<EmbeddedWalletMeta | null>(null);

  const chainCfg = CHAINS[chain];
  const family = familyForChain(chain);
  const solanaAddress = useWallet((s) => s.solanaAddress);
  const solanaSource = useWallet((s) => s.solanaSource);
  const solanaWalletName = useWallet((s) => s.solanaWalletName);
  const evmAddress = useWallet((s) => s.evmAddress);
  const evmSource = useWallet((s) => s.evmSource);
  const evmWalletName = useWallet((s) => s.evmWalletName);
  const tracked = useTrackedWallets((s) => s.tracked);
  const removeTracked = useTrackedWallets((s) => s.removeTracked);
  const renameTracked = useTrackedWallets((s) => s.renameTracked);
  const { toast } = useToast();

  const refresh = () => {
    setInit(isVaultInitialized());
    setUnlocked(isVaultUnlocked());
    setEmbedded(listEmbeddedWallets());
  };
  useEffect(() => {
    refresh();
  }, []);

  // Wallet entries visible under the selected chain. EVM identity is shared
  // across EVM networks; Solana entries only appear on Solana.
  const rows: WalletRow[] = useMemo(() => {
    const out: WalletRow[] = [];
    for (const w of embedded) {
      if (w.family !== family) continue;
      out.push({
        key: `embedded:${w.id}`,
        source: "embedded",
        id: w.id,
        name: w.name,
        address: w.address,
        family,
        archived: !!w.archived,
      });
    }
    if (family === "solana" && solanaAddress && solanaSource === "external") {
      out.push({ key: "external:solana", source: "external", id: "solana", name: solanaWalletName ?? "External wallet", address: solanaAddress, family, archived: false });
    }
    if (family === "evm" && evmAddress && evmSource === "external") {
      out.push({ key: "external:evm", source: "external", id: "evm", name: evmWalletName ?? "External wallet", address: evmAddress, family, archived: false });
    }
    for (const t of tracked) {
      if (t.family !== family) continue;
      out.push({ key: `tracked:${t.id}`, source: "tracked", id: t.id, name: t.name, address: t.address, family, archived: false });
    }
    return out;
  }, [embedded, family, solanaAddress, solanaSource, solanaWalletName, evmAddress, evmSource, evmWalletName, tracked]);

  // Clear an incompatible selection when the chain changes.
  useEffect(() => {
    setSelectedKey((k) => (k !== null && rows.some((r) => r.key === k) ? k : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  // Balance fetching: one request per wallet address against the existing
  // /api/balances provider, keyed per chain (cache never crosses networks),
  // with per-effect cancellation + sequence guard so stale responses can
  // never overwrite the currently selected network's data.
  const seqRef = useRef(0);
  const addressList = rows.map((r) => r.address.toLowerCase()).join(",");
  useEffect(() => {
    const seq = ++seqRef.current;
    const addrs = addressList ? addressList.split(",") : [];
    if (addrs.length === 0) return;
    setBalances((prev) => {
      const next = new Map(prev);
      for (const a of addrs) {
        const k = balanceKey(chain, a);
        const existing = next.get(k);
        // Fresh-enough cache reuse; chain key guarantees no cross-network reuse.
        if (existing && existing.status === "ok" && Date.now() - (existing.fetchedAt ?? 0) < BALANCE_TTL_MS) continue;
        next.set(k, { status: "loading", nativeHuman: null, nativeRaw: null, holdings: null, coverage: null, fetchedAt: existing?.fetchedAt ?? null, error: null });
      }
      return next;
    });
    for (const a of addrs) {
      const k = balanceKey(chain, a);
      (async () => {
        try {
          const res = await fetch(`/api/balances?chain=${chain}&address=${encodeURIComponent(a)}`, { cache: "no-store" });
          const body = await res.json();
          if (seq !== seqRef.current) return; // chain changed — discard stale
          let info: BalanceInfo;
          if (!res.ok) {
            info = { status: "error", nativeHuman: null, nativeRaw: null, holdings: null, coverage: null, fetchedAt: null, error: String(body.error ?? `HTTP ${res.status}`).slice(0, 140) };
          } else if (body.error) {
            info = { status: "error", nativeHuman: null, nativeRaw: null, holdings: null, coverage: null, fetchedAt: body.fetchedAt ?? null, error: String(body.error).slice(0, 140) };
          } else {
            const human = chain === "solana" ? (Number(body.nativeBalance) / 1e9).toString() : String(body.nativeBalance ?? "0");
            const raw = chain === "solana" ? String(body.nativeBalance ?? "0") : null;
            info = {
              status: "ok",
              nativeHuman: human,
              nativeRaw: raw,
              holdings: body.coverage === "full" ? (body.tokens?.length ?? 0) : null,
              coverage: body.coverage ?? null,
              fetchedAt: body.fetchedAt ?? Date.now(),
              error: null,
            };
          }
          setBalances((prev) => new Map(prev).set(k, info));
        } catch (e) {
          if (seq !== seqRef.current) return;
          setBalances((prev) =>
            new Map(prev).set(k, {
              status: "error",
              nativeHuman: null,
              nativeRaw: null,
              holdings: null,
              coverage: null,
              fetchedAt: null,
              error: e instanceof Error ? e.message.slice(0, 140) : "network error",
            }),
          );
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, addressList, refreshTick]);

  // Total native balance for the selected network — only from real data.
  const refreshBalances = () => setRefreshTick((t) => t + 1);

  const copyAddress = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      toast("success", "Address copied", shortAddr(addr, 8, 8));
    } catch {
      toast("error", "Copy failed", "Clipboard unavailable — select and copy manually.");
    }
  };

  const visibleRows = rows
    .filter((r) => showArchived || !r.archived)
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.address.toLowerCase().includes(q);
    });

  // Total native balance for the selected network — only from real data.
  const totalBalance = useMemo(() => {
    let sum = 0;
    let counted = 0;
    for (const r of visibleRows) {
      const b = balances.get(balanceKey(chain, r.address));
      if (b?.status === "ok" && b.nativeHuman !== null) {
        sum += Number(b.nativeHuman);
        counted += 1;
      }
    }
    return counted > 0 ? { sum, counted, missing: visibleRows.length - counted } : null;
  }, [visibleRows, balances, chain]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 sm:p-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="text-lg font-bold tracking-tight text-fg">Wallets</h1>
          <span className="chip" title={chainCfg.name}>
            <ChainLogo id={chain} className="h-3.5 w-3.5" />
            {chainCfg.name}
          </span>
          <span className="text-sm font-semibold text-fg" title="Total native balance across listed wallets on this network">
            {totalBalance ? (
              <>
                {fmtNum(totalBalance.sum)} <span className="text-xs text-muted">{chainCfg.nativeToken.symbol}</span>
                {totalBalance.missing > 0 && <span className="ml-1 text-2xs text-warn">({totalBalance.missing} unavailable)</span>}
              </>
            ) : (
              <span className="text-muted">—</span>
            )}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href="/history" className="btn-ghost focus-ring h-9 px-3 text-xs">
            History
          </Link>
          <button onClick={() => setImportOpen(true)} className="btn-ghost focus-ring h-9 px-3 text-xs">
            Import
          </button>
          <button
            onClick={() => {
              setCreateMode("create");
              setCreateOpen(true);
            }}
            className="btn-primary focus-ring h-9 px-4 text-xs"
          >
            Create Wallet
          </button>
        </div>
      </div>

      {/* Vault unlock card (embedded signing requires the vault session) */}
      {init && !unlocked && (
        <VaultUnlockCard onUnlocked={refresh} />
      )}

      {/* Chain-logo selector — drives the entire workspace */}
      <div className="panel flex flex-wrap items-center gap-1.5 px-2.5 py-2" role="tablist" aria-label="Network">
        {CHAIN_ORDER.map((c) => {
          const cfg = CHAINS[c];
          const active = c === chain;
          const unconfigured = cfg.status === "unconfigured";
          return (
            <button
              key={c}
              role="tab"
              aria-selected={active}
              title={`${cfg.name}${unconfigured ? " — unconfigured" : ""}`}
              onClick={() => setChain(c)}
              className={cn(
                "focus-ring flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-2xs font-medium transition-colors",
                active ? "border-accent/60 bg-accent/10 text-fg" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              <ChainLogo id={c} className="h-4 w-4" />
              <span className={cn(active && "text-accent")}>{cfg.shortName}</span>
              {unconfigured && <span className="text-2xs text-warn">!</span>}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={refreshBalances} className="btn-ghost focus-ring h-7 px-2.5 text-2xs" title="Re-fetch balances from the providers">
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Search wallets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Wallet"
          className="input h-8 w-52 text-xs"
        />
        <button
          onClick={() => setShowArchived((v) => !v)}
          aria-pressed={showArchived}
          className={cn("btn-ghost focus-ring h-8 px-2.5 text-2xs", showArchived && "text-accent")}
          title="Show wallets archived on this network"
        >
          Show Archived
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setImportOpen(true)} className="btn-ghost focus-ring h-8 px-3 text-2xs">
            Import
          </button>
          <button
            onClick={() => {
              setCreateMode("create");
              setCreateOpen(true);
            }}
            className="btn-primary focus-ring h-8 px-3 text-2xs"
          >
            Create Wallet
          </button>
        </div>
      </div>

      {/* Two-panel workspace: wallet table | transfer workspace */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="panel flex min-h-[420px] flex-col lg:max-h-[640px]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 border-b border-line px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-muted">
            <span>Wallet</span>
            <span className="text-right">Balance</span>
            <span className="text-right">Holdings</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {visibleRows.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-xs text-muted">
                  {rows.length === 0
                    ? `No wallets on ${chainCfg.name} yet — Import an address, connect a wallet, or Create one.`
                    : search
                      ? "No wallets match the search."
                      : "All wallets on this network are archived — enable Show Archived to see them."}
                </p>
              </div>
            )}
            {visibleRows.map((r, idx) => {
              const b = balances.get(balanceKey(chain, r.address));
              const selected = r.key === selectedKey;
              return (
                <div
                  key={r.key}
                  onClick={() => setSelectedKey(r.key)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedKey(r.key);
                  }}
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 border-b border-line/50 px-3 py-2 text-left text-xs transition-colors",
                    idx % 2 === 1 && "bg-surface/40",
                    selected ? "bg-accent/10" : "hover:bg-surface",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <WalletIcon
                      id={r.source === "embedded" ? (r.family === "solana" ? "embedded-solana" : "embedded-evm") : r.source === "external" ? "phantom" : "tracked"}
                      size={16}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("truncate font-medium", selected ? "text-accent" : r.archived ? "text-muted" : "text-fg")}>{r.name}</span>
                        {r.archived && <span className="chip">archived</span>}
                        {r.source === "external" && <span className="chip">external</span>}
                        {r.source === "tracked" && <span className="chip">read-only</span>}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-2xs text-muted">
                        {shortAddr(r.address, 6, 6)}
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Copy full address ${r.address}`}
                          title="Copy full address"
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyAddress(r.address);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              void copyAddress(r.address);
                            }
                          }}
                          className="focus-ring cursor-pointer rounded p-0.5 hover:text-fg"
                        >
                          ⧉
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="text-right">
                    {b?.status === "ok" ? (
                      <span className="tabular text-fg" title={b.coverage === "partial" ? "Native balance read via RPC — full EVM portfolio scan needs an indexer" : undefined}>
                        {fmtNum(Number(b.nativeHuman))} <span className="text-2xs text-muted">{chainCfg.nativeToken.symbol}</span>
                      </span>
                    ) : b?.status === "loading" ? (
                      <span className="text-2xs text-muted">loading…</span>
                    ) : b?.status === "error" ? (
                      <span className="text-2xs text-neg" title={b.error ?? undefined}>error</span>
                    ) : (
                      <span className="text-2xs text-muted">—</span>
                    )}
                  </span>
                  <span className="text-right">
                    {b?.status === "ok" && b.holdings !== null ? (
                      <span className="chip tabular">{b.holdings}</span>
                    ) : (
                      <span className="text-2xs text-muted" title={b?.coverage === "partial" ? "Full token scan unavailable on EVM — check specific tokens in Portfolio" : undefined}>—</span>
                    )}
                  </span>
                  <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {chainCfg.explorer && (
                      <a href={chainCfg.explorer.address(r.address)} target="_blank" rel="noopener noreferrer" title={`View on ${chainCfg.explorer.name}`} className="btn-ghost focus-ring h-6 px-1.5 text-2xs">
                        ↗
                      </a>
                    )}
                    {r.source === "embedded" && (
                      <>
                        <button onClick={() => setRenaming(embedded.find((w) => w.id === r.id) ?? null)} title="Rename" className="btn-ghost focus-ring h-6 px-1.5 text-2xs">
                          ✎
                        </button>
                        <button onClick={() => { setArchivedWallet(r.id, !r.archived); refresh(); }} title={r.archived ? "Unarchive" : "Archive"} className="btn-ghost focus-ring h-6 px-1.5 text-2xs">
                          {r.archived ? "⬆" : "🗄"}
                        </button>
                        <button onClick={() => setBackingUp(embedded.find((w) => w.id === r.id) ?? null)} title="Backup / recovery material" className="btn-ghost focus-ring h-6 px-1.5 text-2xs">
                          🔑
                        </button>
                        <button onClick={() => setRemoving(embedded.find((w) => w.id === r.id) ?? null)} title="Permanently remove" className="btn-ghost focus-ring h-6 px-1.5 text-2xs text-neg">
                          ✕
                        </button>
                      </>
                    )}
                    {r.source === "tracked" && (
                      <>
                        <button
                          onClick={() => {
                            const nw = window.prompt("New label", r.name);
                            if (nw && nw.trim()) {
                              renameTracked(r.id, nw.trim().slice(0, 40));
                              toast("success", "Renamed", nw.trim());
                            }
                          }}
                          title="Rename"
                          className="btn-ghost focus-ring h-6 px-1.5 text-2xs"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => {
                            removeTracked(r.id);
                            toast("warn", "Removed from list", `${shortAddr(r.address)} is no longer tracked.`);
                          }}
                          title="Stop tracking"
                          className="btn-ghost focus-ring h-6 px-1.5 text-2xs text-neg"
                        >
                          ✕
                        </button>
                      </>
                    )}
                    {r.source === "external" && (
                      <span className="chip text-2xs" title="Connected session — managed by the wallet provider">
                        session
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-h-[420px] lg:max-h-[640px]">
          <TransferPanel chain={chain} wallets={rows} balances={balances} onChanged={refreshBalances} />
        </div>
      </div>

      {init && unlocked && (
        <div className="flex justify-end">
          <button onClick={() => { lockVault(); refresh(); }} className="btn-ghost focus-ring h-7 px-3 text-2xs">
            Lock vault
          </button>
        </div>
      )}

      {/* Create / Connect (existing secure flows) */}
      <WalletDialog open={createOpen} mode={createMode} onClose={() => setCreateOpen(false)} />

      {/* Import (track address / connect) */}
      <ImportModal
        chain={chain}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onOpenConnect={() => {
          setCreateMode("connect");
          setConnectOpen(true);
        }}
        onImported={refresh}
        existingAddresses={new Set(rows.map((r) => r.address.toLowerCase()))}
      />
      <WalletDialog open={connectOpen} mode="connect" onClose={() => setConnectOpen(false)} />

      {renaming && (
        <RenameDialog
          wallet={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            refresh();
          }}
        />
      )}

      {backingUp && <BackupDialog wallet={backingUp} unlocked={unlocked} onClose={() => setBackingUp(null)} />}

      {removing && (
        <RemoveDialog
          wallet={removing}
          onClose={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            refresh();
            refreshBalances();
          }}
        />
      )}
    </div>
  );
}

/* --------------------------- vault unlock card --------------------------- */

function VaultUnlockCard({ onUnlocked }: { onUnlocked: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel p-3">
      <p className="text-xs font-semibold text-fg">Vault locked</p>
      <p className="mt-1 text-2xs text-muted">
        Wallet addresses and balances are always visible. Unlock the vault to rename, archive, back up, or sign
        transfers with your embedded wallets.
      </p>
      <div className="mt-2 flex max-w-sm gap-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Vault password"
          autoComplete="current-password"
          className="input text-sm"
          aria-label="Vault password"
        />
        <button
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await unlockVault(pw);
              onUnlocked();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unlock failed");
            } finally {
              setBusy(false);
              setPw("");
            }
          }}
          disabled={!pw || busy}
          className="btn-primary focus-ring px-4 text-xs"
        >
          Unlock
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-neg">{error}</p>}
    </div>
  );
}

/* ------------------------------ rename dialog ----------------------------- */

function RenameDialog({
  wallet,
  onClose,
  onDone,
}: {
  wallet: EmbeddedWalletMeta;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(wallet.name);
  const { toast } = useToast();
  return (
    <DialogShell title="Rename wallet" onClose={onClose}>
      <p className="text-2xs text-muted">Renaming only changes the local label — the address and keys never change.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="input text-sm" aria-label="Wallet name" />
      <div className="flex gap-2">
        <button onClick={onClose} className="btn-ghost focus-ring flex-1">
          Cancel
        </button>
        <button
          onClick={() => {
            if (!name.trim()) return;
            void renameEmbeddedWallet(wallet.id, name.trim());
            toast("success", "Renamed", name.trim());
            onDone();
          }}
          disabled={!name.trim()}
          className="btn-primary focus-ring flex-1"
        >
          Save
        </button>
      </div>
    </DialogShell>
  );
}

/* ------------------------------ backup dialog ----------------------------- */

function BackupDialog({
  wallet,
  unlocked,
  onClose,
}: {
  wallet: EmbeddedWalletMeta;
  unlocked: boolean;
  onClose: () => void;
}) {
  const [material, setMaterial] = useState<BackupMaterial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acked, setAcked] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    exportSecretMaterial(wallet.id)
      .then((m) => !cancelled && setMaterial(m))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Export failed"));
    return () => {
      cancelled = true;
    };
  }, [wallet.id, unlocked]);

  return (
    <DialogShell title={`Backup — ${wallet.name}`} onClose={onClose}>
      {!unlocked ? (
        <p className="text-xs text-warn">Unlock the vault to view recovery material for this wallet.</p>
      ) : error ? (
        <p className="text-xs text-neg">{error}</p>
      ) : material ? (
        <>
          <div className="rounded-md border border-warn/40 bg-warn/5 p-3">
            <p className="text-xs font-semibold text-warn">Shown only per view — store it safely</p>
            <p className="mt-1 text-2xs text-muted">{material.kind}</p>
            <div className="mt-2 break-all rounded border border-line bg-surface p-2 font-mono text-xs text-fg">{material.value}</div>
            <button
              onClick={() => navigator.clipboard?.writeText(material.value).then(() => toast("success", "Copied to clipboard"))}
              className="btn-ghost focus-ring mt-2 h-7 px-2.5 text-2xs"
            >
              Copy recovery material
            </button>
            <p className="mt-2 text-2xs text-neg">{material.warning}</p>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
            <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} className="mt-0.5" />
            <span>I understand this material controls the wallet and must be stored offline.</span>
          </label>
          <button onClick={onClose} disabled={!acked} className="btn-primary w-full">
            Done
          </button>
        </>
      ) : (
        <p className="text-xs text-muted">Decrypting…</p>
      )}
    </DialogShell>
  );
}

/* ------------------------------ remove dialog ----------------------------- */

function RemoveDialog({
  wallet,
  onClose,
  onDone,
}: {
  wallet: EmbeddedWalletMeta;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pw, setPw] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  return (
    <DialogShell title={`Remove ${wallet.name}?`} onClose={onClose}>
      <p className="text-xs text-muted">
        Removing this embedded wallet destroys the locally stored recovery material. If you have not backed it
        up, its funds become permanently inaccessible. This cannot be undone.
      </p>
      <label className="flex cursor-pointer items-start gap-2 text-xs text-muted">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        <span>I understand this permanently deletes the stored keys for {shortAddr(wallet.address)}.</span>
      </label>
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="Vault password"
        autoComplete="current-password"
        className="input text-sm"
        aria-label="Vault password"
      />
      {error && <p className="text-xs text-neg">{error}</p>}
      <button
        onClick={async () => {
          setError(null);
          try {
            await removeEmbeddedWallet(wallet.id, pw);
            toast("warn", "Wallet removed", "Locally stored recovery material was destroyed.");
            onDone();
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