/**
 * EVM swap-level transaction classification (evidence-based).
 *
 * Classification is derived exclusively from on-chain evidence for the
 * REQUESTED wallet: ERC-20 Transfer logs in the transaction receipt, the
 * top-level native value, and (when the provider supports it) internal native
 * transfers. Fee payer, sender identity, router presence, and single transfers
 * are never sufficient on their own — see the rules below.
 *
 * Classification rules:
 *   BUY        net inflow of a non-quote token + net outflow of a supported
 *              quote asset (stablecoin / wrapped native / native coin).
 *   SELL       mirror of BUY.
 *   TRANSFER   a single asset moving one direction with no counter-leg, or a
 *              native <-> wrapped-native wrap/unwrap pair.
 *   LIQUIDITY  multi-asset 2:1 patterns consistent with liquidity add/remove
 *              (classic pair-pool add: two assets in, LP token out; remove:
 *              LP token in, two assets out), or same-token in-and-out residue.
 *   UNKNOWN    reverted transactions, missing receipts, token-to-token swaps
 *              with no supported quote leg, split swaps vs zaps, and any other
 *              ambiguous movement set — always with a documented reason.
 *
 * Multi-hop support: assets that both enter and leave the wallet within one
 * transaction with an approximately net-zero balance (within 10% tolerance for
 * fee-on-transfer / dust residue) are treated as intermediary route legs and
 * excluded from the BUY/SELL determination — the target token never has to
 * touch the router directly.
 *
 * Fee-on-transfer caveat: Transfer log values are pre-fee; realized amounts
 * for FoT tokens may be slightly overstated. Classification direction is
 * unaffected; this is documented rather than hidden.
 *
 * USD valuation is intentionally not computed (no historical price source):
 * quoteValue is expressed in the quote asset's own units only.
 */

/** Canonical ERC-20 Transfer event signature hash. */
export const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type EvmChainId = "ethereum" | "bsc" | "base";

export interface QuoteAsset {
  /** Lowercase token contract address. */
  address: string;
  symbol: string;
  decimals: number;
  kind: "stablecoin" | "wrapped-native";
}

