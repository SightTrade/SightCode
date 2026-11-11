"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHAINS, SOLANA_MINTS } from "@/lib/chains";
import { useSettings, useWallet } from "@/lib/store";
import { recordTrade } from "@/lib/tradeHistory";
import { cn, fmtNum, fmtPct, fmtUsd, fromRaw, shortAddr } from "@/lib/format";
import type { QuoteResult, TokenDetail } from "@/lib/types";
import { listEmbeddedWallets, isVaultUnlocked, signSolanaTransaction, getEvmAccount, type EmbeddedWalletMeta } from "@/lib/wallet/vault";
import { useToast } from "./Toast";
import { WalletIcon } from "./wallet/WalletIcons";
import { EvmTradePanel } from "./EvmTradePanel";

/**
 * Trade panel — chain-aware.
 * Solana: real swaps via Jupiter — quote → explicit user confirmation →
 * wallet signature (external provider or SIGHT embedded vault) → submission →
 * RPC status tracking.
 * EVM (ethereum/base/bsc): real quotes via established V2 routers (verified
 * on-chain before quoting) — approve + swap transactions signed by the
 * selected EVM wallet. Unconfigured chains refuse to trade.
 */
type Side = "buy" | "sell";
type TxStatus = "idle" | "building" | "signing" | "submitting" | "pending" | "confirmed" | "failed";

const BUY_PRESETS = [0.1, 0.5, 1, 5];
const SELL_PRESETS = [10, 25, 50, 100];

