import { describe, expect, it } from "vitest";
import { detectAddress, isSolanaAddress, isEvmAddress, getChain, CHAINS, TRADABLE_CHAINS, SOLANA_MINTS } from "./chains";

describe("address detection", () => {
  it("detects EVM addresses case-insensitively", () => {
    expect(isEvmAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toBe(true);
    expect(detectAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toEqual({
      type: "evm-address",
      value: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    });
  });
  it("detects Solana-shaped addresses", () => {
    expect(isSolanaAddress(SOLANA_MINTS.SOL)).toBe(true);
    expect(detectAddress(SOLANA_MINTS.SOL)).toEqual({ type: "solana-mint", value: SOLANA_MINTS.SOL });
  });
  it("marks tx-signature-length strings as ambiguous, never guessing", () => {
    const sig = "5".repeat(87); // base58-ish length of a Solana signature
    expect(detectAddress(sig)).toEqual({ type: "ambiguous", value: sig });
  });
  it("marks 32-byte EVM hashes as ambiguous", () => {
    const hash = `0x${"a".repeat(64)}`;
    expect(detectAddress(hash)).toEqual({ type: "ambiguous", value: hash });
  });
  it("rejects plain text", () => {
    expect(detectAddress("bonk")).toBeNull();
    expect(isSolanaAddress("bonk")).toBe(false);
  });
});

describe("chain registry integrity", () => {
  it("has every required chain with required fields", () => {
    for (const [id, c] of Object.entries(CHAINS)) {
      expect(c.id).toBe(id);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.nativeToken.decimals).toBeGreaterThan(0);
    }
  });
  it("Robinhood Chain is explicitly unconfigured", () => {
    expect(CHAINS.robinhood.status).toBe("unconfigured");
    expect(CHAINS.robinhood.geckoNetwork).toBeNull();
    expect(CHAINS.robinhood.dexscreenerChain).toBeNull();
    expect(CHAINS.robinhood.evmChainId).toBeNull();
  });
  it("tradable chains exclude unconfigured ones", () => {
    expect(TRADABLE_CHAINS).not.toContain("robinhood");
    expect(TRADABLE_CHAINS).toContain("solana");
  });
  it("getChain returns null for unknown ids", () => {
    expect(getChain("solana")).not.toBeNull();
    expect(getChain("fantom")).toBeNull();
    expect(getChain(null)).toBeNull();
  });
  it("EVM chains carry verified chain ids", () => {
    expect(CHAINS.ethereum.evmChainId).toBe(1);
    expect(CHAINS.base.evmChainId).toBe(8453);
    expect(CHAINS.bsc.evmChainId).toBe(56);
  });
});