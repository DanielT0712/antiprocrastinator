import { useEffect, useState } from "react";
import { useAnalyticsStore } from "@/stores/analyticsStore";
import { Select } from "../common/Select";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RangeKey = "today" | "7days" | "30days";

function rangeToTimestamps(key: RangeKey): { from: number; to: number } {
  const now = new Date();
  const to = now.getTime();
  switch (key) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start.getTime(), to };
    }
    case "7days":
      return { from: to - 7 * 24 * 60 * 60 * 1000, to };
    case "30days":
      return { from: to - 30 * 24 * 60 * 60 * 1000, to };
  }
}

function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        {label}
      </span>
      <span className="text-2xl font-bold text-[var(--text-primary)]">
        {value}
      </span>
      {sub && (
        <span className="text-xs text-[var(--text-secondary)]">{sub}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focus Time Bar Chart
// ---------------------------------------------------------------------------

function FocusTimeChart({
  data,
}: {
  data: { date: string; focusMinutes: number }[];
}) {
  const maxMinutes = Math.max(...data.map((d) => d.focusMinutes), 1);

  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Focus Time
      </h3>
      <div className="flex items-end gap-1 h-48">
        {data.map((point) => {
          const heightPct = (point.focusMinutes / maxMinutes) * 100;
          return (
            <div
              key={point.date}
              className="flex-1 flex flex-col items-center justify-end h-full"
            >
              <div
                className="w-full max-w-[32px] rounded-t-sm transition-all"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: "var(--accent)",
                  minHeight: point.focusMinutes > 0 ? "4px" : "0",
                }}
                title={`${point.focusMinutes}m`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {data.map((point) => (
          <div
            key={point.date}
            className="flex-1 text-center text-[10px] text-[var(--text-secondary)] truncate"
          >
            {point.date.slice(5)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Completion Table
// ---------------------------------------------------------------------------

function TaskCompletionTable({
  stats,
}: {
  stats: {
    taskName: string;
    completionCount: number;
    skippedCount: number;
    totalFocusMinutes: number;
  }[];
}) {
  const sorted = [...stats].sort(
    (a, b) => b.completionCount - a.completionCount,
  );

  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Task Completions
      </h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
          No task completions in this range.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--text-secondary)] text-xs uppercase">
              <th className="text-left py-2 font-medium">Task</th>
              <th className="text-right py-2 font-medium">Completed</th>
              <th className="text-right py-2 font-medium">Skipped</th>
              <th className="text-right py-2 font-medium">Focus Time</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row.taskName}
                className={
                  i % 2 === 1 ? "bg-[var(--bg-tertiary)]/50" : ""
                }
              >
                <td className="py-2 text-[var(--text-primary)] truncate max-w-[200px]">
                  {row.taskName}
                </td>
                <td className="py-2 text-right text-[var(--success)]">
                  {row.completionCount}
                </td>
                <td className="py-2 text-right text-[var(--text-secondary)]">
                  {row.skippedCount}
                </td>
                <td className="py-2 text-right text-[var(--text-secondary)]">
                  {row.totalFocusMinutes}m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process Kill Stats
// ---------------------------------------------------------------------------

function ProcessKillStats({
  stats,
}: {
  stats: { processName: string; killCount: number }[];
}) {
  const sorted = [...stats].sort((a, b) => b.killCount - a.killCount);
  const maxKills = Math.max(...sorted.map((s) => s.killCount), 1);

  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        Blocked Apps
      </h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
          No blocked apps in this range.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((row) => (
            <div
              key={row.processName}
              className="flex items-center gap-3"
            >
              <span className="text-sm text-[var(--text-primary)] w-32 truncate flex-shrink-0">
                {row.processName}
              </span>
              <div className="flex-1 h-4 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(row.killCount / maxKills) * 100}%`,
                    backgroundColor: "var(--danger)",
                  }}
                />
              </div>
              <span className="text-xs text-[var(--text-secondary)] w-8 text-right">
                {row.killCount}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnalyticsPage
// ---------------------------------------------------------------------------

export function AnalyticsPage() {
  const {
    dailySummary,
    focusStats,
    taskCompletionStats,
    processKillStats,
    fetchDailySummary,
    fetchFocusStats,
    fetchTaskCompletionStats,
    fetchProcessKillStats,
    setDateRange,
  } = useAnalyticsStore();

  const [rangeKey, setRangeKey] = useState<RangeKey>("7days");

  // Fetch everything on mount and when range changes
  useEffect(() => {
    fetchDailySummary(todayDateString());
  }, [fetchDailySummary]);

  useEffect(() => {
    const { from, to } = rangeToTimestamps(rangeKey);
    setDateRange(from, to);
    fetchFocusStats(from, to);
    fetchTaskCompletionStats(from, to);
    fetchProcessKillStats(from, to);
  }, [
    rangeKey,
    setDateRange,
    fetchFocusStats,
    fetchTaskCompletionStats,
    fetchProcessKillStats,
  ]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          ANALYTICS
        </h1>
        <Select
          options={[
            { value: "today", label: "Today" },
            { value: "7days", label: "Last 7 Days" },
            { value: "30days", label: "Last 30 Days" },
          ]}
          value={rangeKey}
          onChange={(v) => setRangeKey(v as RangeKey)}
        />
      </div>

      {/* Today's Summary */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Focus Time"
          value={`${dailySummary?.focusMinutes ?? 0}m`}
        />
        <StatCard
          label="Blocks Completed"
          value={dailySummary?.completedBlocks ?? 0}
        />
        <StatCard
          label="Tasks Completed"
          value={dailySummary?.tasksCompleted ?? 0}
        />
        <StatCard
          label="Apps Blocked"
          value={dailySummary?.processesKilled ?? 0}
        />
      </div>

      {/* Focus Time Chart */}
      <FocusTimeChart data={focusStats} />

      {/* Task Completion Stats */}
      <TaskCompletionTable stats={taskCompletionStats} />

      {/* Process Kill Stats */}
      <ProcessKillStats stats={processKillStats} />
    </div>
  );
}