/** Per-chain supported quote assets — canonical deployments, never assumed identical across chains. */
export const QUOTE_ASSETS: Record<EvmChainId, QuoteAsset[]> = {
  ethereum: [
    { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", decimals: 6, kind: "stablecoin" },
    { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT", decimals: 6, kind: "stablecoin" },
    { address: "0x6b175474e89094c44da98b954eedeac495271d0f", symbol: "DAI", decimals: 18, kind: "stablecoin" },
    { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH", decimals: 18, kind: "wrapped-native" },
  ],
  bsc: [
    { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", decimals: 18, kind: "stablecoin" },
    { address: "0x8ac76a51cc950d9822d165b182e8fcfc4d5ed0b7", symbol: "USDC", decimals: 18, kind: "stablecoin" },
    { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", symbol: "BUSD", decimals: 18, kind: "stablecoin" },
    { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "WBNB", decimals: 18, kind: "wrapped-native" },
  ],
  base: [
    { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", decimals: 6, kind: "stablecoin" },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, kind: "wrapped-native" },
  ],
};

export type SwapClassification = "BUY" | "SELL" | "TRANSFER" | "LIQUIDITY" | "UNKNOWN";
export type ClassificationConfidence = "high" | "medium" | "low";

export interface ClassifiedToken {
  /** Lowercase token address, or "native" for the chain's native coin. */
  asset: string;
  symbol: string | null;
  /** Absolute human-readable quantity moved by the wallet (net for swaps). */
  amount: number | null;
}

export interface EvmClassification {
  classification: SwapClassification;
  classificationConfidence: ClassificationConfidence;
  classificationReason: string;
  tokenIn: ClassifiedToken | null;
  tokenOut: ClassifiedToken | null;
  /** Human-readable quantity of the quote asset; only when a single quote asset moved. */
  quoteValue: number | null;
  quoteCurrency: string | null;
}

export interface EvmTxCore {
  from: string;
  to: string | null;
  value: bigint;
}

export interface EvmReceiptCore {
  /** "0x1" = success, "0x0" = reverted, null = unknown. */
  status: string | null;
  logs: { address: string; topics: (string | null)[]; data: string }[];
}

export interface InternalNativeTransfer {
  from: string;
  to: string;
  value: bigint;
  /** Lowercase tx hash — lets callers group internal transfers by transaction. */
  hash: string;
}

const NATIVE = "native";

function isQuoteAsset(chainId: EvmChainId, asset: string): QuoteAsset | null {
  return QUOTE_ASSETS[chainId].find((q) => q.address === asset) ?? null;
}

/** Native coin is quote-equivalent (it is the underlying of the wrapped native). */
export interface AssetFlow {
  grossIn: bigint;
  grossOut: bigint;
}

/**
 * Compute the wallet's gross in/out flows per asset from on-chain evidence.
 * Only movements where the requested wallet is sender or receiver count —
 * transactions involving other wallets are evaluated from this wallet's perspective.
 */
export function computeWalletFlows(
  wallet: string,
  tx: EvmTxCore | null,
  receipt: EvmReceiptCore | null,
  internalNative: InternalNativeTransfer[],
): Map<string, AssetFlow> {
  const flows = new Map<string, AssetFlow>();
  const bump = (asset: string, dir: "in" | "out", amount: bigint) => {
    if (amount <= 0n) return;
    const cur = flows.get(asset) ?? { grossIn: 0n, grossOut: 0n };
    if (dir === "in") cur.grossIn += amount;
    else cur.grossOut += amount;
    flows.set(asset, cur);
  };

  const w = wallet.toLowerCase();
  // Top-level native value (the wallet as sender spends; as recipient gains).
  if (tx && tx.value > 0n) {
    if (tx.from.toLowerCase() === w) bump(NATIVE, "out", tx.value);
    if (tx.to && tx.to.toLowerCase() === w) bump(NATIVE, "in", tx.value);
  }
  // Internal native transfers (e.g. a pool returning ETH to the wallet).
  for (const t of internalNative) {
    if (t.value <= 0n) continue;
    if (t.from.toLowerCase() === w) bump(NATIVE, "out", t.value);
    if (t.to.toLowerCase() === w) bump(NATIVE, "in", t.value);
  }
  // ERC-20 Transfer logs.
  if (receipt) {
    for (const log of receipt.logs) {
      if (!log.topics || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC0) continue;
      if (log.topics.length < 3) continue;
      const from = `0x${(log.topics[1] ?? "").slice(-40)}`.toLowerCase();
      const to = `0x${(log.topics[2] ?? "").slice(-40)}`.toLowerCase();
      const asset = log.address.toLowerCase();
      let raw = 0n;
      try {
        raw = BigInt(log.data === "0x" || log.data === "" ? "0" : log.data);
      } catch {
        continue; // malformed data — skip this log rather than guess
      }
      if (raw <= 0n) continue;
      if (from === w) bump(asset, "out", raw);
      if (to === w) bump(asset, "in", raw);
    }
  }
  return flows;
}

interface NetLeg {
  asset: string;
  flow: AssetFlow;
  net: bigint; // grossIn - grossOut (positive = net inflow)
  intermediary: boolean;
}

function isQuoteLike(chainId: EvmChainId, asset: string): boolean {
  return asset === NATIVE || isQuoteAsset(chainId, asset) !== null;
}

/**
 * Core classifier. Pure function over the supplied evidence — no RPC here, so
 * it is directly unit-testable against mocked transactions and receipts.
 */
export function classifyEvmTransaction(input: {
  wallet: string;
  chainId: EvmChainId;
  nativeSymbol: string;
  tx: EvmTxCore | null;
  receipt: EvmReceiptCore | null;
  internalNative: InternalNativeTransfer[];
}): EvmClassification {
  const { wallet, chainId, nativeSymbol, tx, receipt, internalNative } = input;

  if (!receipt) {
    return fail("receipt unavailable from the RPC provider — no Transfer evidence to evaluate");
  }
  if (receipt.status !== null && receipt.status !== "0x1" && receipt.status !== "0x01") {
    return fail("transaction reverted on-chain — no balance changes were applied");
  }

  const flows = computeWalletFlows(wallet, tx, receipt, internalNative);
  if (flows.size === 0) {
    return fail("no token or native movements for this wallet in the transaction evidence");
  }

  // Intermediary detection: an asset that both entered and left the wallet with
  // an approximately net-zero balance is a multi-hop route leg, not a swap leg.
  const legs: NetLeg[] = [];
  for (const [asset, flow] of flows) {
    const net = flow.grossIn - flow.grossOut;
    const larger = flow.grossIn > flow.grossOut ? flow.grossIn : flow.grossOut;
    const smaller = flow.grossIn > flow.grossOut ? flow.grossOut : flow.grossIn;
    // Net-zero within 10% of the larger flow (FoT/dust tolerant).
    const intermediary = flow.grossIn > 0n && flow.grossOut > 0n && smaller * 10n >= larger * 9n;
    legs.push({ asset, flow, net, intermediary });
  }
  const inLegs = legs.filter((l) => !l.intermediary && l.flow.grossIn > 0n);
  const outLegs = legs.filter((l) => !l.intermediary && l.flow.grossOut > 0n);
  const hopCount = legs.filter((l) => l.intermediary).length;

  // Native <-> wrapped-native wrap/unwrap is not a swap.
  const wrapPair =
    inLegs.length === 1 &&
    outLegs.length === 1 &&
    ((inLegs[0].asset === NATIVE && isQuoteAsset(chainId, outLegs[0].asset)?.kind === "wrapped-native") ||
      (outLegs[0].asset === NATIVE && isQuoteAsset(chainId, inLegs[0].asset)?.kind === "wrapped-native"));
  if (wrapPair) {
    return {
      classification: "TRANSFER",
      classificationConfidence: "high",
      classificationReason: "native <-> wrapped-native wrap/unwrap — not a swap",
      tokenIn: legToToken(inLegs[0], chainId, nativeSymbol),
      tokenOut: legToToken(outLegs[0], chainId, nativeSymbol),
      quoteValue: null,
      quoteCurrency: null,
    };
  }

  const netInNonQuote = inLegs.filter((l) => !isQuoteLike(chainId, l.asset));
  const netOutNonQuote = outLegs.filter((l) => !isQuoteLike(chainId, l.asset));
  const quoteInLegs = inLegs.filter((l) => isQuoteLike(chainId, l.asset));
  const quoteOutLegs = outLegs.filter((l) => isQuoteLike(chainId, l.asset));
  const distinctAssets = new Set([...inLegs, ...outLegs].map((l) => l.asset)).size;

  // BUY: non-quote token(s) in, quote asset(s) out.
  if (netInNonQuote.length >= 1 && quoteOutLegs.length >= 1 && netOutNonQuote.length === 0 && quoteInLegs.length === 0) {
    if (netInNonQuote.length > 1) {
      return fail(
        `wallet received ${netInNonQuote.length} distinct non-quote tokens against a single quote outflow — split swap or liquidity zap; insufficient evidence to attribute`,
        "medium",
      );
    }
    const quoteTotal = singleQuoteTotals(quoteOutLegs);
    return {
      classification: "BUY",
      classificationConfidence: hopCount > 0 ? "medium" : "high",
      classificationReason:
        `wallet spent ${describeQuoteLegs(quoteOutLegs, chainId, nativeSymbol)} and received ${describeTokenLeg(netInNonQuote[0], chainId, nativeSymbol)}` +
        (hopCount > 0 ? ` (multi-hop: ${hopCount} intermediary route leg${hopCount === 1 ? "" : "s"} excluded)` : ""),
      tokenIn: legToToken(netInNonQuote[0], chainId, nativeSymbol),
      tokenOut: legToToken(quoteOutLegs[0], chainId, nativeSymbol),
      quoteValue: quoteTotal?.value ?? null,
      quoteCurrency: quoteTotal?.symbol ?? null,
    };
  }

  // SELL: non-quote token(s) out, quote asset(s) in.
  if (netOutNonQuote.length >= 1 && quoteInLegs.length >= 1 && netInNonQuote.length === 0 && quoteOutLegs.length === 0) {
    if (netOutNonQuote.length > 1) {
      return fail(
        `wallet sent ${netOutNonQuote.length} distinct non-quote tokens against a single quote inflow — split swap or liquidity zap; insufficient evidence to attribute`,
        "medium",
      );
    }
    const quoteTotal = singleQuoteTotals(quoteInLegs);
    return {
      classification: "SELL",
      classificationConfidence: hopCount > 0 ? "medium" : "high",
      classificationReason:
        `wallet sold ${describeTokenLeg(netOutNonQuote[0], chainId, nativeSymbol)} and received ${describeQuoteLegs(quoteInLegs, chainId, nativeSymbol)}` +
        (hopCount > 0 ? ` (multi-hop: ${hopCount} intermediary route leg${hopCount === 1 ? "" : "s"} excluded)` : ""),
      tokenIn: legToToken(quoteInLegs[0], chainId, nativeSymbol),
      tokenOut: legToToken(netOutNonQuote[0], chainId, nativeSymbol),
      quoteValue: quoteTotal?.value ?? null,
      quoteCurrency: quoteTotal?.symbol ?? null,
    };
  }

  // LIQUIDITY: 2:1 multi-asset patterns (classic pair-pool add/remove).
  if (distinctAssets >= 3 && (inLegs.length === 1 || outLegs.length === 1)) {
    return {
      classification: "LIQUIDITY",
      classificationConfidence: "medium",
      classificationReason: `${inLegs.length} asset${inLegs.length === 1 ? "" : "s"} in / ${outLegs.length} asset${outLegs.length === 1 ? "" : "s"} out across ${distinctAssets} distinct tokens — consistent with liquidity add/remove (LP token not identified); no ordinary swap has this movement shape`,
      tokenIn: inLegs[0] ? legToToken(inLegs[0], chainId, nativeSymbol) : null,
      tokenOut: outLegs[0] ? legToToken(outLegs[0], chainId, nativeSymbol) : null,
      quoteValue: null,
      quoteCurrency: null,
    };
  }

  // Single-asset movement with no counter-leg.
  if (inLegs.length === 1 && outLegs.length === 0) {
    return {
      classification: "TRANSFER",
      classificationConfidence: "high",
      classificationReason: `single asset inflow (${describeTokenLeg(inLegs[0], chainId, nativeSymbol)}) with no swap counter-leg in the transaction evidence`,
      tokenIn: legToToken(inLegs[0], chainId, nativeSymbol),
      tokenOut: null,
      quoteValue: null,
      quoteCurrency: null,
    };
  }
  if (outLegs.length === 1 && inLegs.length === 0) {
    return {
      classification: "TRANSFER",
      classificationConfidence: "high",
      classificationReason: `single asset outflow (${describeTokenLeg(outLegs[0], chainId, nativeSymbol)}) with no swap counter-leg in the transaction evidence`,
      tokenIn: null,
      tokenOut: legToToken(outLegs[0], chainId, nativeSymbol),
      quoteValue: null,
      quoteCurrency: null,
    };
  }

  // Token-to-token swap without a supported quote leg.
  if (netInNonQuote.length >= 1 && netOutNonQuote.length >= 1) {
    return fail(
      `token-to-token movement (${describeTokenLeg(netOutNonQuote[0], chainId, nativeSymbol)} -> ${describeTokenLeg(netInNonQuote[0], chainId, nativeSymbol)}) with no supported quote asset leg`,
      "medium",
    );
  }

  // All movements net to ~zero — the wallet acted as a pass-through route
  // (typical for DEX routers/aggregators), or evidence is genuinely ambiguous.
  if (hopCount > 0 && inLegs.length === 0 && outLegs.length === 0) {
    return fail(
      `all ${hopCount} wallet movement${hopCount === 1 ? "" : "s"} in this transaction net to approximately zero — pass-through/route-leg behavior with no net swap evidence`,
      "medium",
    );
  }
  return fail(
    `ambiguous movement set (${inLegs.length} in / ${outLegs.length} out across ${distinctAssets} assets${hopCount > 0 ? `, ${hopCount} intermediary leg${hopCount === 1 ? "" : "s"} excluded` : ""}) — insufficient evidence for reliable classification`,
  );
}

function fail(reason: string, confidence: ClassificationConfidence = "low"): EvmClassification {
  return {
    classification: "UNKNOWN",
    classificationConfidence: confidence,
    classificationReason: reason,
    tokenIn: null,
    tokenOut: null,
    quoteValue: null,
    quoteCurrency: null,
  };
}

function legToToken(leg: NetLeg, chainId: EvmChainId, nativeSymbol: string): ClassifiedToken {
  if (leg.asset === NATIVE) {
    return { asset: NATIVE, symbol: nativeSymbol, amount: human(abs(leg.net), 18) };
  }
  const q = isQuoteAsset(chainId, leg.asset);
  return {
    asset: leg.asset,
    symbol: q?.symbol ?? null,
    amount: q ? human(abs(leg.net), q.decimals) : null,
  };
}

function describeTokenLeg(leg: NetLeg, chainId: EvmChainId, nativeSymbol: string): string {
  const t = legToToken(leg, chainId, nativeSymbol);
  const label = t.symbol ?? `token ${short(t.asset)}`;
  return `${t.amount !== null ? t.amount : "an amount of"} ${label}`;
}

function describeQuoteLegs(legs: NetLeg[], chainId: EvmChainId, nativeSymbol: string): string {
  return legs.map((l) => describeTokenLeg(l, chainId, nativeSymbol)).join(" + ");
}

/** quoteValue only when exactly one quote asset moved — multiple currencies are never summed. */
function singleQuoteTotals(legs: NetLeg[]): { value: number; symbol: string } | null {
  if (legs.length !== 1) return null;
  const leg = legs[0];
  if (leg.asset === NATIVE) return { value: human(abs(leg.net), 18), symbol: "native" };
  const q = isQuoteAsset("ethereum", leg.asset) ?? isQuoteAsset("bsc", leg.asset) ?? isQuoteAsset("base", leg.asset);
  if (!q) return null;
  return { value: human(abs(leg.net), q.decimals), symbol: q.symbol };
}

function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}

function human(raw: bigint, decimals: number): number {
  const d = BigInt(10) ** BigInt(decimals);
  return Number(raw / d) + Number(raw % d) / Number(d);
}

function short(asset: string): string {
  return asset === NATIVE ? "native" : `${asset.slice(0, 6)}…${asset.slice(-4)}`;
}
