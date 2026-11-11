/**
 * Minimal fetch helpers used by all server-side providers.
 * - hard timeouts on every request
 * - bounded retries with backoff for transient failures (429 / 5xx / network)
 * - typed errors so routes can surface honest failure states
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;

interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  provider: string;
}

export async function fetchJson<T>(url: string, opts: FetchOptions): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, headers, provider } = opts;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        signal: controller.signal,
        headers: { accept: "application/json", ...headers },
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new ProviderError(`HTTP ${res.status}`, provider, res.status);
        if (attempt < retries) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        // Non-retryable client errors: surface immediately.
        throw new ProviderError(`HTTP ${res.status}`, provider, res.status);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw new ProviderError(lastError.message, provider);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new ProviderError("unknown failure", provider);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Tiny in-memory TTL cache for API routes. Single-instance only — sufficient
 * for a single-user terminal and keeps public providers within rate limits.
 * A Redis swap is trivial behind this interface if the app is scaled out.
 */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();
  constructor(private ttlMs: number, private maxEntries = 500) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  async wrap(key: string, producer: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await producer();
    this.set(key, value);
    return value;
  }
}