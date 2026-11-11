"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { useUi } from "@/lib/store";
import { cn } from "@/lib/format";

/**
 * Primary navigation. Icons are original inline SVG line-art (no icon
 * dependency). Collapsible on desktop, hidden behind a toggle on mobile.
 */
const NAV: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/terminal",
    label: "Terminal",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M6 12l2.5-3 2 2L14 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    href: "/discover",
    label: "Discover",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
  {
    href: "/trending",
    label: "Trending",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M3 15l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 6h3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    href: "/new-pairs",
    label: "New Pairs",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/></svg>,
  },
  {
    href: "/launch-radar",
    label: "Launch Radar",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="10" r="0.8" fill="currentColor"/></svg>,
  },
  {
    href: "/smart-money",
    label: "Smart Money",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2.5 16c.8-2.8 2.6-4 4.5-4s3.7 1.2 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M13 5l4 4M17 5l-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
  {
    href: "/watchlists",
    label: "Watchlists",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 3.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14.2l-4.2 2.3.8-4.7-3.4-3.3 4.7-.7L10 3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  },
  {
    href: "/wallets",
    label: "Wallets",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><rect x="2.5" y="5.5" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M14 10.5h1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M5.5 5.5V4.5A1 1 0 016.5 3.5h6" stroke="currentColor" strokeWidth="1.2"/></svg>,
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><rect x="2.5" y="6.5" width="15" height="9" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M6.5 6.5V5a2 2 0 012-2h3a2 2 0 012 2v1.5M2.5 10.5h15" stroke="currentColor" strokeWidth="1.4"/></svg>,
  },
  {
    href: "/history",
    label: "History",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M10 6v4l2.8 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
  {
    href: "/alerts",
    label: "Alerts",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 3a5 5 0 015 5v3l1.5 2.5H3.5L5 11V8a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8.5 16a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-56",
      )}
      aria-label="Primary navigation"
    >
      <div className={cn("flex h-14 items-center border-b border-line", collapsed ? "justify-center" : "justify-between px-4")}>
        <Link href="/" className="focus-ring rounded" aria-label="SIGHT home">
          <Logo collapsed={collapsed} />
        </Link>
        {!collapsed && (
          <button
            onClick={toggle}
            className="focus-ring rounded p-1 text-muted hover:text-fg"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>
      {collapsed && (
        <button onClick={toggle} className="focus-ring mx-auto mt-2 rounded p-1 text-muted hover:text-fg" aria-label="Expand sidebar">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "focus-ring flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-panel font-medium text-fg shadow-[inset_2px_0_0_var(--sight-accent)]"
                  : "text-muted hover:bg-panel/60 hover:text-fg",
              )}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <span className={cn(active ? "text-accent" : "")}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="border-t border-line p-3">
          <p className="text-2xs text-muted">SEE THE SIGNAL.</p>
        </div>
      )}
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const items = NAV.slice(0, 5);
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-line bg-surface md:hidden" aria-label="Mobile navigation">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs focus-ring", active ? "text-accent" : "text-muted")}
            aria-current={active ? "page" : undefined}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}