export function TradePanel(props: { detail: TokenDetail }) {
  const { detail } = props;
  const chain = CHAINS[detail.summary.chain];
  const { solanaAddress, evmAddress, solanaSource, evmSource, solanaWalletName, evmWalletName, solanaWalletId, evmWalletId, setSolana, setEvm } = useWallet();
  const settings = useSettings();
  const { toast } = useToast();

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [status, setStatus] = useState<TxStatus>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const quoteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Chain family wallet options: embedded wallets (unlocked vault) + external. */
  const [walletOptions, setWalletOptions] = useState<EmbeddedWalletMeta[]>([]);

  const isSolana = chain.kind === "solana";
  const tokenMint = detail.summary.address;
  const decimals = detail.decimals;
  const wallet = isSolana ? solanaAddress : evmAddress;
  const walletSource = isSolana ? solanaSource : evmSource;
  const walletId = isSolana ? solanaWalletId : evmWalletId;
  const walletName = isSolana ? solanaWalletName : evmWalletName;

  // Chain-aware wallet options: refresh whenever the chain family changes.
  useEffect(() => {
    if (isVaultUnlocked()) setWalletOptions(listEmbeddedWallets().filter((w) => w.family === (isSolana ? "solana" : "evm")));
    else setWalletOptions([]);
  }, [isSolana, status]);

  const selectWallet = (meta: EmbeddedWalletMeta) => {
    if (!isVaultUnlocked()) {
      toast("warn", "Vault is locked", "Unlock the vault under My Wallets to trade with a SIGHT-created wallet.");
      return;
    }
    if (isSolana) setSolana(meta.address, meta.name, "embedded", meta.id);
    else setEvm(meta.address, meta.name, "embedded", meta.id);
  };

  const inputLabel = side === "buy" ? `Amount (${chain.nativeToken.symbol})` : `Amount (${detail.summary.symbol})`;
  const inputDecimals = side === "buy" ? chain.nativeToken.decimals : decimals;
  const inputMint = side === "buy" ? SOLANA_MINTS.SOL : tokenMint;
  const outputMint = side === "buy" ? tokenMint : SOLANA_MINTS.SOL;

  const getQuote = useCallback(async () => {
    const amt = amount.trim();
    if (!amt || Number(amt) <= 0 || inputDecimals === null || !isSolana) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    if (!/^\d*\.?\d+$/.test(amt)) {
      setQuoteError("Enter a valid number");
      setQuote(null);
      return;
    }
    setQuoting(true);
    setQuoteError(null);
    try {
      const res = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chain: "solana",
          inputMint,
          outputMint,
          amountHuman: amt,
          inputDecimals,
          slippageBps: settings.slippageBps,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setQuote(body as QuoteResult);
    } catch (e) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : String(e).slice(0, 140));
    } finally {
      setQuoting(false);
    }
  }, [amount, inputDecimals, isSolana, inputMint, outputMint, settings.slippageBps]);

  // Debounced auto-quote on amount / slippage changes.
  useEffect(() => {
    if (!isSolana || !wallet) return;
    if (quoteDebounce.current) clearTimeout(quoteDebounce.current);
    quoteDebounce.current = setTimeout(getQuote, 500);
    return () => {
      if (quoteDebounce.current) clearTimeout(quoteDebounce.current);
    };
  }, [getQuote, isSolana, wallet]);

  const quoteOutHuman = useMemo(() => {
    if (!quote) return null;
    const outDecimals = side === "buy" ? decimals : chain.nativeToken.decimals;
    if (outDecimals === null) return null;
    return fromRaw(quote.outAmount, outDecimals);
  }, [quote, side, decimals, chain.nativeToken.decimals]);

  const minReceivedHuman = useMemo(() => {
    if (!quote) return null;
    const outDecimals = side === "buy" ? decimals : chain.nativeToken.decimals;
    if (outDecimals === null) return null;
    return fromRaw(quote.otherAmountThreshold, outDecimals);
  }, [quote, side, decimals, chain.nativeToken.decimals]);

  const priceImpactPct = quote?.priceImpactPct != null ? Number(quote.priceImpactPct) * 100 : null;

  // ---- Execution: build → wallet sign → submit → RPC status tracking ----
  const execute = useCallback(async () => {
    if (!quote || !wallet) return;
    setConfirmOpen(false);
    try {
      setStatus("building");
      const buildRes = await fetch("/api/swap/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quote: quote.raw,
          userPublicKey: wallet,
          priorityLevel: settings.priorityLevel,
          maxLamports: settings.maxPriorityLamports,
        }),
      });
      const buildBody = await buildRes.json();
      if (!buildRes.ok) throw new Error(buildBody.error ?? "build failed");

      setStatus("signing");
      const { VersionedTransaction, Connection } = await import("@solana/web3.js");
      const tx = VersionedTransaction.deserialize(Buffer.from(buildBody.swapTransaction, "base64"));

      let sig: string;
      if (walletSource === "embedded" && walletId) {
        // Embedded vault signing: sign locally, broadcast through the RPC.
        // The public RPC URL is not a secret; a paid provider can be set via
        // NEXT_PUBLIC_SOLANA_RPC for reliability.
        if (!isVaultUnlocked()) throw new Error("Vault is locked — unlock under My Wallets to trade");
        signSolanaTransaction(walletId, tx);
        const conn = new Connection(
          process.env.NEXT_PUBLIC_SOLANA_RPC || CHAINS.solana.defaultRpc,
          "confirmed",
        );
        sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      } else {
        const provider = (window as any).phantom?.solana ?? (window as any).solana;
        if (!provider?.signAndSendTransaction) {
          throw new Error("Wallet cannot sign transactions. Reconnect your wallet.");
        }
        const result = await provider.signAndSendTransaction(tx);
        sig = typeof result === "string" ? result : result.signature;
      }
      setSignature(sig);
      setStatus("pending");
      toast("info", "Transaction submitted", `${shortAddr(sig)} — tracking confirmation…`);

      // Track the real status via RPC polling.
      const deadline = Date.now() + 90_000;
      let finalStatus: TxStatus = "pending";
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const res = await fetch(`/api/tx/${sig}`, { cache: "no-store" });
          const body = await res.json();
          const s = body.status as TxStatus | undefined;
          if (s === "confirmed" || s === "failed") {
            finalStatus = s;
            break;
          }
        } catch {
          // transient RPC error — keep polling
        }
      }
      setStatus(finalStatus);
      if (finalStatus === "confirmed") {
        toast("success", "Trade confirmed", `${side === "buy" ? "Bought" : "Sold"} ${detail.summary.symbol} on Solana`);
        recordTrade({
          chain: "solana",
          kind: side,
          tokenAddress: tokenMint,
          tokenSymbol: detail.summary.symbol,
          amountToken: side === "buy" ? quoteOutHuman : Number(amount) || null,
          amountNative: side === "buy" ? Number(amount) || null : quoteOutHuman,
          nativeSymbol: chain.nativeToken.symbol,
          valueUsd: null,
          signature: sig,
          timestamp: Date.now(),
          status: "confirmed",
          explorerUrl: chain.explorer?.tx(sig) ?? null,
          note: null,
        });
      } else if (finalStatus === "failed") {
        toast("error", "Transaction failed on-chain", `No balance changes were applied. ${chain.explorer?.tx(sig) ?? ""}`);
      } else {
        toast("warn", "Confirmation timed out", "The transaction may still land — check the explorer link.");
      }
    } catch (e) {
      setStatus("failed");
      const msg = e instanceof Error ? e.message : String(e).slice(0, 160);
      if (/rejected|4100/i.test(msg)) toast("warn", "Signature rejected in wallet");
      else toast("error", "Transaction not submitted", msg);
    }
  }, [quote, wallet, settings.priorityLevel, settings.maxPriorityLamports, toast, side, detail.summary.symbol, tokenMint, quoteOutHuman, amount, chain, walletId, walletSource]);

  if (chain.status === "unconfigured") {
    return (
      <div className="panel p-4">
        <h3 className="text-sm font-semibold text-fg">Trading — {chain.name}</h3>
        <p className="mt-2 text-xs text-muted">{chain.capabilityNote}</p>
      </div>
    );
  }

  if (!isSolana) {
    return <EvmTradePanel detail={detail} />;
  }

  return (
    <div className="panel flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">Trade</h3>
        <span className="chip" title="Swap routing via Jupiter aggregation">Jupiter · {chain.name}</span>
      </div>

      {/* Buy / Sell tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-surface p-1" role="tablist" aria-label="Trade side">
        {(["buy", "sell"] as Side[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            onClick={() => {
              setSide(s);
              setAmount("");
              setQuote(null);
              setQuoteError(null);
              setStatus("idle");
              setSignature(null);
            }}
            className={cn(
              "focus-ring rounded py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
              side === s ? (s === "buy" ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg") : "text-muted hover:text-fg",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chain-aware wallet selector (embedded + external options) */}
      <div className="rounded-md border border-line bg-surface p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted">Trading wallet</span>
          {wallet && (
            <span className={`chip ${walletSource === "embedded" ? "border-accent/40 text-accent" : "text-muted"}`}>
              {walletSource === "embedded" ? "SIGHT wallet" : (walletName ?? "Connected")}
            </span>
          )}
        </div>
        {walletOptions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {walletOptions.map((w) => (
              <button
                key={w.id}
                onClick={() => selectWallet(w)}
                className={cn(
                  "focus-ring flex items-center gap-1.5 rounded border px-2 py-1 text-2xs transition-colors",
                  walletId === w.id ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted hover:text-fg",
                )}
              >
                <WalletIcon id={isSolana ? "embedded-solana" : "embedded-evm"} size={14} />
                {shortAddr(w.address, 4, 4)}
              </button>
            ))}
          </div>
        )}
        {!wallet && (
          <p className="mt-1 text-2xs text-muted">
            {walletOptions.length > 0
              ? "Select a wallet above, or connect an external one from the top bar."
              : "Connect a wallet from the top bar, or create one under My Wallets."}
          </p>
        )}
      </div>

      {!wallet ? (
        <div className="rounded-md border border-line bg-surface p-3 text-center">
          <p className="text-xs text-muted">Connect a Solana wallet to trade.</p>
          <p className="mt-1 text-2xs text-muted/70">
            Phantom and other injected Wallet-Standard wallets are supported. Keys never leave your wallet.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-2xs text-muted" htmlFor="trade-amount">{inputLabel}</label>
            <input
              id="trade-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="input tabular font-mono text-base"
              autoComplete="off"
            />
            <div className="mt-1.5 flex gap-1.5">
              {(side === "buy" ? BUY_PRESETS : SELL_PRESETS).map((p) => (
                <button key={p} onClick={() => setAmount(String(p))} className="btn-ghost focus-ring h-6 flex-1 px-0 text-2xs">
                  {side === "buy" ? `${p} SOL` : `${p}%`}
                </button>
              ))}
            </div>
            {side === "sell" && (
              <p className="mt-1 text-2xs text-muted/70">
                % presets are quick absolute entries — balance-aware sells need your wallet balance; check Portfolio first.
              </p>
            )}
          </div>

          {/* Quote display */}
          <div className="rounded-md border border-line bg-surface p-2.5 text-xs">
            {quoting && <p className="text-muted">Fetching quote…</p>}
            {quoteError && <p className="text-neg">{quoteError}</p>}
            {!quoting && !quoteError && !quote && <p className="text-muted">Enter an amount to get a live quote.</p>}
            {quote && (
              <dl className="space-y-1.5">
                <Row label="Expected output" value={quoteOutHuman !== null ? `${fmtNum(quoteOutHuman, 6)} ${side === "buy" ? detail.summary.symbol : chain.nativeToken.symbol}` : "—"} />
                <Row label="Minimum received" value={minReceivedHuman !== null ? fmtNum(minReceivedHuman, 6) : "—"} title={`With ${quote.slippageBps / 100}% slippage tolerance`} />
                <Row
                  label="Price impact"
                  value={priceImpactPct !== null ? fmtPct(priceImpactPct) : "—"}
                  className={priceImpactPct !== null && priceImpactPct > 5 ? "text-neg" : priceImpactPct !== null && priceImpactPct > 1 ? "text-warn" : ""}
                  title="Estimated share of pool liquidity consumed by this trade"
                />
                <Row label="Slippage tolerance" value={fmtPct(quote.slippageBps / 10)} title="Set in Settings — never changed silently" />
                <Row label="Route" value={(quote.routeLabels ?? []).join(" → ") || "—"} title="AMMs used by the Jupiter route" />
                <Row label="Est. output value" value={fmtUsd(quoteOutHuman !== null ? quoteOutHuman * (detail.summary.priceUsd ?? 0) : null)} />
              </dl>
            )}
          </div>

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!quote || quoting || !!quoteError || status === "pending" || status === "signing" || status === "building"}
            className={cn("btn-primary w-full", side === "buy" ? "bg-pos text-[#04120a] hover:bg-pos/90" : "bg-neg text-[#1a040a] hover:bg-neg/90")}
          >
            {status === "pending" ? "Confirming on-chain…" : status === "signing" ? "Waiting for wallet…" : status === "building" ? "Building transaction…" : `${side === "buy" ? "Buy" : "Sell"} ${detail.summary.symbol}`}
          </button>

          {signature && (
            <div
              className={cn(
                "rounded-md border p-2.5 text-xs",
                status === "confirmed" ? "border-pos/40 bg-pos/5 text-pos" : status === "failed" ? "border-neg/40 bg-neg/5 text-neg" : "border-info/40 bg-info/5 text-info",
              )}
              aria-live="polite"
            >
              <p className="font-medium">
                {status === "confirmed" ? "✓ Confirmed on-chain" : status === "failed" ? "✕ Failed on-chain" : "⏳ Pending confirmation"}
              </p>
              <a href={chain.explorer?.tx(signature)} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all font-mono text-2xs underline hover:no-underline">
                {shortAddr(signature, 10, 8)} ↗
              </a>
            </div>
          )}
        </>
      )}

      {confirmOpen && quote && (
        <ConfirmDialog
          side={side}
          symbol={detail.summary.symbol}
          amount={amount}
          nativeSymbol={chain.nativeToken.symbol}
          quoteOut={quoteOutHuman}
          minReceived={minReceivedHuman}
          slippagePct={quote.slippageBps / 10}
          priceImpact={priceImpactPct}
          route={(quote.routeLabels ?? []).join(" → ")}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={execute}
        />
      )}
    </div>
  );
}

