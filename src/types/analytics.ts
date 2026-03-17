export interface DailySummary {
  date: string;
  focusMinutes: number;
  completedBlocks: number;
  skippedBlocks: number;
  tasksCompleted: number;
  processesKilled: number;
}

export interface FocusStatPoint {
  date: string;
  focusMinutes: number;
  completedWorkBlocks: number;
}

export interface TaskCompletionStat {
  taskId: number;
  taskName: string;
  completionCount: number;
  skippedCount: number;
  totalFocusMinutes: number;
}

export interface ProcessKillStat {
  processName: string;
  killCount: number;
  lastOccurredAt: number;
}
