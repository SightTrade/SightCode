/**
 * Wallet identification icons.
 *
 * These are generic monogram marks in each wallet's brand color — NOT official
 * brand assets (no reliable offline logo source is available). They identify
 * the provider without impersonating its exact trademark art.
 */
export function WalletIcon({ id, size = 28 }: { id: string; size?: number }) {
  const mark = (bg: string, letter: string, fg = "#FFFFFF") => (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
  switch (id.toLowerCase()) {
    case "phantom":
      return mark("#AB9FF2", "P");
    case "solflare":
      return mark("#FC7B3D", "S");
    case "backpack":
      return mark("#E33E3F", "B");
    case "metamask":
    case "metamask-fallback":
      return mark("#F6851B", "M");
    case "rabby":
    case "rabby-fallback":
      return mark("#70A8FF", "R");
    case "coinbase":
    case "coinbase-fallback":
      return mark("#0052FF", "C");
    case "embedded-solana":
      return mark("#7857FF", "S");
    case "embedded-evm":
      return mark("#35BFFF", "E");
    default:
      return mark("#343F5C", "?");
  }
}