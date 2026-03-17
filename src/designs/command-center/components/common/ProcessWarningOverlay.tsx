import { useEffect, useState } from "react";
import { useProcessStore } from "@/stores/processStore";

export function ProcessWarningOverlay() {
  const activeWarnings = useProcessStore((s) => s.activeWarnings);
  const [, setTick] = useState(0);

  // Force re-render every second for countdown
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (activeWarnings.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-40 flex flex-col gap-2 max-w-sm">
      {activeWarnings.map((warning) => (
        <div
          key={warning.processName}
          className="rounded-lg border border-[var(--warning)] bg-[var(--warning)]/10 p-4 shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--warning)] truncate">
                {warning.processName}
              </p>
              {warning.windowTitle && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                  {warning.windowTitle}
                </p>
              )}
              {warning.matchReason && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {warning.matchReason}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 text-right">
              <span className="text-lg font-bold text-[var(--warning)] tabular-nums">
                {warning.secondsUntilKill}s
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
