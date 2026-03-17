import { invoke } from "@tauri-apps/api/core";
import type {
  DailySummary,
  FocusStatPoint,
  ProcessKillStat,
  TaskCompletionStat,
} from "@/types/analytics";

export function getDailySummary(date: string): Promise<DailySummary> {
  return invoke("get_daily_summary", { date });
}

export function getFocusStats(
  from: number,
  to: number,
): Promise<FocusStatPoint[]> {
  return invoke("get_focus_stats", { from, to });
}

export function getTaskCompletionStats(
  from: number,
  to: number,
): Promise<TaskCompletionStat[]> {
  return invoke("get_task_completion_stats", { from, to });
}

export function getProcessKillStats(
  from: number,
  to: number,
): Promise<ProcessKillStat[]> {
  return invoke("get_process_kill_stats", { from, to });
}
