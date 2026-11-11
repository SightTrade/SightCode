"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { mainnet, base, bsc, type Chain } from "viem/chains";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { CHAINS, isEvmAddress, isSolanaAddress, type ChainId } from "@/lib/chains";
import { getEvmAccount, signSolanaTransaction } from "@/lib/wallet/vault";
import { evmBrowserRpc } from "@/lib/rpcBrowser";
import { useToast } from "../Toast";
import { DialogShell } from "../wallet/WalletDialog";
import { ChainLogo } from "../ChainLogo";
import { cn, shortAddr } from "@/lib/format";
import { balanceKey, type BalanceInfo, type WalletRow } from "./shared";

/**
 * Chain-aware native-token transfer workspace (source/destination layout).
 *
 * Scope honesty:
 * - Only embedded (vault) wallets sign here — external wallets sign inside
 *   their own app; tracked wallets are read-only by definition.
 * - Same-chain native transfers only. No bridge/cross-chain protocol is
 *   integrated, so none is offered.
 * - Robinhood Chain has no verified RPC/chain config → transfers disabled.
 */

const VIEM_CHAINS: Record<string, Chain> = { ethereum: mainnet, base, bsc };
/** Base Solana network fee per signature (documented network constant). */
const SOL_BASE_FEE_LAMPORTS = 5_000n;

