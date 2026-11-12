import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuredSightTokenMint,
  getSightTokenInfo,
  isOfficialSightMintLive,
  SIGHT_TOKEN_PLACEHOLDER_MINT,
} from "./sightToken";

/** Well-known, on-chain verified Solana mint (wrapped SOL) — used only as a
 * stand-in for "a real configured mint" in tests. Never substituted by the
 * helper itself. */
const REAL_MINT = "So11111111111111111111111111111111111111112";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("official SIGHT token configuration", () => {
  it("falls back to the declared placeholder when the variable is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGHT_TOKEN_MINT", "");
    expect(configuredSightTokenMint()).toBe(SIGHT_TOKEN_PLACEHOLDER_MINT);
    const info = getSightTokenInfo();
    expect(info.mint).toBe(SIGHT_TOKEN_PLACEHOLDER_MINT);
    expect(info.isPlaceholder).toBe(true);
  });

  it("trims accidental whitespace from the configured value", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGHT_TOKEN_MINT", `   ${REAL_MINT}  `);
    expect(configuredSightTokenMint()).toBe(REAL_MINT);
    expect(getSightTokenInfo().mint).toBe(REAL_MINT);
  });

  it("recognizes the placeholder and never presents it as a live official mint", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGHT_TOKEN_MINT", SIGHT_TOKEN_PLACEHOLDER_MINT);
    const info = getSightTokenInfo();
    expect(info.isPlaceholder).toBe(true);
    expect(isOfficialSightMintLive()).toBe(false);
  });

  it("accepts a real configured mint with its shortened display form", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGHT_TOKEN_MINT", REAL_MINT);
    const info = getSightTokenInfo();
    expect(info.isPlaceholder).toBe(false);
    expect(info.isValid).toBe(true);
    expect(info.mint).toBe(REAL_MINT);
    expect(info.short).toBe("So11…1112");
    expect(isOfficialSightMintLive()).toBe(true);
  });

  it("reports an invalid configured value without substituting any other address", () => {
    vi.stubEnv("NEXT_PUBLIC_SIGHT_TOKEN_MINT", "not-a-valid-solana-mint!");
    const info = getSightTokenInfo();
    expect(info.isValid).toBe(false);
    expect(info.isPlaceholder).toBe(false);
    expect(info.short).toBe("");
    expect(info.mint).toBe("not-a-valid-solana-mint!");
    expect(isOfficialSightMintLive()).toBe(false);
  });
});
