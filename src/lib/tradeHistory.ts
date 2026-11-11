"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChainId } from "./chains";

/**
 * Local trade ledger.
 *
 * Records are written when a transaction is confirmed (or fails) on-chain.
 * Values are stored with what we actually know at confirmation time — USD
 * valuations are marked null unless computable, and P&L derived from this
 * ledger is always labeled an estimate (transfers in/out and missing
 * pre-existing balances are not accounted for).
 */
export interface TradeRecord {
  id: string;
  chain: ChainId;
  kind: "buy" | "sell" | "unknown";
  tokenAddress: string;
  tokenSymbol: string;
  /** Human token amount (buy = received, sell = sold). null for failed. */
  amountToken: number | null;
  /** Human native amount (buy = paid, sell = received). null for failed. */
  amountNative: number | null;
  nativeSymbol: string;
  valueUsd: number | null;
  signature: string;
  timestamp: number;
  status: "confirmed" | "pending" | "failed" | "unknown";
  explorerUrl: string | null;
  note: string | null;
}

interface TradeState {
  trades: TradeRecord[];
  addTrade: (t: Omit<TradeRecord, "id">) => void;
  updateStatus: (signature: string, status: TradeRecord["status"], note?: string | null) => void;
  clear: () => void;
}

export const useTrades = create<TradeState>()(
  persist(
    (set) => ({
      trades: [],
      addTrade: (t) =>
        set((s) => ({
          trades: [{ ...t, id: crypto.randomUUID() }, ...s.trades].slice(0, 1000),
        })),
      updateStatus: (signature, status, note) =>
        set((s) => ({
          trades: s.trades.map((t) =>
            t.signature === signature ? { ...t, status, note: note ?? t.note } : t,
          ),
        })),
      clear: () => set({ trades: [] }),
    }),
    { name: "sight.trades" },
  ),
);

export function recordTrade(t: Omit<TradeRecord, "id">): void {
  useTrades.getState().addTrade(t);
}

/**
 * Estimated open positions derived from the local trade ledger.
 * Positions are only trustworthy if the ledger contains the full history for
 * that token — the UI must disclose this. A balance-based check is provided
 * by the portfolio page for Solana (full on-chain scan).
 */
export interface EstimatedPosition {
  chain: ChainId;
  tokenAddress: string;
  tokenSymbol: string;
  netAmount: number;
  avgCostNative: number | null;
  nativeSymbol: string;
  tradesCount: number;
}

export function estimatePositions(trades: TradeRecord[]): EstimatedPosition[] {
  const byToken = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    if (t.status !== "confirmed") continue;
    const key = `${t.chain}:${t.tokenAddress}`;
    byToken.set(key, [...(byToken.get(key) ?? []), t]);
  }
  const out: EstimatedPosition[] = [];
  for (const [, list] of byToken) {
    let net = 0;
    let costTotal = 0;
    let received = 0;
    for (const t of list) {
      if (t.kind === "buy" && t.amountToken !== null && t.amountNative !== null) {
        net += t.amountToken;
        received += t.amountToken;
        costTotal += t.amountNative;
      } else if (t.kind === "sell" && t.amountToken !== null) {
        net -= t.amountToken;
      }
    }
    const first = list[0];
    out.push({
      chain: first.chain,
      tokenAddress: first.tokenAddress,
      tokenSymbol: first.tokenSymbol,
      netAmount: net,
      avgCostNative: received > 0 ? costTotal / received : null,
      nativeSymbol: first.nativeSymbol,
      tradesCount: list.length,
    });
  }
  return out.sort((a, b) => b.netAmount - a.netAmount);
}