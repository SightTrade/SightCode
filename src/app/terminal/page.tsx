import { Suspense } from "react";
import { TerminalWorkspace } from "@/components/TerminalWorkspace";

export const metadata = { title: "Terminal" };

export default function TerminalPage() {
  return (
    <div className="mx-auto h-full max-w-[1600px] p-3 sm:p-4">
      <Suspense fallback={<div className="panel h-[520px] animate-pulse" />}>
        <TerminalWorkspace />
      </Suspense>
    </div>
  );
}