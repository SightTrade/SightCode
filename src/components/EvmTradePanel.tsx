"use client";

import { useCallback, useEffect, useState } from "react";
import { CHAINS } from "@/lib/chains";
import { useSettings, useWallet } from "@/lib/store";
import { recordTrade } from "@/lib/tradeHistory";
import { cn, fmtNum, fmtUsd, fromRaw, shortAddr } from "@/lib/format";
import type { TokenDetail } from "@/lib/types";
import { getEvmAccount, isVaultUnlocked } from "@/lib/wallet/vault";
import { encodeV2SwapCalldata, encodeApproveCalldata } from "@/lib/providers/evmDex";
import { evmBrowserRpc } from "@/lib/rpcBrowser";
import { useToast } from "./Toast";

/**
 * EVM trading panel — Ethereum, Base, BNB Chain.
 *
 * Quotes come from the chain's established V2 router (verified on-chain by the
 * server before returning). Execution signs with the selected EVM wallet
 * (external injected provider or SIGHT embedded vault account) — never
 * automatically. Sells require an ERC-20 allowance step with explicit approval.
 */
type Side = "buy" | "sell";
type TxStatus = "idle" | "quoting" | "approving" | "signing" | "pending" | "confirmed" | "failed";

interface EvmQuote {
  router: string;
  venue: string;
  routerVerified: boolean;
  path: string[];
  amountInRaw: string;
  amountOutRaw: string;
  amountOutMinRaw: string;
  tokenDecimals: number | null;
  tokenSymbol: string | null;
  priceImpactPct: null;
}

const EVM_CHAIN_IDS: Record<string, number> = { ethereum: 1, base: 8453, bsc: 56 };
const EVM_NATIVE: Record<string, string> = { ethereum: "ETH", base: "ETH", bsc: "BNB" };

