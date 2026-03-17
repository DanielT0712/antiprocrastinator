import { useEffect, useState } from "react";
import { useScheduleStore } from "@/stores/scheduleStore";
import { useAnalyticsStore } from "@/stores/analyticsStore";
import { useTaskStore } from "@/stores/taskStore";
import type { BlockType } from "@/types/schedule";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  return `${Math.round(ms / 60_000)}m`;
}

function formatFocusTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function blockTypeColor(type: BlockType): string {
  switch (type) {
    case "work":
      return "var(--accent)";
    case "break":
      return "var(--success)";
    case "sleep":
      return "rgb(59 130 246)";
    case "meal":
      return "var(--warning)";
    case "custom":
      return "rgb(168 85 247)";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function IntensityDots({ value }: { value: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor:
              i < value ? "var(--accent)" : "var(--bg-tertiary)",
          }}
        />
      ))}
    </div>
  );
}

function CurrentBlockCard() {
  const {
    currentBlock,
    timerRemainingSecs,
    timerTotalSecs,
    pauseCurrentBlock,
    resumeCurrentBlock,
    completeCurrentBlock,
    skipCurrentBlock,
    extendCurrentBlock,
  } = useScheduleStore();
  const tasks = useTaskStore((s) => s.tasks);
  const [showExtend, setShowExtend] = useState(false);

  if (!currentBlock) return null;

  const task = currentBlock.taskId
    ? tasks.find((t) => t.id === currentBlock.taskId)
    : null;

  const elapsed = timerTotalSecs - timerRemainingSecs;
  const progress = timerTotalSecs > 0 ? (elapsed / timerTotalSecs) * 100 : 0;
  const isPaused = currentBlock.status === "paused";
  const color = blockTypeColor(currentBlock.blockType);

  return (
    <div className="rounded-xl bg-[var(--bg-secondary)] p-6">
      {/* Top row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-[var(--text-primary)]">
            {currentBlock.title}
          </span>
          <Badge variant={currentBlock.blockType}>
            {currentBlock.blockType}
          </Badge>
        </div>
        <IntensityDots value={currentBlock.intensity} />
      </div>

      {/* Task name */}
      {task && (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {task.name}
        </p>
      )}

      {/* Timer */}
      <div className="mt-6 text-center">
        <span className="text-5xl font-mono font-bold text-[var(--text-primary)]">
          {formatTimer(timerRemainingSecs)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex gap-2 relative">
        {isPaused ? (
          <>
            <Button variant="primary" onClick={() => resumeCurrentBlock()}>
              Resume
            </Button>
            <Button variant="secondary" onClick={() => completeCurrentBlock()}>
              Done
            </Button>
            <Button variant="ghost" onClick={() => skipCurrentBlock()}>
              Skip
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => pauseCurrentBlock()}>
              Pause
            </Button>
            <Button variant="primary" onClick={() => completeCurrentBlock()}>
              Done
            </Button>
            <Button variant="ghost" onClick={() => skipCurrentBlock()}>
              Skip
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                onClick={() => setShowExtend((v) => !v)}
              >
                Extend
              </Button>
              {showExtend && (
                <div className="absolute bottom-full left-0 mb-1 flex flex-col rounded-md bg-[var(--bg-tertiary)] py-1 shadow-lg z-10">
                  {[5, 10, 15, 30].map((m) => (
                    <button
                      key={m}
                      className="px-4 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] text-left whitespace-nowrap"
                      onClick={() => {
                        extendCurrentBlock(m);
                        setShowExtend(false);
                      }}
                    >
                      +{m} min
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function NextBlockPreview() {
  const nextBlock = useScheduleStore((s) => s.nextBlock);
  if (!nextBlock) return null;

  return (
    <div className="rounded-lg bg-[var(--bg-secondary)] p-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        Next Up
      </span>
      <div className="mt-2 flex items-center gap-3">
        <Badge variant={nextBlock.blockType}>{nextBlock.blockType}</Badge>
        <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
          {nextBlock.title}
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          {formatTime(nextBlock.startTime)} - {formatTime(nextBlock.endTime)}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">
          {formatDuration(nextBlock.endTime - nextBlock.startTime)}
        </span>
      </div>
    </div>
  );
}

function NoActiveBlock() {
  const nextBlock = useScheduleStore((s) => s.nextBlock);
  const startEmergencyBlock = useScheduleStore((s) => s.startEmergencyBlock);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(25);

  return (
    <div className="rounded-xl bg-[var(--bg-secondary)] p-6 text-center">
      <p className="text-lg text-[var(--text-secondary)]">No Active Block</p>

      {nextBlock && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Next Up:
          </span>
          <Badge variant={nextBlock.blockType}>{nextBlock.blockType}</Badge>
          <span className="text-sm text-[var(--text-primary)]">
            {nextBlock.title}
          </span>
          <span className="text-sm text-[var(--text-secondary)]">
            {formatTime(nextBlock.startTime)}
          </span>
        </div>
      )}

      {!showForm ? (
        <Button
          variant="primary"
          className="mt-4"
          onClick={() => setShowForm(true)}
        >
          Start Emergency Block
        </Button>
      ) : (
        <div className="mt-4 flex items-end justify-center gap-2">
          <div className="flex flex-col items-start gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Emergency block"
              className="rounded-md bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col items-start gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="rounded-md bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              {[15, 25, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              startEmergencyBlock({
                title: title || undefined,
                durationMinutes: duration,
              });
              setShowForm(false);
              setTitle("");
            }}
          >
            Start
          </Button>
          <Button variant="ghost" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function TodayProgress() {
  const dailySummary = useAnalyticsStore((s) => s.dailySummary);
  const todayBlocks = useScheduleStore((s) => s.todayBlocks);

  const now = Date.now();
  const scheduledPast = todayBlocks.filter((b) => b.endTime <= now).length;
  const completed = dailySummary?.completedBlocks ?? 0;

  const stats = [
    {
      label: "Focus Time",
      value: formatFocusTime(dailySummary?.focusMinutes ?? 0),
    },
    {
      label: "Blocks Done",
      value: `${completed}/${scheduledPast || completed}`,
    },
    {
      label: "Tasks Done",
      value: String(dailySummary?.tasksCompleted ?? 0),
    },
    {
      label: "Apps Blocked",
      value: String(dailySummary?.processesKilled ?? 0),
    },
  ];

  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        Today
      </span>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-[var(--bg-secondary)] p-4"
          >
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {s.value}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockDecisionModal() {
  const prompt = useScheduleStore((s) => s.blockDecisionPrompt);
  const setPrompt = useScheduleStore((s) => s.setBlockDecisionPrompt);
  const completeCurrentBlock = useScheduleStore(
    (s) => s.completeCurrentBlock,
  );
  const extendCurrentBlock = useScheduleStore((s) => s.extendCurrentBlock);
  const continueCurrentBlock = useScheduleStore(
    (s) => s.continueCurrentBlock,
  );

  if (!prompt) return null;

  const handleComplete = async () => {
    await completeCurrentBlock();
    setPrompt(null);
  };

  const handleExtend = async () => {
    await extendCurrentBlock(5);
    setPrompt(null);
  };

  const handleContinue = async () => {
    await continueCurrentBlock();
    setPrompt(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm rounded-lg bg-[var(--bg-secondary)] p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
          Block finished: {prompt.block.title}
        </h3>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={handleComplete}>
            Complete
          </Button>
          <Button variant="secondary" onClick={handleExtend}>
            Extend +5m
          </Button>
          <Button variant="ghost" onClick={handleContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { currentBlock, fetchCurrentBlock, fetchNextBlock, fetchTodayBlocks } =
    useScheduleStore();
  const { fetchDailySummary } = useAnalyticsStore();
  const { fetchTasks } = useTaskStore();

  useEffect(() => {
    fetchCurrentBlock();
    fetchNextBlock();
    fetchTodayBlocks();
    fetchDailySummary(todayDateString());
    fetchTasks();
  }, [fetchCurrentBlock, fetchNextBlock, fetchTodayBlocks, fetchDailySummary, fetchTasks]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      {currentBlock ? (
        <>
          <CurrentBlockCard />
          <NextBlockPreview />
        </>
      ) : (
        <NoActiveBlock />
      )}

      <TodayProgress />
      <BlockDecisionModal />
    </div>
  );
}
