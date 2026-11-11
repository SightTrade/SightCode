import { describe, expect, it } from "vitest";
import {
  classifyEvmTransaction,
  computeWalletFlows,
  QUOTE_ASSETS,
  TRANSFER_TOPIC0,
  type EvmReceiptCore,
  type EvmTxCore,
} from "./swapClassifier";

/**
 * Unit tests for evidence-based EVM swap classification (Phase 3 of the
 * classification spec). All cases use representative mocked transactions and
 * receipts — no network, no signing, no broadcasting.
 */

const W = "0x1111111111111111111111111111111111111111"; // requested wallet
const POOL = "0x2222222222222222222222222222222222222222"; // pool / router contract
const OTHER = "0x3333333333333333333333333333333333333333"; // third-party wallet
const OTHER2 = "0x4444444444444444444444444444444444444444"; // another third party
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01"; // non-quote token
const TOKEN_B = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02"; // second non-quote token
const LP_TOKEN = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01"; // LP token (not a quote asset)

const USDC = QUOTE_ASSETS.ethereum[0]; // canonical Ethereum USDC
const USDT_BSC = QUOTE_ASSETS.bsc[0]; // canonical BNB Chain USDT
const USDC_BASE = QUOTE_ASSETS.base[0]; // canonical Base USDC

function pad(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}
function hex(n: bigint): string {
  return "0x" + n.toString(16).padStart(64, "0");
}
function transferLog(token: string, from: string, to: string, raw: bigint) {
  return { address: token, topics: [TRANSFER_TOPIC0, pad(from), pad(to)], data: hex(raw) };
}
function tx(partial: Partial<EvmTxCore>): EvmTxCore {
  return { from: W, to: POOL, value: 0n, ...partial };
}
function receipt(status = "0x1", logs: EvmReceiptCore["logs"] = []): EvmReceiptCore {
  return { status, logs };
}
const Q = 1_000_000n; // 1 USDC (6 decimals)
const ETH = 1_000_000_000_000_000_000n; // 1 ETH (18 decimals)
const T = 1_000_000_000_000_000_000n; // 1 unit of an 18-decimal token

function classify(partial: {
  chainId?: "ethereum" | "bsc" | "base";
  nativeSymbol?: string;
  tx?: EvmTxCore | null;
  receipt?: EvmReceiptCore | null;
  internalNative?: { from: string; to: string; value: bigint; hash: string }[];
}) {
  return classifyEvmTransaction({
    wallet: W,
    chainId: partial.chainId ?? "ethereum",
    nativeSymbol: partial.nativeSymbol ?? "ETH",
    // `=== undefined` checks so explicit nulls are honored (?? would replace them with defaults).
    tx: partial.tx === undefined ? tx({}) : partial.tx,
    receipt: partial.receipt === undefined ? receipt() : partial.receipt,
    internalNative: partial.internalNative ?? [],
  });
}

