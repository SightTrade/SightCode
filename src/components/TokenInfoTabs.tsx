"use client";

import { useState } from "react";
import { CHAINS } from "@/lib/chains";
import { cn, fmtCompact, fmtNum, fmtPct, fmtPrice, sanitizeText, shortAddr, timeAgo } from "@/lib/format";
import type { TokenDetail } from "@/lib/types";

const SEVERITY_STYLE: Record<string, string> = {
  ok: "border-pos/40 text-pos",
  info: "border-info/40 text-info",
  warn: "border-warn/40 text-warn",
  critical: "border-neg/40 text-neg",
  unknown: "border-line text-muted",
};

/** Direction badges — same visual language as the wallet page's class badges. */
const DIRECTION_BADGE: Record<string, { label: string; className: string }> = {
  buy: { label: "BUY", className: "border-pos/40 text-pos" },
  sell: { label: "SELL", className: "border-neg/40 text-neg" },
  transfer: { label: "TRANSFER", className: "text-muted" },
  liquidity: { label: "LIQ", className: "border-info/40 text-info" },
  unknown: { label: "UNKNOWN", className: "text-muted" },
};

/** Compact readable label for a classified asset: "1.5 USDC" / "0x1234…". */
function assetLabel(t: { asset: string; symbol: string | null; amount: number | null } | null | undefined): string | null {
  if (!t) return null;
  const sym = t.symbol ?? (t.asset === "native" ? "native" : `${t.asset.slice(0, 6)}…${t.asset.slice(-4)}`);
  return t.amount !== null ? `${t.amount} ${sym}` : sym;
}

const TABS = ["Overview", "Venues", "Security", "Transactions", "Holders", "Related wallets"] as const;
type Tab = (typeof TABS)[number];

export function TokenInfoTabs({ detail, chain }: { detail: TokenDetail; chain: string }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const chainCfg = CHAINS[chain as keyof typeof CHAINS];
  const r = detail.summary;

  return (
    <div className="panel flex min-h-0 flex-col">
      <div className="flex gap-0.5 overflow-x-auto border-b border-line p-1.5" role="tablist" aria-label="Token information">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "focus-ring whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
              tab === t ? "bg-surface text-fg" : "text-muted hover:text-fg",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        {tab === "Overview" && <Overview detail={detail} chainCfg={chainCfg} />}
        {tab === "Venues" && <Venues detail={detail} />}
        {tab === "Security" && detail.risk && <Security detail={detail} />}
        {tab === "Transactions" && (detail.activity ? <Activity detail={detail} /> : <UnavailableTx chainCfg={chainCfg} address={r.address} />)}
        {tab === "Holders" && (detail.holders ? <Holders detail={detail} /> : (
          <p className="py-4 text-center text-muted">
            Full holder lists require an indexer. On Solana, holder concentration is available in the Security tab via
            direct RPC reads.
          </p>
        ))}
        {tab === "Related wallets" && (detail.activity ? <RelatedWallets detail={detail} chainCfg={chainCfg} /> : (
          <p className="py-4 text-center text-muted">
            Related-wallet analysis needs decoded transaction data (an indexer) before any relationship can be shown.
            Address lists are never presented as &quot;related&quot; without evidence.
          </p>
        ))}
      </div>
    </div>
  );
}

