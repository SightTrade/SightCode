import { useState } from "react";
import { CHAINS, type ChainId } from "@/lib/chains";
import { cn } from "@/lib/format";

/**
 * Network logo, resolved from the centralized chain registry (chains.ts maps
 * each network id to its local brand SVG in public/logos — no name-string
 * matching, no runtime external requests).
 *
 * - Renders an <img> with object-fit: contain so vector marks never stretch
 *   or blur at any size.
 * - Accessible alt text ("{chain name} logo").
 * - If the asset is missing or fails to load, falls back gracefully to a
 *   clean text-label badge in the chain's accent color (never an invented
 *   logo, never a bare colored circle).
 */
export function ChainLogo({ id, className }: { id: ChainId; className?: string }) {
  const chain = CHAINS[id];
  const [failed, setFailed] = useState(false);

  if (!chain.logo || failed) {
    return (
      <span
        role="img"
        aria-label={`${chain.name} logo`}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-2xs font-bold",
          className
        )}
        style={{ backgroundColor: "color-mix(in srgb, currentColor 14%, transparent)", color: chain.color }}
      >
        {chain.shortName}
      </span>
    );
  }

  return (
    // Local vector asset sized via CSS (object-contain) — next/image is
    // intentionally not used for a tiny static icon.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={chain.logo}
      alt={`${chain.name} logo`}
      width={20}
      height={20}
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
