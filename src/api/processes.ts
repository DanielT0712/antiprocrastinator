import { invoke } from "@tauri-apps/api/core";
import type {
  BlockedProcessLogEntry,
  EnforcementStatus,
  ProcessCategory,
  ProcessInfo,
  ProcessRule,
} from "@/types/process";

export function getRunningProcesses(): Promise<ProcessInfo[]> {
  return invoke("get_running_processes");
}

export function getProcessRules(): Promise<ProcessRule[]> {
  return invoke("get_process_rules");
}

export function setProcessRule(rule: ProcessRule): Promise<ProcessRule> {
  return invoke("set_process_rule", { rule });
}

export function deleteProcessRule(processName: string): Promise<void> {
  return invoke("delete_process_rule", { process_name: processName });
}

export function getProcessCategories(): Promise<ProcessCategory[]> {
  return invoke("get_process_categories");
}

export function getEnforcementStatus(): Promise<EnforcementStatus> {
  return invoke("get_enforcement_status");
}

export function getBlockedProcessesLog(
  from: number,
  to: number,
): Promise<BlockedProcessLogEntry[]> {
  return invoke("get_blocked_processes_log", { from, to });
}
