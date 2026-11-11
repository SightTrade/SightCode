import type { RiskFinding, RiskReview, TokenSummary } from "./types";
import type { HolderConcentration, MintInfo } from "./providers/solanaRpc";
import { CHAINS } from "./chains";

/**
 * Token risk review assembled ONLY from data we actually hold.
 * No composite "safety score" is emitted (score stays null) because a
 * documented methodology does not exist yet — every finding is traceable.
 */
export function buildRiskReview(params: {
  summary: TokenSummary;
  mintInfo: MintInfo | null;
  holders: HolderConcentration | null;
  organicScore: number | null;
  poolCount: number;
  explorerKeyAvailable: boolean;
  now?: number;
}): RiskReview {
  const { summary, mintInfo, holders, organicScore, poolCount, explorerKeyAvailable, now = Date.now() } = params;
  const findings: RiskFinding[] = [];
  const notes: string[] = [];
  const chain = CHAINS[summary.chain];

  // ---- Liquidity depth (from provider pair data) ----
  const liq = summary.liquidityUsd;
  if (liq !== null) {
    const level = liq < 10_000 ? "Low" : liq < 100_000 ? "Moderate" : "Healthy";
    findings.push({
      id: "liquidity",
      label: "Liquidity",
      severity: liq < 10_000 ? "warn" : liq < 100_000 ? "info" : "ok",
      detail: `${level} — pooled liquidity is ${liq < 100_000 ? "sensitive to price impact on medium trades" : "deeper; price impact is lower"}.`,
      source: `${summary.dataSource} (pool reserves)`,
    });
  } else {
    findings.push({
      id: "liquidity",
      label: "Liquidity",
      severity: "unknown",
      detail: "Unavailable — no liquidity figure from the market-data provider.",
      source: summary.dataSource,
    });
  }

  // ---- Holder concentration ----
  if (holders) {
    const sev = holders.top10SharePct > 70 ? "critical" : holders.top10SharePct > 40 ? "warn" : "info";
    findings.push({
      id: "holder-concentration",
      label: "Holder concentration",
      severity: sev,
      detail:
        `Top ${Math.min(10, holders.accountsExamined)} token accounts hold ${holders.top10SharePct.toFixed(1)}% of supply` +
        ` (largest: ${holders.top1SharePct.toFixed(1)}%). ${holders.note}`,
      source: "Solana RPC getTokenLargestAccounts",
    });
  } else if (chain.kind === "solana") {
    findings.push({
      id: "holder-concentration",
      label: "Holder concentration",
      severity: "unknown",
      detail: "Unavailable — RPC call failed or returned no data.",
      source: "Solana RPC",
    });
  } else {
    findings.push({
      id: "holder-concentration",
      label: "Holder concentration",
      severity: "unknown",
      detail:
        "Unavailable on EVM chains without an indexer or explorer API key." +
        (explorerKeyAvailable ? "" : " Configure an explorer API key to enable this check."),
      source: "not available",
    });
  }

  // ---- Contract permissions (Solana mint/freeze authorities; real on-chain facts) ----
  if (mintInfo) {
    if (mintInfo.mintAuthority) {
      findings.push({
        id: "mint-authority",
        label: "Mint authority",
        severity: "warn",
        detail: `Mint authority is ACTIVE (${mintInfo.mintAuthority}). New tokens can be created, diluting holders.`,
        source: "Solana RPC getParsedAccountInfo",
      });
    } else {
      findings.push({
        id: "mint-authority",
        label: "Mint authority",
        severity: "ok",
        detail: "Mint authority has been revoked. Supply cannot be inflated by minting.",
        source: "Solana RPC getParsedAccountInfo",
      });
    }
    if (mintInfo.freezeAuthority) {
      findings.push({
        id: "freeze-authority",
        label: "Freeze authority",
        severity: "critical",
        detail: `Freeze authority is ACTIVE (${mintInfo.freezeAuthority}). Token accounts can be frozen — sell ability can be blocked.`,
        source: "Solana RPC getParsedAccountInfo",
      });
    } else {
      findings.push({
        id: "freeze-authority",
        label: "Freeze authority",
        severity: "ok",
        detail: "Freeze authority has been revoked.",
        source: "Solana RPC getParsedAccountInfo",
      });
    }
  } else if (chain.kind === "evm" && !explorerKeyAvailable) {
    findings.push({
      id: "contract-permissions",
      label: "Contract permissions",
      severity: "unknown",
      detail:
        "Source-code verification and permission checks on this EVM chain require an explorer API key (Etherscan/BscScan/Basescan), which is not configured.",
      source: "not available",
    });
    notes.push("EVM contract risk checks are limited without an explorer API key.");
  }

  // ---- Venue exposure ----
  findings.push({
    id: "venues",
    label: "Trading venues",
    severity: poolCount > 1 ? "ok" : "info",
    detail:
      poolCount > 1
        ? `${poolCount} active liquidity pools found for this token across venues.`
        : poolCount === 1
          ? "Single active liquidity pool found. One venue means one exit path."
          : "No active pools found — the token may not be tradable yet.",
    source: `${summary.dataSource} (pair discovery)`,
  });

  // ---- Pool age ----
  if (summary.createdAt) {
    const ageDays = (now - summary.createdAt) / 86_400_000;
    findings.push({
      id: "pool-age",
      label: "Pool age",
      severity: ageDays < 1 ? "warn" : ageDays < 7 ? "info" : "ok",
      detail:
        `Liquidity pool created ${ageDays < 1 ? "less than a day" : ageDays.toFixed(1) + " days"} ago.` +
        (ageDays < 1 ? " Very new pools carry launch risk." : ""),
      source: `${summary.dataSource} (pool creation timestamp)`,
    });
  } else {
    findings.push({
      id: "pool-age",
      label: "Pool age",
      severity: "unknown",
      detail: "Pool creation time is not available from the data provider.",
      source: summary.dataSource,
    });
  }

  // ---- Provider organic score (third-party metric, clearly labeled) ----
  if (organicScore !== null) {
    findings.push({
      id: "provider-organic-score",
      label: "Third-party organic score",
      severity: "info",
      detail: `Jupiter organic score: ${organicScore.toFixed(0)}/100 — a provider-computed activity metric, not a safety guarantee.`,
      source: "Jupiter Tokens API",
    });
  }

  notes.push(
    "This review lists observed facts only. Absence of warnings does not mean a token is safe. No composite score is issued because no documented methodology exists.",
  );

  return { findings, score: null, generatedAt: now, notes };
}