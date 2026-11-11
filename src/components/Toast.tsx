"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/format";

export type ToastKind = "info" | "success" | "error" | "warn";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

const ToastContext = createContext<{
  toast: (kind: ToastKind, title: string, detail?: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((kind: ToastKind, title: string, detail?: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, title, detail }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  const colors: Record<ToastKind, string> = {
    info: "border-info/40",
    success: "border-pos/40",
    error: "border-neg/40",
    warn: "border-warn/40",
  };
  const dot: Record<ToastKind, string> = {
    info: "bg-info",
    success: "bg-pos",
    error: "bg-neg",
    warn: "bg-warn",
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-slide-up rounded-lg border bg-panel px-4 py-3 shadow-lg shadow-black/40",
              colors[t.kind],
            )}
            role="status"
          >
            <div className="flex items-start gap-2.5">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[t.kind])} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{t.title}</p>
                {t.detail && <p className="mt-0.5 break-words text-xs text-muted">{t.detail}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}