describe("EVM swap classification — quote-leg swaps", () => {
  it("1. classifies stablecoin-to-token as BUY (high confidence, quoteValue in USDC)", () => {
    const r = classify({
      tx: tx({ to: POOL }),
      receipt: receipt("0x1", [
        transferLog(USDC.address, W, POOL, 500n * Q),
        transferLog(TOKEN_A, POOL, W, 25n * T),
      ]),
    });
    expect(r.classification).toBe("BUY");
    expect(r.classificationConfidence).toBe("high");
    expect(r.classificationReason).toContain("500 USDC");
    expect(r.tokenIn?.asset).toBe(TOKEN_A);
    expect(r.tokenOut?.asset).toBe(USDC.address);
    expect(r.quoteValue).toBe(500);
    expect(r.quoteCurrency).toBe("USDC");
  });

  it("2. classifies token-to-stablecoin as SELL", () => {
    const r = classify({
      tx: tx({}),
      receipt: receipt("0x1", [
        transferLog(TOKEN_A, W, POOL, 25n * T),
        transferLog(USDC.address, POOL, W, 500n * Q),
      ]),
    });
    expect(r.classification).toBe("SELL");
    expect(r.classificationConfidence).toBe("high");
    expect(r.tokenIn?.asset).toBe(USDC.address);
    expect(r.tokenOut?.asset).toBe(TOKEN_A);
    expect(r.quoteValue).toBe(500);
    expect(r.quoteCurrency).toBe("USDC");
  });

  it("3. classifies native-coin-to-token as BUY with native quote currency", () => {
    const r = classify({
      tx: tx({ value: 2n * ETH }),
      receipt: receipt("0x1", [transferLog(TOKEN_A, POOL, W, 100n * T)]),
    });
    expect(r.classification).toBe("BUY");
    expect(r.quoteCurrency).toBe("native");
    expect(r.quoteValue).toBe(2);
    expect(r.tokenIn?.asset).toBe(TOKEN_A);
    expect(r.tokenOut?.asset).toBe("native");
    expect(r.tokenOut?.symbol).toBe("ETH");
  });

  it("4. classifies token-to-native-coin as SELL using internal native transfers", () => {
    const r = classify({
      tx: tx({ value: 0n }),
      receipt: receipt("0x1", [transferLog(TOKEN_A, W, POOL, 100n * T)]),
      internalNative: [{ from: POOL, to: W, value: 2n * ETH, hash: "0xabc" }],
    });
    expect(r.classification).toBe("SELL");
    expect(r.quoteCurrency).toBe("native");
    expect(r.quoteValue).toBe(2);
    expect(r.tokenOut?.asset).toBe(TOKEN_A);
  });
});

describe("EVM swap classification — hops, transfers, liquidity", () => {
  it("5. supports multi-hop swaps by aggregating net movements (intermediary excluded)", () => {
    const r = classify({
      tx: tx({}),
      receipt: receipt("0x1", [
        transferLog(USDC.address, W, POOL, 100n * Q),
        transferLog(TOKEN_A, POOL, W, 10n * T), // hop 1 output enters wallet
        transferLog(TOKEN_A, W, POOL, 10n * T), // hop 2 input leaves wallet (net ~0)
        transferLog(TOKEN_B, POOL, W, 8n * T), // final output
      ]),
    });
    expect(r.classification).toBe("BUY");
    expect(r.classificationConfidence).toBe("medium");
    expect(r.classificationReason).toContain("multi-hop");
    expect(r.tokenIn?.asset).toBe(TOKEN_B);
    expect(r.quoteCurrency).toBe("USDC");
  });

  it("6. classifies an ordinary wallet transfer as TRANSFER", () => {
    const r = classify({
      tx: tx({ to: OTHER, value: 0n }),
      receipt: receipt("0x1", [transferLog(TOKEN_A, W, OTHER, 3n * T)]),
    });
    expect(r.classification).toBe("TRANSFER");
    expect(r.classificationConfidence).toBe("high");
    expect(r.tokenOut?.asset).toBe(TOKEN_A);
    expect(r.tokenIn).toBeNull();
  });

  it("7a. classifies liquidity ADD (two assets out, LP token in) as LIQUIDITY", () => {
    const r = classify({
      tx: tx({}),
      receipt: receipt("0x1", [
        transferLog(TOKEN_A, W, POOL, 10n * T),
        transferLog(TOKEN_B, W, POOL, 20n * T),
        transferLog(LP_TOKEN, POOL, W, 14n * T),
      ]),
    });
    expect(r.classification).toBe("LIQUIDITY");
    expect(r.classificationConfidence).toBe("medium");
    expect(r.classificationReason).toContain("liquidity add/remove");
  });

  it("7b. classifies liquidity REMOVE (LP token in, two assets out) as LIQUIDITY", () => {
    const r = classify({
      tx: tx({}),
      receipt: receipt("0x1", [
        transferLog(LP_TOKEN, W, POOL, 14n * T),
        transferLog(TOKEN_A, POOL, W, 10n * T),
        transferLog(TOKEN_B, POOL, W, 20n * T),
      ]),
    });
    expect(r.classification).toBe("LIQUIDITY");
    expect(r.tokenIn?.asset).toBe(TOKEN_A);
    expect(r.tokenOut?.asset).toBe(LP_TOKEN);
  });

  it("classifies native <-> wrapped-native wrap/unwrap as TRANSFER, not a swap", () => {
    const weth = QUOTE_ASSETS.ethereum.find((q) => q.kind === "wrapped-native")!;
    const r = classify({
      tx: tx({ value: 1n * ETH, to: weth.address }),
      receipt: receipt("0x1", [transferLog(weth.address, "0x0000000000000000000000000000000000000000", W, 1n * ETH)]),
    });
    expect(r.classification).toBe("TRANSFER");
    expect(r.classificationReason).toContain("wrap/unwrap");
  });
});

