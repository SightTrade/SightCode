import type { ChainId } from "./chains";

/**
 * Browser-side RPC resolution for EVM chains.
 *
 * Always routes through the chain-aware server proxy (`/api/rpc/[chain]`),
 * which resolves each network to its own server-side endpoint
 * (`process.env[chain.rpcEnvKey]`, e.g. the Alchemy URL). This guarantees:
 *   - a request for Base never lands on an Ethereum endpoint (and vice versa),
 *   - provider credentials embedded in provider URLs stay on the server,
 *   - per-chain failures are reported with the correct chain name.
 *
 * The former single shared override (`NEXT_PUBLIC_EVM_RPC`) was removed: one
 * URL cannot serve multiple EVM chains safely, and exposing provider URLs with
 * embedded keys to the browser is prohibited by the security audit.
 */
export function evmBrowserRpc(chainId: ChainId): string {
  return `/api/rpc/${chainId}`;
}