function Overview({ detail, chainCfg }: { detail: TokenDetail; chainCfg: (typeof CHAINS)[keyof typeof CHAINS] | undefined }) {
  const r = detail.summary;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Item label="Price" value={fmtPrice(r.priceUsd)} />
        <Item label="24h change" value={fmtPct(r.priceChange.h24)} className={r.priceChange.h24 !== null && r.priceChange.h24 < 0 ? "text-neg" : r.priceChange.h24 !== null ? "text-pos" : ""} />
        <Item label="Market cap / FDV" value={`${fmtCompact(r.marketCapUsd)}${r.marketCapUsd === null ? " (FDV)" : " (MC)"}`} />
        <Item label="Liquidity" value={fmtCompact(r.liquidityUsd)} />
        <Item label="Volume 24h" value={fmtCompact(r.volume24hUsd)} />
        <Item label="Traders 24h" value={r.traders24h !== null ? fmtNum(r.traders24h) : "unavailable"} />
        <Item label="Pool age" value={r.createdAt ? timeAgo(r.createdAt) : "unavailable"} />
        <Item label="Source" value={r.dataSource} />
      </dl>
      {detail.about && (
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-muted">About</p>
          {detail.about.description && <p className="leading-relaxed text-muted">{sanitizeText(detail.about.description)}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {detail.about.twitter && <a className="chip hover:text-fg" href={`https://x.com/${detail.about.twitter}`} target="_blank" rel="noopener noreferrer">𝕏 @{detail.about.twitter}</a>}
            {detail.about.website && <a className="chip hover:text-fg" href={detail.about.website} target="_blank" rel="noopener noreferrer">Website ↗</a>}
            {detail.about.telegram && <a className="chip hover:text-fg" href={`https://t.me/${detail.about.telegram}`} target="_blank" rel="noopener noreferrer">Telegram</a>}
          </div>
          <p className="mt-1.5 text-2xs text-muted/70">Descriptions and links come from third-party metadata and are not verified by SIGHT.</p>
        </div>
      )}
      {detail.providerNotes.length > 0 && (
        <ul className="space-y-1 text-2xs text-muted">
          {detail.providerNotes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      )}
      {chainCfg && (
        <p className="text-2xs text-muted/70">
          Address: <span className="font-mono">{shortAddr(r.address, 10, 8)}</span>
          {chainCfg.explorer && (
            <>
              {" · "}
              <a className="underline hover:no-underline" href={chainCfg.explorer.token(r.address)} target="_blank" rel="noopener noreferrer">
                {chainCfg.explorer.name} ↗
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Venues({ detail }: { detail: TokenDetail }) {
  return (
    <div className="space-y-2">
      {detail.venues.length === 0 && (
        <p className="py-4 text-center text-muted">No active liquidity pools found for this token. It may not be tradable yet.</p>
      )}
      {detail.venues.map((v, i) => (
        <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5">
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{v.venue}</p>
            <p className="text-2xs text-muted">
              {v.poolAddress ? `Pool ${shortAddr(v.poolAddress, 6, 4)}` : "—"}
              {v.volume24hUsd !== null ? ` · Vol ${fmtCompact(v.volume24hUsd)}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="tabular text-fg">{fmtCompact(v.liquidityUsd)}</p>
            {v.url && (
              <a className="text-2xs text-info underline hover:no-underline" href={v.url} target="_blank" rel="noopener noreferrer">
                open ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Security({ detail }: { detail: TokenDetail }) {
  const risk = detail.risk!;
  return (
    <div className="space-y-2">
      <p className="text-2xs text-muted">Generated {timeAgo(risk.generatedAt)} · every finding lists its data source.</p>
      {risk.findings.map((f) => (
        <div key={f.id} className={cn("rounded-md border p-2.5", SEVERITY_STYLE[f.severity])}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-fg">{f.label}</p>
            <span className="chip">{f.severity}</span>
          </div>
          <p className="mt-1 leading-relaxed text-muted">{f.detail}</p>
          <p className="mt-1 text-2xs text-muted/70">Source: {f.source}</p>
        </div>
      ))}
      {risk.notes.map((n, i) => (
        <p key={i} className="text-2xs text-muted/70">{n}</p>
      ))}
    </div>
  );
}

function UnavailableTx({
  chainCfg,
  address,
}: {
  chainCfg: (typeof CHAINS)[keyof typeof CHAINS] | undefined;
  address: string;
}) {
  return (
    <p className="py-4 text-center text-muted">
      Decoded activity is unavailable for this token right now — no decoded-transaction source is configured for this chain, or the lookup failed.
      {chainCfg?.explorer && (
        <>
          {" "}
          <a className="underline hover:no-underline" href={chainCfg.explorer.token(address)} target="_blank" rel="noopener noreferrer">
            View transactions on {chainCfg.explorer.name} ↗
          </a>
        </>
      )}
    </p>
  );
}

/**
 * Transactions tab — decoded token activity (Helius on Solana, Alchemy on EVM).
 * Rows are real decoded transactions; direction badges come from the shared
 * evidence-based classifiers. `created-no-trades` / `empty` / `unavailable`
 * states render honest placeholders instead of fabricated rows.
 */
function Activity({ detail }: { detail: TokenDetail }) {
  const a = detail.activity!;
  if (a.state !== "available") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="chip">{a.state}</span>
          <span className="text-2xs text-muted">updated {timeAgo(a.fetchedAt)}</span>
        </div>
        <p className="leading-relaxed text-muted">{a.note}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-2xs text-muted">
        {a.note} · updated {timeAgo(a.fetchedAt)}
      </p>
      {a.transactions.map((tx) => {
        const badge = DIRECTION_BADGE[tx.direction] ?? DIRECTION_BADGE.unknown;
        const inLabel = assetLabel(tx.tokenIn);
        const outLabel = assetLabel(tx.tokenOut);
        // Solana rows carry no confidence — direction there is inferred from
        // decoded transfers relative to the fee payer, so it is labeled est.
        const estSuffix = tx.confidence == null && (tx.direction === "buy" || tx.direction === "sell") ? " · est." : "";
        return (
          <div key={tx.signature} className="flex items-start justify-between gap-2 rounded-md border border-line bg-surface p-2.5">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="chip">{tx.timestamp ? timeAgo(tx.timestamp) : "—"}</span>
                <span
                  className={cn("chip", badge.className)}
                  title={tx.classificationReason ?? undefined}
                >
                  {badge.label}
                  {tx.confidence != null && tx.confidence !== "high" ? ` · ${tx.confidence}` : estSuffix}
                </span>
                {tx.status === "failed" && <span className="chip border-neg/40 text-neg">reverted</span>}
                <span className="font-mono text-2xs text-muted">{shortAddr(tx.signature, 10, 8)}</span>
                {tx.counterparty && (
                  <span className="font-mono text-2xs text-muted" title={tx.counterparty}>
                    for {shortAddr(tx.counterparty, 6, 4)}
                  </span>
                )}
              </p>
              {(inLabel || outLabel) && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
                  {outLabel && <span className="tabular text-neg">− {outLabel}</span>}
                  {outLabel && inLabel && <span className="text-muted">→</span>}
                  {inLabel && <span className="tabular text-pos">+ {inLabel}</span>}
                  {tx.quoteAmount != null && tx.quoteCurrency && (
                    <span className="chip text-2xs">
                      {tx.quoteAmount} {tx.quoteCurrency}
                    </span>
                  )}
                </p>
              )}
              {tx.description && (
                <p className="mt-1 truncate text-2xs text-muted" title={tx.description}>
                  {tx.description}
                </p>
              )}
            </div>
            {tx.explorerUrl && (
              <a className="text-2xs text-info underline hover:no-underline" href={tx.explorerUrl} target="_blank" rel="noopener noreferrer">
                tx ↗
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Related-wallets tab — evidence-based wallet list derived from decoded
 * transactions. Appearance counts within the fetched window only; never
 * presented as ownership, P&L, or financial relationships. Wallet links use
 * the active chain's explorer (chainCfg) — no hardcoded Solscan.
 */
function RelatedWallets({
  detail,
  chainCfg,
}: {
  detail: TokenDetail;
  chainCfg: (typeof CHAINS)[keyof typeof CHAINS] | undefined;
}) {
  const a = detail.activity!;
  const walletHref = (addr: string) => chainCfg?.explorer?.address(addr) ?? `https://solscan.io/account/${addr}`;
  const explorerName = chainCfg?.explorer?.name ?? "Solscan";
  return (
    <div className="space-y-2">
      <p className="text-2xs text-muted">
        Evidence: wallets seen in {a.transactionsScanned} decoded transactions for this mint (window ended{" "}
        {timeAgo(a.fetchedAt)}). Appearance frequency is not a financial relationship.
      </p>
      {a.wallets.length === 0 && (
        <p className="py-4 text-center text-muted">No wallet activity decoded for this mint in the recent window.</p>
      )}
      {a.wallets.map((w) => (
        <div key={w.address} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-fg" title={w.address}>
              {shortAddr(w.address, 8, 8)}
            </p>
            <p className="text-2xs text-muted">
              {w.appearances} tx{w.appearances === 1 ? "" : "s"} in window{w.lastSeen ? ` · last ${timeAgo(w.lastSeen)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 text-right">
            <span className="tabular text-2xs text-muted">{w.share !== null ? `${Math.round(w.share * 100)}%` : "—"}</span>
            <a
              className="text-2xs text-info underline hover:no-underline"
              href={walletHref(w.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {explorerName} ↗
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Holders tab — largest token accounts from direct RPC (Solana). CURRENT
 * balances only; historical holdings are not available without an indexer.
 * Every row links the token account and its resolved owner wallet.
 */
function Holders({ detail }: { detail: TokenDetail }) {
  const h = detail.holders!;
  return (
    <div className="space-y-2">
      <p className="text-2xs text-muted">
        {h.note} Scanned {h.accountsExamined} largest accounts · updated {timeAgo(h.fetchedAt)}.
      </p>
      {h.holders.length === 0 && (
        <p className="py-4 text-center text-muted">No token accounts observed for this mint yet.</p>
      )}
      {h.holders.map((a, i) => (
        <div key={a.address} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-2.5">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-fg">
              #{i + 1} {shortAddr(a.address, 8, 8)}
            </p>
            <p className="text-2xs text-muted">
              {a.owner ? (
                <>
                  owner{" "}
                  <a
                    className="underline hover:no-underline"
                    href={`https://solscan.io/account/${a.owner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {shortAddr(a.owner, 6, 6)} ↗
                  </a>
                </>
              ) : (
                "owner unavailable"
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="tabular text-fg">{a.uiAmount !== null ? fmtNum(a.uiAmount) : "—"}</p>
            <p className="tabular text-2xs text-muted">{a.sharePct !== null ? `${a.sharePct.toFixed(2)}% of supply` : "share unavailable"}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Item({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-2xs text-muted">{label}</dt>
      <dd className={cn("tabular mt-0.5 text-sm font-medium text-fg", className)}>{value}</dd>
    </div>
  );
}