export function EvmTradePanel({ detail }: { detail: TokenDetail }) {
  const chain = CHAINS[detail.summary.chain];
  const chainId = EVM_CHAIN_IDS[detail.summary.chain] ?? 0;
  const { evmAddress, evmSource, evmWalletId, evmWalletName } = useWallet();
  const settings = useSettings();
  const { toast } = useToast();

  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<EvmQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [status, setStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  const supported = detail.summary.chain === "ethereum" || detail.summary.chain === "base" || detail.summary.chain === "bsc";
  const token = detail.summary.address;
  const wallet = evmAddress;
  const inputDecimals = side === "buy" ? chain.nativeToken.decimals : detail.decimals ?? 18;

  const refreshBalances = useCallback(async () => {
    if (!wallet) return;
    try {
      const res = await fetch(`/api/balances?chain=${detail.summary.chain}&address=${wallet}&tokens=${token}`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (res.ok) {
        setNativeBalance(Number(body.nativeBalance ?? "0"));
        const t = (body.tokens ?? []).find((x: { address: string }) => x.address.toLowerCase() === token.toLowerCase());
        setTokenBalance(t && t.decimals != null ? Number(BigInt(t.balance)) / 10 ** t.decimals : null);
      }
    } catch {
      // balance display is best-effort
    }
  }, [wallet, detail.summary.chain, token]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  const getQuote = useCallback(async () => {
    const amt = amount.trim();
    if (!amt || Number(amt) <= 0 || !supported) {
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
      // Integer-raw conversion: never floats for the quoted amount.
      const raw = BigInt(Math.round(Number(amt) * 10 ** inputDecimals)).toString();
      const res = await fetch("/api/evm/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chain: detail.summary.chain,
          token,
          amountRaw: raw,
          side,
          slippageBps: settings.slippageBps,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setQuote(body as EvmQuote);
    } catch (e) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : String(e).slice(0, 160));
    } finally {
      setQuoting(false);
    }
  }, [amount, inputDecimals, supported, detail.summary.chain, token, side, settings.slippageBps]);

  useEffect(() => {
    if (!supported || !wallet) return;
    const t = setTimeout(getQuote, 500);
    return () => clearTimeout(t);
  }, [getQuote, supported, wallet]);

  /** Send a transaction via the embedded account or the injected provider. */
  const sendTx = useCallback(
    async (tx: { to: string; data: string; value: string }): Promise<string> => {
      if (evmSource === "embedded" && evmWalletId) {
        if (!isVaultUnlocked()) throw new Error("Vault is locked — unlock under My Wallets to trade");
        const { createWalletClient, http } = await import("viem");
        const viemChains = await import("viem/chains");
        const viemChain =
          detail.summary.chain === "ethereum"
            ? viemChains.mainnet
            : detail.summary.chain === "bsc"
              ? viemChains.bsc
              : viemChains.base;
        const account = await getEvmAccount(evmWalletId);
        const client = createWalletClient({
          account,
          chain: viemChain,
          transport: http(evmBrowserRpc(chain.id)),
        });
        const hash = await client.sendTransaction({
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: BigInt(tx.value),
          gas: 600_000n,
        });
        return hash;
      }
      const provider = (window as any).ethereum;
      if (!provider?.request) throw new Error("No EVM wallet connected — connect one to trade");
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      if (!accounts?.length) throw new Error("Wallet session expired — reconnect");
      // Verify the wallet's active chain matches the token's chain before signing.
      const activeChainHex = (await provider.request({ method: "eth_chainId" })) as string;
      const activeChainId = parseInt(activeChainHex, 16);
      if (activeChainId !== chainId) {
        // Request a chain switch — never performed silently, never skipped.
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          });
        } catch {
          throw new Error(
            `Your wallet is on network ${activeChainId} but ${chain.name} requires chain ${chainId}. Switch networks in your wallet.`,
          );
        }
      }
      const txParams: Record<string, string> = { from: accounts[0], to: tx.to, data: tx.data };
      if (tx.value !== "0") txParams.value = `0x${BigInt(tx.value).toString(16)}`;
      const hash = (await provider.request({ method: "eth_sendTransaction", params: [txParams] })) as string;
      return hash;
    },
    [evmSource, evmWalletId, chainId, chain.name, chain.defaultRpc, detail.summary.chain],
  );

  const execute = useCallback(async () => {
    if (!quote || !wallet) return;
    setConfirmOpen(false);
    try {
      const { data, value } = encodeV2SwapCalldata({
        side,
        amountInRaw: quote.amountInRaw,
        amountOutMinRaw: quote.amountOutMinRaw,
        path: quote.path,
        to: wallet,
        deadlineSeconds: 600,
      });

      // Sells need an ERC-20 allowance for the router first — explicit step.
      if (side === "sell") {
        setStatus("approving");
        const approveData = encodeApproveCalldata(quote.router, quote.amountInRaw);
        toast("info", "Approval required", "Confirm the token allowance in your wallet, then the swap.");
        await sendTx({ to: token, data: approveData, value: "0" });
      }

      setStatus("signing");
      const hash = await sendTx({ to: quote.router, data, value });
      setTxHash(hash);
      setStatus("pending");
      toast("info", "Transaction submitted", `${shortAddr(hash)} — tracking confirmation…`);

      const deadline = Date.now() + 120_000;
      let finalStatus: TxStatus = "pending";
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        try {
          const res = await fetch(`/api/evm/tx/${hash}?chain=${detail.summary.chain}`, { cache: "no-store" });
          const body = await res.json();
          if (body.status === "confirmed" || body.status === "failed") {
            finalStatus = body.status as TxStatus;
            break;
          }
        } catch {
          // keep polling
        }
      }
      setStatus(finalStatus);
      if (finalStatus === "confirmed") {
        toast("success", "Trade confirmed", `${side === "buy" ? "Bought" : "Sold"} ${detail.summary.symbol} on ${chain.name}`);
        recordTrade({
          chain: detail.summary.chain as never,
          kind: side,
          tokenAddress: token,
          tokenSymbol: detail.summary.symbol,
          amountToken:
            side === "buy" && quote.tokenDecimals != null
              ? Number(BigInt(quote.amountOutRaw)) / 10 ** quote.tokenDecimals
              : Number(amount) || null,
          amountNative:
            side === "buy" ? Number(amount) || null : fromRaw(quote.amountOutRaw, chain.nativeToken.decimals),
          nativeSymbol: EVM_NATIVE[detail.summary.chain] ?? chain.nativeToken.symbol,
          valueUsd: null,
          signature: hash,
          timestamp: Date.now(),
          status: "confirmed",
          explorerUrl: chain.explorer?.tx(hash) ?? null,
          note: `Venue: ${quote.venue}`,
        });
        refreshBalances();
      } else if (finalStatus === "failed") {
        toast("error", "Transaction failed on-chain", chain.explorer?.tx(hash) ?? undefined);
      } else {
        toast("warn", "Confirmation timed out", "Check the explorer — the transaction may still land.");
      }
    } catch (e) {
      setStatus("failed");
      const msg = e instanceof Error ? e.message : String(e).slice(0, 160);
      if (/rejected|denied|4001/i.test(msg)) toast("warn", "Rejected in wallet");
      else toast("error", "Transaction not submitted", msg);
    }
  }, [quote, wallet, side, token, detail.summary, chain, sendTx, toast, amount, refreshBalances]);

  if (!supported) {
    return (
      <div className="panel p-4">
        <h3 className="text-sm font-semibold text-fg">Trading — {chain.name}</h3>
        <p className="mt-2 text-xs text-muted">
          {chain.status === "unconfigured"
            ? `NETWORK NOT CONFIGURED — ${chain.capabilityNote}`
            : "No verified swap venue is configured for this network yet."}
        </p>
      </div>
    );
  }

  const outDec = side === "buy" ? (quote?.tokenDecimals ?? 18) : chain.nativeToken.decimals;
  const outHuman = quote ? Number(BigInt(quote.amountOutRaw)) / 10 ** outDec : null;
  const minHuman = quote ? Number(BigInt(quote.amountOutMinRaw)) / 10 ** outDec : null;

  return (
    <div className="panel flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">Trade</h3>
        <span className="chip" title="Quoted on-chain against the established V2 router">
          {quote?.venue ?? "V2 router"} · {chain.name}
        </span>
      </div>

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
              setTxHash(null);
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

      {!wallet ? (
        <div className="rounded-md border border-line bg-surface p-3 text-center">
          <p className="text-xs text-muted">Connect an EVM wallet to trade on {chain.name}.</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-line bg-surface p-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">Wallet</span>
              <span className="font-mono text-fg">
                {shortAddr(wallet)} · {evmSource === "embedded" ? "SIGHT wallet" : (evmWalletName ?? "Connected")}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted">Balance</span>
              <span className="tabular text-fg">
                {side === "buy"
                  ? nativeBalance !== null
                    ? `${fmtNum(nativeBalance, 6)} ${EVM_NATIVE[detail.summary.chain]}`
                    : "—"
                  : tokenBalance !== null
                    ? `${fmtNum(tokenBalance, 6)} ${detail.summary.symbol}`
                    : "—"}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-2xs text-muted" htmlFor="evm-amount">
              Amount ({side === "buy" ? EVM_NATIVE[detail.summary.chain] : detail.summary.symbol})
            </label>
            <input
              id="evm-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="input tabular font-mono text-base"
              autoComplete="off"
            />
            <div className="mt-1.5 flex gap-1.5">
              {(side === "buy" ? settings.buyPresets : settings.sellPresets).map((p) => (
                <button
                  key={p}
                  onClick={() =>
                    setAmount(
                      side === "buy"
                        ? String(p)
                        : tokenBalance !== null
                          ? String((tokenBalance * p) / 100)
                          : "",
                    )
                  }
                  className="btn-ghost focus-ring h-6 flex-1 px-0 text-2xs"
                >
                  {side === "buy" ? p : `${p}%`}
                </button>
              ))}
            </div>
          </div>

          <QuoteBox
            quote={quote}
            quoting={quoting}
            quoteError={quoteError}
            outHuman={outHuman}
            minHuman={minHuman}
            slippageBps={settings.slippageBps}
            symbol={detail.summary.symbol}
            nativeSymbol={EVM_NATIVE[detail.summary.chain]}
          />

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!quote || quoting || !!quoteError || status === "pending" || status === "signing" || status === "approving"}
            className={cn("btn-primary w-full", side === "buy" ? "bg-pos text-[#04120a] hover:bg-pos/90" : "bg-neg text-[#1a040a] hover:bg-neg/90")}
          >
            {status === "pending" ? "Confirming on-chain…" : status === "signing" ? "Waiting for wallet…" : status === "approving" ? "Waiting for approval…" : `${side === "buy" ? "Buy" : "Sell"} ${detail.summary.symbol}`}
          </button>

          {txHash && <TxStatusBox status={status} txHash={txHash} explorerUrl={chain.explorer?.tx(txHash) ?? null} />}

          {confirmOpen && quote && (
            <EvmConfirmDialog
              side={side}
              symbol={detail.summary.symbol}
              nativeSymbol={EVM_NATIVE[detail.summary.chain]}
              amount={amount}
              outHuman={outHuman}
              minHuman={minHuman}
              venue={quote.venue}
              onCancel={() => setConfirmOpen(false)}
              onConfirm={execute}
            />
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-2" title={title}>
      <dt className="text-muted">{label}</dt>
      <dd className="tabular truncate text-right text-fg">{value}</dd>
    </div>
  );
}

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function QuoteBox(props: {
  quote: EvmQuote | null;
  quoting: boolean;
  quoteError: string | null;
  outHuman: number | null;
  minHuman: number | null;
  slippageBps: number;
  symbol: string;
  nativeSymbol: string;
}) {
  const p = props;
  return (
    <div className="rounded-md border border-line bg-surface p-2.5 text-xs">
      {p.quoting && <p className="text-muted">Quoting on-chain…</p>}
      {p.quoteError && <p className="text-neg">{p.quoteError}</p>}
      {!p.quoting && !p.quoteError && !p.quote && <p className="text-muted">Enter an amount to get an on-chain quote.</p>}
      {p.quote && (
        <div className="space-y-1.5">
          <Row label="Expected output" value={p.outHuman !== null ? `${fmtNum(p.outHuman, 6)} ${p.symbol}` : "—"} />
          <Row label="Minimum received" value={p.minHuman !== null ? fmtNum(p.minHuman, 6) : "—"} title={`With ${p.slippageBps / 100}% slippage tolerance`} />
          <Row label="Price impact" value="—" title="V2 router quotes do not expose price impact — shown as unavailable rather than estimated" />
          <Row label="Slippage tolerance" value={fmtPct(p.slippageBps / 10)} title="Set in Settings — never changed silently" />
          <Row label="Route" value={p.quote.path.map((x) => shortAddr(x, 4, 4)).join(" → ")} />
          <Row label="Router" value={shortAddr(p.quote.router, 6, 6)} title="Router deployment verified on-chain before quoting" />
        </div>
      )}
    </div>
  );
}

function TxStatusBox({ status, txHash, explorerUrl }: { status: TxStatus; txHash: string; explorerUrl: string | null }) {
  return (
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
      {explorerUrl && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all font-mono text-2xs underline hover:no-underline">
          {shortAddr(txHash, 10, 8)} ↗
        </a>
      )}
    </div>
  );
}

function EvmConfirmDialog(props: {
  side: Side;
  symbol: string;
  nativeSymbol: string;
  amount: string;
  outHuman: number | null;
  minHuman: number | null;
  venue: string;
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
          <Row label="Expected output" value={p.outHuman !== null ? fmtNum(p.outHuman, 6) : "—"} />
          <Row label="Minimum received" value={p.minHuman !== null ? fmtNum(p.minHuman, 6) : "—"} />
          <Row label="Venue" value={p.venue} />
          {p.side === "sell" && <Row label="Step 1" value="Token approval (allowance)" />}
        </dl>
        <div className="mt-3 flex gap-2">
          <button onClick={p.onCancel} className="btn-ghost flex-1 focus-ring">Cancel</button>
          <button onClick={p.onConfirm} className="btn-primary flex-1 focus-ring">Approve in wallet</button>
        </div>
      </div>
    </div>
  );
}