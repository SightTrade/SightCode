import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: {
    default: "SIGHT — See the Signal",
    template: "%s · SIGHT",
  },
  description:
    "SIGHT is a multi-chain trading terminal: discover new token launches, follow smart money, analyze liquidity and risk, and trade with clarity across Solana, BNB Chain, Ethereum and Base.",
  applicationName: "SIGHT",
  icons: {
    icon: [{ url: "/logos/sight_mark.png", type: "image/png" }],
    apple: [{ url: "/logos/sight_mark.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#050711",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`} suppressHydrationWarning>
      <body className="font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}