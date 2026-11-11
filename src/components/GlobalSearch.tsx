"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CHAINS } from "@/lib/chains";
import { useUi } from "@/lib/store";
import { cn, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import type { TokenSummary } from "@/lib/types";

interface SearchResponse {
  tokens: TokenSummary[];
  interpretations: { kind: string; value: string; chains: string[] }[];
  fetchedAt: number;
  warnings?: string[];
}

/**
 * Global search (⌘K / Ctrl+K). Accepts names, tickers, mint/contract
 * addresses, and signature-shaped strings. Address-shaped input yields
 * explicit interpretations — the user picks the meaning; we never guess.
 */
export function GlobalSearch() {
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setQuery("");
      setResults(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setResults((await res.json()) as SearchResponse);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "search failed");
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const interpretations = useMemo(() => results?.interpretations ?? [], [results]);
  const tokens = results?.tokens ?? [];

  if (!open) return null;

  const openToken = (chain: string, address: string) => {
    setOpen(false);
    router.push(`/token/${chain}/${address}`);
  };
  const openWallet = (chain: string, address: string) => {
    setOpen(false);
    router.push(`/wallet/${chain}/${address}`);
  };

  return (
    <SearchOverlay
      query={query}
      setQuery={setQuery}
      loading={loading}
      error={error}
      interpretations={interpretations}
      tokens={tokens}
      openToken={openToken}
      openWallet={openWallet}
      onClose={() => setOpen(false)}
    />
  );
}

function SearchOverlay(props: {
  query: string;
  setQuery: (q: string) => void;
  loading: boolean;
  error: string | null;
  interpretations: SearchResponse["interpretations"];
  tokens: TokenSummary[];
  openToken: (chain: string, address: string) => void;
  openWallet: (chain: string, address: string) => void;
  onClose: () => void;
}) {
  const { query, setQuery, loading, error, interpretations, tokens, openToken, openWallet, onClose } = props;
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Global search">
      <div className="animate-slide-up w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-muted"><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6"/><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tokens, tickers, or paste an address / tx signature…"
            className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted/60"
            aria-label="Search query"
          />
          {loading && <span className="text-2xs text-muted">searching…</span>}
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-2xs text-muted sm:block">esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {error && (
            <p className="px-3 py-4 text-sm text-neg">Search failed: {error}. Your input is preserved — try again.</p>
          )}

          {interpretations.length > 0 && (
            <div className="mb-2 rounded-md border border-info/30 bg-info/5 p-2.5">
              <p className="mb-1.5 text-2xs uppercase tracking-wider text-info">This looks like an on-chain identifier</p>
              <div className="flex flex-wrap gap-1.5">
                {interpretations.map((i, idx) => (
                  <span key={idx} className="chip">
                    {i.kind}
                    {i.chains.length > 0 && <> · {i.chains.map((c) => CHAINS[c as keyof typeof CHAINS]?.shortName ?? c).join("/")}</>}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-2xs text-muted">Choose how to open it:</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button onClick={() => openToken("solana", interpretations[0].value)} className="btn-ghost h-7 px-2 text-2xs">As Solana token</button>
                <button onClick={() => openWallet("solana", interpretations[0].value)} className="btn-ghost h-7 px-2 text-2xs">As Solana wallet</button>
                {(["ethereum", "base", "bsc"] as const).map((c) =>
                  interpretations[0].chains.includes(c) ? (
                    <button key={c} onClick={() => openToken(c, interpretations[0].value)} className="btn-ghost h-7 px-2 text-2xs">
                      As {CHAINS[c].name} token
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {tokens.length === 0 && !loading && !error && query.trim().length >= 2 && (
            <p className="px-3 py-6 text-center text-sm text-muted">
              No results for “{query.trim()}”. Check the spelling, or paste a token address to look it up directly.
            </p>
          )}

          {tokens.map((t) => (
            <button
              key={`${t.chain}:${t.address}`}
              onClick={() => openToken(t.chain, t.address)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-2xs font-bold text-muted">
                {t.symbol?.slice(0, 3).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-fg">{t.symbol}</span>
                  <span className="chip">{CHAINS[t.chain].shortName}</span>
                </span>
                <span className="block truncate text-xs text-muted">
                  {t.name} · {shortAddr(t.address, 6, 4)} · {t.dataSource}
                  {t.fetchedAt ? ` · ${timeAgo(t.fetchedAt)}` : ""}
                </span>
              </span>
              <span className="tabular text-right text-xs text-fg">{fmtUsd(t.priceUsd)}</span>
            </button>
          ))}

          {query.trim().length < 2 && (
            <div className="px-3 py-6 text-center text-xs text-muted">
              Search across Solana, BNB Chain, Ethereum and Base. Press <kbd className="rounded border border-line px-1">⌘K</kbd> anytime.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}