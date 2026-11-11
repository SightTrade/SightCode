import { createPublicClient, http, encodeFunctionData, type Chain } from "viem";
import { mainnet, base, bsc } from "viem/chains";

/**
 * EVM DEX quoting via established AMM V2 routers.
 *
 * Router addresses are the canonical, widely documented deployments:
 *  - Ethereum: Uniswap V2 Router02 (0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D)
 *  - BNB Chain: PancakeSwap V2 Router (0x10ED43C718714eb63d5aA57B78B54704E256024E)
 *  - Base: Uniswap V2 Router02 deployment documented by Uniswap for Base
 *
 * Every quote first verifies the router contract EXISTS on the configured RPC
 * (eth_getCode). If no code is present the chain's router is treated as
 * unverified and quoting is refused — nothing is fabricated.
 */
export type EvmSwapChain = "ethereum" | "base" | "bsc";

export interface V2RouterConfig {
  router: `0x${string}`;
  /** Wrapped native token (WETH9 / WBNB). */
  wnative: `0x${string}`;
  venue: string;
}

export const V2_ROUTERS: Record<EvmSwapChain, V2RouterConfig> = {
  ethereum: {
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    wnative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    venue: "Uniswap V2",
  },
  bsc: {
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    wnative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    venue: "PancakeSwap V2",
  },
  base: {
    router: "0x4752ba5DBc23f44D87826276bf6Fd6b1C372aD24",
    wnative: "0x4200000000000000000000000000000000000006",
    venue: "Uniswap V2 (Base)",
  },
};

const VIEM_CHAINS: Record<EvmSwapChain, Chain> = { ethereum: mainnet, base, bsc };

const V2_ROUTER_ABI = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export interface V2Quote {
  router: string;
  wnative: string;
  venue: string;
  /** Verified live: the router contract was found at the configured RPC. */
  routerVerified: boolean;
  path: string[];
  amountInRaw: string;
  amountOutRaw: string;
  amountOutMinRaw: string;
  tokenDecimals: number | null;
  tokenSymbol: string | null;
  /** V2 getAmountsOut cannot report price impact honestly — the UI shows "—". */
  priceImpactPct: null;
}

export interface V2QuoteError extends Error {
  status: number;
}

function fail(message: string, status: number): never {
  const err = new Error(message) as V2QuoteError;
  err.status = status;
  throw err;
}

export function clientFor(chain: EvmSwapChain, rpcUrl: string) {
  return createPublicClient({ chain: VIEM_CHAINS[chain], transport: http(rpcUrl) });
}

/** viem validates EIP-55 checksum casing on mixed-case addresses; lowercase hex is always accepted. */
function lc(a: string): `0x${string}` {
  return a.toLowerCase() as `0x${string}`;
}

/**
 * Quote a native→token (side "buy") or token→native (side "sell") swap on the
 * chain's V2 router. Verifies the router is deployed before quoting.
 */
export async function getV2Quote(params: {
  chain: EvmSwapChain;
  rpcUrl: string;
  token: string;
  amountRaw: string;
  side: "buy" | "sell";
  slippageBps: number;
}): Promise<V2Quote> {
  const { chain, rpcUrl, token, amountRaw, side, slippageBps } = params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(token)) fail("token must be a valid EVM address", 400);
  if (!/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) fail("amountRaw must be a positive integer string", 400);
  const tokenLc = lc(token);
  const cfg = V2_ROUTERS[chain];
  const client = clientFor(chain, rpcUrl);

  // Verify the router contract is actually deployed at this RPC before quoting.
  const code = await client.getBytecode({ address: lc(cfg.router) });
  if (!code || code === "0x") {
    fail(`Router for ${chain} is not verifiable at the configured RPC — trading disabled for this chain`, 501);
  }

  // Token metadata (best-effort; non-critical for quoting).
  let tokenDecimals: number | null = null;
  let tokenSymbol: string | null = null;
  try {
    const decimals = await client.readContract({
      address: tokenLc,
      abi: ERC20_ABI,
      functionName: "decimals",
    });
    tokenDecimals = decimals;
    const symbol = await client
      .readContract({ address: tokenLc, abi: ERC20_ABI, functionName: "symbol" })
      .catch(() => null);
    tokenSymbol = symbol;
  } catch {
    // Non-standard tokens may not expose decimals — quoting still proceeds.
  }

  const path = side === "buy" ? [lc(cfg.wnative), tokenLc] : [tokenLc, lc(cfg.wnative)];

  const amounts = await client
    .readContract({
      address: lc(cfg.router),
      abi: V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [BigInt(amountRaw), path],
    })
    .catch(() => {
      // A revert here almost always means no V2 pair exists for this token
      // pair (or zero liquidity) — surface a clean message instead of a raw
      // viem revert dump.
      fail(
        `No V2 liquidity or valid route for ${tokenLc} on ${chain} — quote reverted`,
        502,
      );
    });
  const amountOutRaw = amounts[amounts.length - 1];
  if (amountOutRaw <= 0n) fail("Swap route returned zero output — no liquidity for this pair", 502);

  const slipFactor = BigInt(10_000 - Math.min(Math.max(slippageBps, 0), 3000));
  const amountOutMinRaw = (amountOutRaw * slipFactor) / 10_000n;

  return {
    router: cfg.router,
    wnative: cfg.wnative,
    venue: cfg.venue,
    routerVerified: true,
    path: path.map((p) => p as string),
    amountInRaw: amountRaw,
    amountOutRaw: amountOutRaw.toString(),
    amountOutMinRaw: amountOutMinRaw.toString(),
    tokenDecimals,
    tokenSymbol,
    priceImpactPct: null,
  };
}

const SWAP_ABI = [
  {
    type: "function",
    name: "swapExactETHForTokensSupportingFeeOnTransferTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForETHSupportingFeeOnTransferTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * Encode the swap calldata the wallet will sign for a V2 router trade.
 * Buys are native→token (payable); sells are token→native.
 */
export function encodeV2SwapCalldata(params: {
  side: "buy" | "sell";
  amountInRaw: string;
  amountOutMinRaw: string;
  path: string[];
  to: string;
  deadlineSeconds: number;
}): { data: string; value: string } {
  const { side, amountInRaw, amountOutMinRaw, path, to, deadlineSeconds } = params;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
  const pathLc = path.map((p) => lc(p));
  const toLc = lc(to);
  if (side === "buy") {
    const data = encodeFunctionData({
      abi: SWAP_ABI,
      functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
      args: [BigInt(amountOutMinRaw), pathLc, toLc, deadline],
    });
    return { data, value: amountInRaw };
  }
  const data = encodeFunctionData({
    abi: SWAP_ABI,
    functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
    args: [BigInt(amountInRaw), BigInt(amountOutMinRaw), pathLc, toLc, deadline],
  });
  return { data, value: "0" };
}

/** Approve calldata for selling a token through the router. */
export function encodeApproveCalldata(spender: string, amountRaw: string): string {
  return encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spender as `0x${string}`, BigInt(amountRaw)],
  });
}