export function TransferPanel({
  chain,
  wallets,
  balances,
  onChanged,
}: {
  chain: ChainId;
  wallets: WalletRow[];
  balances: Map<string, BalanceInfo>;
  onChanged: () => void;
}) {
  const chainCfg = CHAINS[chain];
  const isSolana = chainCfg.kind === "solana";
  const viemChain = VIEM_CHAINS[chain];
  const signable = wallets.filter((w) => w.source === "embedded");
  const { toast } = useToast();

  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [destMode, setDestMode] = useState<"wallet" | "address">("wallet");
  const [destKey, setDestKey] = useState<string | null>(null);
  const [destAddress, setDestAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState<string | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ hash: string; explorer: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = wallets.find((w) => w.key === sourceKey) ?? null;
  const destAddr = destMode === "address" ? destAddress.trim() : (wallets.find((w) => w.key === destKey)?.address ?? "");
  const srcBal = source ? balances.get(balanceKey(chain, source.address)) ?? null : null;
  const balHuman = srcBal?.status === "ok" ? srcBal.nativeHuman : null;

  // Address validation against the selected network's format.
  const destValid = destAddr.length > 0 && (isSolana ? isSolanaAddress(destAddr) : isEvmAddress(destAddr));
  const destIsSource = source !== null && destAddr === source.address;
  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const feeNum = fee ? Number(fee) : null;
  const balanceOk =
    balHuman !== null && feeNum !== null ? amountNum + feeNum <= Number(balHuman) + 1e-12 : false;

  // Transfer availability per network — never fake support.
  const transfersSupported = isSolana || viemChain != null;
  const unsupportedNote = isSolana
    ? null
    : viemChain == null
      ? `${chainCfg.name} has no verified RPC/chain configuration yet — transfers are disabled.`
      : null;

  // Estimated network fee for a plain native transfer (RPC-based, honest).
  useEffect(() => {
    setFee(null);
    setError(null);
    setResult(null);
    if (!source || !transfersSupported) return;
    let cancelled = false;
    setFeeLoading(true);
    (async () => {
      try {
        if (isSolana) {
          const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || CHAINS.solana.defaultRpc;
          const conn = new Connection(rpc, "confirmed");
          await conn.getLatestBlockhash(); // RPC reachability + recency check
          if (!cancelled) setFee(formatEther(SOL_BASE_FEE_LAMPORTS));
        } else if (viemChain) {
          const rpc = evmBrowserRpc(chain);
          const client = createPublicClient({ chain: viemChain, transport: http(rpc) });
          const [gas, gasPrice] = await Promise.all([
            client.estimateGas({ to: (destAddr || source.address) as `0x${string}`, value: parseEther("0.0001") }),
            client.getGasPrice(),
          ]);
          if (!cancelled) setFee(formatEther(gas * gasPrice));
        }
      } catch (e) {
        if (!cancelled) setError(`Fee estimation failed: ${e instanceof Error ? e.message.slice(0, 120) : "RPC error"}`);
      } finally {
        if (!cancelled) setFeeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.key, chain, destAddr]);

  // MAX = balance − fee, computed in raw units (precision-safe).
  const maxAmount = useMemo(() => {
    if (!balHuman || !fee) return null;
    try {
      if (isSolana) {
        const lamports = BigInt(srcBal?.nativeRaw ?? "0") - SOL_BASE_FEE_LAMPORTS;
        return lamports > 0n ? (Number(lamports) / LAMPORTS_PER_SOL).toString() : "0";
      }
      const wei = parseEther(balHuman);
      const max = wei - parseEther(fee);
      return max > 0n ? formatEther(max) : "0";
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balHuman, fee, srcBal?.nativeRaw]);

  const canStart =
    transfersSupported && source !== null && destValid && !destIsSource && amountValid && balanceOk && fee !== null;

  const execute = async () => {
    if (!source || !destAddr || !amountValid) return;
    setBusy(true);
    setError(null);
    try {
      if (isSolana) {
        const lamports = BigInt(Math.round(amountNum * LAMPORTS_PER_SOL));
        const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || CHAINS.solana.defaultRpc;
        const conn = new Connection(rpc, "confirmed");
        const { blockhash } = await conn.getLatestBlockhash();
        const msg = new TransactionMessage({
          payerKey: new PublicKey(source.address),
          recentBlockhash: blockhash,
          instructions: [
            SystemProgram.transfer({
              fromPubkey: new PublicKey(source.address),
              toPubkey: new PublicKey(destAddr),
              lamports,
            }),
          ],
        }).compileToV0Message();
        const tx = new VersionedTransaction(msg);
        signSolanaTransaction(source.id, tx); // throws if the vault is locked
        const sig = await conn.sendTransaction(tx);
        setResult({ hash: sig, explorer: chainCfg.explorer ? chainCfg.explorer.tx(sig) : null });
      } else if (viemChain) {
        const rpc = evmBrowserRpc(chain);
        const account = await getEvmAccount(source.id); // throws if the vault is locked
        const client = createWalletClient({ account, chain: viemChain, transport: http(rpc) });
        const hash = await client.sendTransaction({
          to: destAddr as `0x${string}`,
          value: parseEther(amount),
        });
        setResult({ hash, explorer: chainCfg.explorer ? chainCfg.explorer.tx(hash) : null });
      }
      toast("success", "Transfer broadcast", `${amount} ${chainCfg.nativeToken.symbol} → ${shortAddr(destAddr)}`);
      setConfirmOpen(false);
      setAmount("");
      onChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Vault-lock errors surface verbatim — the vault is never auto-unlocked.
      setError(msg.includes("locked") ? msg : msg.slice(0, 200));
      toast("error", "Transfer failed", msg.slice(0, 140));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-sm font-semibold text-fg">Transfer</h2>
        <span className="chip" title={`Native transfers on ${chainCfg.name}`}>
          <ChainLogo id={chain} className="h-3.5 w-3.5" />
          {chainCfg.name}
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <section>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Source wallet</p>
          {signable.length === 0 ? (
            <p className="rounded-md border border-line bg-surface p-2.5 text-xs text-muted">
              No embedded wallet on this network. External wallets sign inside their own app — use them from the
              trading panel. Create an embedded wallet here to transfer.
            </p>
          ) : (
            <select
              aria-label="Source wallet"
              value={sourceKey ?? ""}
              onChange={(e) => setSourceKey(e.target.value || null)}
              className="input text-sm"
            >
              <option value="">Select a wallet…</option>
              {signable.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.name} · {shortAddr(w.address, 6, 6)}
                </option>
              ))}
            </select>
          )}
          {source && (
            <div className="mt-1.5 flex items-center justify-between rounded border border-line/60 bg-surface px-2.5 py-1.5 text-2xs text-muted">
              <span>Embedded — SIGHT signs after your confirmation</span>
              <span className="tabular text-fg">
                {balHuman ?? "—"} {chainCfg.nativeToken.symbol}
              </span>
            </div>
          )}
        </section>

        <section>
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Destination</p>
          <div className="mb-2 flex gap-1" role="tablist" aria-label="Destination type">
            {(["wallet", "address"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={destMode === m}
                onClick={() => {
                  setDestMode(m);
                  setDestAddress("");
                  setDestKey(null);
                }}
                className={cn(
                  "focus-ring rounded px-2.5 py-1 text-2xs font-medium",
                  destMode === m ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface hover:text-fg",
                )}
              >
                {m === "wallet" ? "My wallets" : "Custom address"}
              </button>
            ))}
          </div>
          {destMode === "wallet" ? (
            <select
              aria-label="Destination wallet"
              value={destKey ?? ""}
              onChange={(e) => setDestKey(e.target.value || null)}
              className="input text-sm"
            >
              <option value="">Select a wallet…</option>
              {wallets
                .filter((w) => w.key !== sourceKey)
                .map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.name} · {shortAddr(w.address, 6, 6)}
                  </option>
                ))}
            </select>
          ) : (
            <input
              aria-label="Destination address"
              value={destAddress}
              onChange={(e) => setDestAddress(e.target.value)}
              placeholder={isSolana ? "Solana address (base58)" : "0x EVM address"}
              className="input font-mono text-xs"
            />
          )}
          {destAddr.length > 0 && !destValid && (
            <p className="mt-1 text-2xs text-neg">
              Not a valid {chainCfg.name} address — check the network and format.
            </p>
          )}
          {destIsSource && <p className="mt-1 text-2xs text-warn">Destination equals the source wallet.</p>}
        </section>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
              Amount ({chainCfg.nativeToken.symbol})
            </p>
            {maxAmount !== null && (
              <button
                onClick={() => setAmount(maxAmount)}
                className="focus-ring text-2xs text-accent hover:underline"
                title="Balance minus estimated fee"
              >
                MAX
              </button>
            )}
          </div>
          <input
            aria-label="Transfer amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.0"
            className="input font-mono text-sm"
          />
          <div className="mt-1 flex items-center justify-between text-2xs text-muted">
            <span>
              Available:{" "}
              <span className="tabular text-fg">
                {srcBal?.status === "ok"
                  ? `${balHuman} ${chainCfg.nativeToken.symbol}`
                  : srcBal?.status === "loading"
                    ? "loading…"
                    : "unavailable"}
              </span>
            </span>
            <span>
              Fee:{" "}
              <span className="tabular text-fg">
                {feeLoading ? "estimating…" : fee ? `${fee} ${chainCfg.nativeToken.symbol}` : "—"}
              </span>
            </span>
          </div>
          {amountValid && balHuman !== null && !balanceOk && (
            <p className="mt-1 text-2xs text-neg">Amount + fee exceeds the available balance.</p>
          )}
        </section>

        {unsupportedNote && (
          <div className="rounded-md border border-warn/40 bg-warn/5 p-2.5 text-xs text-warn">{unsupportedNote}</div>
        )}
        {error && <p className="text-xs text-neg">{error}</p>}
        {result && (
          <div className="rounded-md border border-pos/40 bg-pos/5 p-2.5 text-xs">
            <p className="text-pos">Transfer broadcast ✓</p>
            <p className="mt-1 break-all font-mono text-2xs text-muted">{result.hash}</p>
            {result.explorer && (
              <a href={result.explorer} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block underline hover:no-underline">
                View on {chainCfg.explorer?.name} ↗
              </a>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        <button onClick={() => setConfirmOpen(true)} disabled={!canStart || busy} className="btn-primary w-full">
          Start Transfer
        </button>
        <p className="mt-1.5 text-center text-2xs text-muted/70">
          Same-network native transfers only — no cross-chain bridging. Nothing signs until you confirm.
        </p>
      </div>

      {confirmOpen && source && destAddr && (
        <DialogShell title="Confirm transfer" onClose={() => !busy && setConfirmOpen(false)}>
          <div className="space-y-2 rounded-md border border-line bg-surface p-3 text-xs">
            <Row label="Network" value={chainCfg.name} />
            <Row label="From" value={shortAddr(source.address, 8, 8)} />
            <Row label="To" value={shortAddr(destAddr, 8, 8)} />
            <Row label="Amount" value={`${amount} ${chainCfg.nativeToken.symbol}`} />
            <Row label="Estimated fee" value={fee ? `${fee} ${chainCfg.nativeToken.symbol}` : "—"} />
          </div>
          <p className="text-2xs text-muted">
            Transfers are irreversible. Verify the destination address and network before confirming.
          </p>
          {error && <p className="text-xs text-neg">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setConfirmOpen(false)} disabled={busy} className="btn-ghost focus-ring flex-1">
              Cancel
            </button>
            <button onClick={execute} disabled={busy} className="btn-primary focus-ring flex-1">
              {busy ? "Signing & sending…" : "Sign & send"}
            </button>
          </div>
        </DialogShell>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-mono text-fg">{value}</span>
    </div>
  );
}