describe("EVM swap classification — honest failure and ambiguity handling", () => {
  it("8. marks a reverted transaction UNKNOWN", () => {
    const r = classify({
      receipt: receipt("0x0", [transferLog(USDC.address, W, POOL, Q), transferLog(TOKEN_A, POOL, W, T)]),
    });
    expect(r.classification).toBe("UNKNOWN");
    expect(r.classificationReason).toContain("reverted");
    expect(r.quoteValue).toBeNull();
  });

  it("9. stays UNKNOWN when the receipt is missing or incomplete", () => {
    const missing = classify({ receipt: null });
    expect(missing.classification).toBe("UNKNOWN");
    expect(missing.classificationReason).toContain("receipt unavailable");

    const incomplete = classify({ receipt: receipt("0x1", []) }); // no logs at all
    expect(incomplete.classification).toBe("UNKNOWN");
    expect(incomplete.classificationReason).toContain("no token or native movements");
  });

  it("10. returns UNKNOWN for an unknown quote asset (token-to-token, no quote leg)", () => {
    const r = classify({
      receipt: receipt("0x1", [transferLog(TOKEN_A, W, POOL, 5n * T), transferLog(TOKEN_B, POOL, W, 7n * T)]),
    });
    expect(r.classification).toBe("UNKNOWN");
    expect(r.classificationReason).toContain("no supported quote asset leg");
  });

  it("11. returns UNKNOWN when multiple distinct tokens are received for one quote outflow", () => {
    const r = classify({
      receipt: receipt("0x1", [
        transferLog(USDC.address, W, POOL, 10n * Q),
        transferLog(TOKEN_A, POOL, W, 5n * T),
        transferLog(TOKEN_B, POOL, W, 6n * T),
      ]),
    });
    expect(r.classification).toBe("UNKNOWN");
    expect(r.classificationReason).toContain("split swap or liquidity zap");
  });

  it("12. handles fee-on-transfer residue via the multi-hop tolerance window", () => {
    // 100 tokens in, 99 out (1% FoT residue stays in the wallet): the asset is
    // a route leg, not a swap leg; the quote outflow still proves the BUY.
    const r = classify({
      receipt: receipt("0x1", [
        transferLog(USDC.address, W, POOL, 100n * Q),
        transferLog(TOKEN_A, POOL, W, 100n * T),
        transferLog(TOKEN_A, W, POOL, 99n * T),
        transferLog(TOKEN_B, POOL, W, 80n * T),
      ]),
    });
    expect(r.classification).toBe("BUY");
    expect(r.classificationConfidence).toBe("medium");
    expect(r.classificationReason).toContain("multi-hop");
    expect(r.tokenIn?.asset).toBe(TOKEN_B);
  });

  it("13. evaluates movements for the requested wallet only, even when other wallets swap in the same tx", () => {
    // OTHER is the tx sender; W receives TOKEN_A and pays USDC — and OTHER's
    // own side-transfers to OTHER2 must not influence W's classification.
    const r = classify({
      tx: tx({ from: OTHER, to: POOL }),
      receipt: receipt("0x1", [
        transferLog(USDC.address, W, POOL, 50n * Q),
        transferLog(TOKEN_A, POOL, W, 5n * T),
        transferLog(TOKEN_B, OTHER, OTHER2, 999n * T), // third-party noise
        transferLog(USDC.address, OTHER, OTHER2, 999n * Q), // third-party noise
      ]),
    });
    expect(r.classification).toBe("BUY");
    expect(r.tokenIn?.asset).toBe(TOKEN_A);
    expect(r.quoteValue).toBe(50);
    // And a sell executed by a bot on behalf of W (W is not the sender) is still SELL:
    const sell = classify({
      tx: tx({ from: OTHER, to: POOL }),
      receipt: receipt("0x1", [transferLog(TOKEN_A, W, POOL, 5n * T), transferLog(USDC.address, POOL, W, 50n * Q)]),
    });
    expect(sell.classification).toBe("SELL");
  });
});