function Row({ label, value, className, title }: { label: string; value: string; className?: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-2" title={title}>
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular truncate text-right text-fg", className)}>{value}</dd>
    </div>
  );
}

function ConfirmDialog(props: {
  side: Side;
  symbol: string;
  amount: string;
  nativeSymbol: string;
  quoteOut: number | null;
  minReceived: number | null;
  slippagePct: number;
  priceImpact: number | null;
  route: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const p = props;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Confirm trade" onClick={p.onCancel}>
      <div className="animate-slide-up w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-semibold text-fg">
          Confirm {p.side === "buy" ? "buy" : "sell"} — {p.symbol}
        </h4>
        <p className="mt-1 text-2xs text-muted">Review every parameter. Nothing is submitted until you approve in your wallet.</p>
        <dl className="mt-3 space-y-1.5 rounded-md border border-line bg-surface p-2.5 text-xs">
          <Row label={p.side === "buy" ? "You pay" : "You sell"} value={`${fmtNum(Number(p.amount) || 0, 6)} ${p.side === "buy" ? p.nativeSymbol : p.symbol}`} />
          <Row label="Expected output" value={p.quoteOut !== null ? fmtNum(p.quoteOut, 6) : "—"} />
          <Row label="Minimum received" value={p.minReceived !== null ? fmtNum(p.minReceived, 6) : "—"} />
          <Row label="Slippage tolerance" value={fmtPct(p.slippagePct)} />
          <Row label="Price impact" value={fmtPct(p.priceImpact)} className={p.priceImpact !== null && p.priceImpact > 5 ? "text-neg" : ""} />
          <Row label="Route" value={p.route || "—"} />
          <Row label="Venue" value="Jupiter (Solana)" />
        </dl>
        <div className="mt-3 flex gap-2">
          <button onClick={p.onCancel} className="btn-ghost flex-1 focus-ring">Cancel</button>
          <button onClick={p.onConfirm} className="btn-primary flex-1 focus-ring">Approve in wallet</button>
        </div>
      </div>
    </div>
  );
}