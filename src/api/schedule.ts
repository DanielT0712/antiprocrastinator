import { invoke } from "@tauri-apps/api/core";
import type {
  EmergencyBlockRequest,
  NewTimeBlock,
  ScheduleActionResult,
  ScheduleMutationHistoryEntry,
  ScheduleRebuildResult,
  TimeBlock,
  TimeBlockUpdate,
  WeeklyTemplate,
} from "@/types/schedule";

export function getCurrentBlock(): Promise<TimeBlock | null> {
  return invoke("get_current_block");
}

export function getNextBlock(): Promise<TimeBlock | null> {
  return invoke("get_next_block");
}

export function getScheduleRange(
  from: number,
  to: number,
): Promise<TimeBlock[]> {
  return invoke("get_schedule_range", { from, to });
}

export function getScheduleMutationHistory(
  from: number,
  to: number,
): Promise<ScheduleMutationHistoryEntry[]> {
  return invoke("get_schedule_mutation_history", { from, to });
}

export function addTimeBlock(
  block: NewTimeBlock,
): Promise<ScheduleActionResult> {
  return invoke("add_time_block", { block });
}

export function updateTimeBlock(
  id: number,
  updates: TimeBlockUpdate,
): Promise<ScheduleActionResult> {
  return invoke("update_time_block", { id, updates });
}

export function deleteTimeBlock(id: number): Promise<ScheduleActionResult> {
  return invoke("delete_time_block", { id });
}

export function applyWeeklyTemplate(
  template: WeeklyTemplate,
  from: number,
  to: number,
): Promise<ScheduleActionResult> {
  return invoke("apply_weekly_template", { template, from, to });
}

export function getWeeklyTemplate(): Promise<WeeklyTemplate | null> {
  return invoke("get_weekly_template");
}

export function saveWeeklyTemplate(
  template: WeeklyTemplate,
): Promise<WeeklyTemplate> {
  return invoke("save_weekly_template", { template });
}

export function completeCurrentBlock(): Promise<ScheduleActionResult> {
  return invoke("complete_current_block");
}

export function skipCurrentBlock(): Promise<ScheduleActionResult> {
  return invoke("skip_current_block");
}

export function extendCurrentBlock(
  minutes: number,
): Promise<ScheduleActionResult> {
  return invoke("extend_current_block", { minutes });
}

export function pauseCurrentBlock(): Promise<ScheduleActionResult> {
  return invoke("pause_current_block");
}

export function resumeCurrentBlock(): Promise<ScheduleActionResult> {
  return invoke("resume_current_block");
}

export function continueCurrentBlock(): Promise<ScheduleActionResult> {
  return invoke("continue_current_block");
}

export function startEmergencyBlock(
  request: EmergencyBlockRequest,
): Promise<ScheduleActionResult> {
  return invoke("start_emergency_block", { request });
}

export function rebuildSchedule(
  from?: number | null,
): Promise<ScheduleRebuildResult> {
  return invoke("rebuild_schedule", { from: from ?? null });
}
