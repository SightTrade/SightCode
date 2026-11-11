import { describe, expect, it } from "vitest";
import { fmtUsd, fmtCompact, fmtPct, fmtAge, shortAddr, fromRaw, toRaw, sanitizeText, isSafeImageUrl, decimalsForPrice, fmtPrice } from "./format";

describe("fmtUsd", () => {
  it("formats null/undefined as dash", () => {
    expect(fmtUsd(null)).toBe("—");
    expect(fmtUsd(undefined)).toBe("—");
    expect(fmtUsd(Number.NaN)).toBe("—");
  });
  it("uses compact notation for large values", () => {
    expect(fmtUsd(1_500_000)).toBe("$1.5M");
    expect(fmtUsd(2_300_000_000)).toBe("$2.3B");
  });
  it("formats small values with precision", () => {
    expect(fmtUsd(0.000042)).toBe("$0.000042");
  });
  it("adds + sign when signed option set", () => {
    expect(fmtUsd(1234, { signed: true })).toBe("+$1,234");
  });
});

describe("fmtCompact / fmtPct", () => {
  it("compacts thousands and millions", () => {
    expect(fmtCompact(45_000)).toBe("45K");
    expect(fmtCompact(1_250_000)).toBe("1.25M");
    expect(fmtCompact(-980)).toBe("-980");
  });
  it("formats percentages with sign", () => {
    expect(fmtPct(12.345)).toBe("+12.35%");
    expect(fmtPct(-3.2)).toBe("-3.20%");
  });
});

describe("fmtAge", () => {
  it("formats durations", () => {
    expect(fmtAge(45_000)).toBe("45s");
    expect(fmtAge(180_000)).toBe("3m");
    expect(fmtAge(7_200_000)).toBe("2h");
    expect(fmtAge(172_800_000)).toBe("2d");
  });
});

describe("raw amount conversions", () => {
  it("converts raw units to human", () => {
    expect(fromRaw("1500000000", 9)).toBeCloseTo(1.5, 10);
    expect(fromRaw("123456", 3)).toBeCloseTo(123.456, 10);
    expect(fromRaw("100", null)).toBeNull();
  });
  it("converts human amounts to raw", () => {
    expect(toRaw("1.5", 9)).toBe("1500000000");
    expect(toRaw("0.001", 6)).toBe("1000");
    expect(toRaw("-1", 9)).toBeNull();
    expect(toRaw("abc", 9)).toBeNull();
  });
});

describe("address/text safety", () => {
  it("shortens long addresses", () => {
    expect(shortAddr("So11111111111111111111111111111111111111112")).toBe("So11…1112");
    expect(shortAddr("abc")).toBe("abc");
  });
  it("strips markup from external text", () => {
    expect(sanitizeText("<script>alert(1)</script> hello")).toBe("scriptalert(1)/script hello");
  });
  it("only allows http(s) image URLs", () => {
    expect(isSafeImageUrl("https://example.com/a.png")).toBe(true);
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("data:text/html,x")).toBe(false);
    expect(isSafeImageUrl(null)).toBe(false);
  });
});

describe("price formatting", () => {
  it("chooses decimals by magnitude", () => {
    expect(decimalsForPrice(1.23)).toBe(2);
    expect(decimalsForPrice(0.0123)).toBe(4);
    expect(decimalsForPrice(0.000012345)).toBe(9);
    expect(fmtPrice(0.000012345)).toBe("$0.000012345");
  });
});