describe("14. per-chain configuration (Ethereum, BNB Chain, Base)", () => {
  const cases = [
    { chainId: "ethereum" as const, quote: USDC, native: "ETH" },
    { chainId: "bsc" as const, quote: USDT_BSC, native: "BNB" },
    { chainId: "base" as const, quote: USDC_BASE, native: "ETH" },
  ];
  for (const { chainId, quote, native } of cases) {
    it(`classifies a stablecoin BUY on ${chainId} using that chain's quote config`, () => {
      const r = classify({
        chainId,
        nativeSymbol: native,
        receipt: receipt("0x1", [
          transferLog(quote.address, W, POOL, 10n * 10n ** BigInt(quote.decimals)),
          transferLog(TOKEN_A, POOL, W, 2n * T),
        ]),
      });
      expect(r.classification).toBe("BUY");
      expect(r.quoteCurrency).toBe(quote.symbol);
      expect(r.quoteValue).toBe(10);
    });
  }

  it("exposes lowercase, canonical, distinct quote addresses on every chain", () => {
    for (const chainId of ["ethereum", "bsc", "base"] as const) {
      const list = QUOTE_ASSETS[chainId];
      expect(list.length).toBeGreaterThanOrEqual(2);
      for (const q of list) {
        expect(q.address).toBe(q.address.toLowerCase());
        expect(q.address).toMatch(/^0x[0-9a-f]{40}$/);
        expect(q.decimals).toBeGreaterThan(0);
        expect(q.symbol.length).toBeGreaterThan(0);
      }
      const addresses = new Set(list.map((q) => q.address));
      expect(addresses.size).toBe(list.length);
      // Each chain must define its own wrapped native as a quote asset.
      expect(list.some((q) => q.kind === "wrapped-native")).toBe(true);
    }
  });
});

describe("flow computation guards", () => {
  it("ignores zero-value and malformed logs instead of guessing", () => {
    const flows = computeWalletFlows(W, tx({}), receipt("0x1", [
      transferLog(TOKEN_A, W, POOL, 0n), // zero value — ignored
      { address: TOKEN_A, topics: [TRANSFER_TOPIC0, pad(W)], data: hex(T) }, // missing `to` topic — ignored
      { address: TOKEN_A, topics: [TRANSFER_TOPIC0, pad(W), pad(POOL)], data: "0x!!" }, // malformed data — skipped
    ]), []);
    expect(flows.size).toBe(0);
  });

  it("keeps top-level native value and internal native transfers directional, not summed", () => {
    const flows = computeWalletFlows(
      W,
      tx({ value: 1n * ETH }),
      receipt("0x1", []),
      [{ from: POOL, to: W, value: 2n * ETH, hash: "0xh" }],
    );
    const native = flows.get("native")!;
    expect(native.grossOut).toBe(1n * ETH);
    expect(native.grossIn).toBe(2n * ETH);
  });
});
