/**
 * SIGHT brand assets — official logo.
 * The mark is the supplied "S" signature (public/logos/sight_mark.png), cropped
 * from "Sight Logo/sight_logo_only.png" with the background keyed out. The full
 * lockup (public/logos/sight_logo_trans.png) is the transparent version of the
 * supplied logo, used on the landing hero.
 */
import Image from "next/image";

export function SightMark({ size = 28, className }: { size?: number; className?: string }) {
  // Mark aspect ratio is 207x159 — render at the same ratio for any size.
  return (
    <Image
      src="/logos/sight_mark.png"
      alt=""
      width={size}
      height={Math.round((size * 159) / 207)}
      className={className}
      aria-hidden="true"
      priority
    />
  );
}

export function Logo({
  collapsed = false,
  size = 26,
}: {
  collapsed?: boolean;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="SIGHT home">
      <SightMark size={size} className="shrink-0" />
      {!collapsed && (
        <span className="font-bold tracking-[0.28em] text-fg text-sm select-none">SIGHT</span>
      )}
    </span>
  );
}