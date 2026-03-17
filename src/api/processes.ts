import { invoke } from "@tauri-apps/api/core";
import type {
  AppCategory,
  AppCategoryInput,
  BlockedProcessLogEntry,
  EnforcementProfile,
  EnforcementProfileInput,
  EnforcementProfileOverride,
  EnforcementProfileOverrideInput,
  EnforcementStatus,
  FocusedWindowInfo,
  HistoryEntry,
  KnownApp,
  KnownAppInput,
  KnownAppUpdate,
  KnownBrowserTarget,
  KnownBrowserTargetInput,
  KnownBrowserTargetUpdate,
  PendingClassificationBatch,
  ProcessCategory,
  ProcessInfo,
  ProcessRule,
} from "@/types/process";

export function getRunningProcesses(): Promise<ProcessInfo[]> {
  return invoke("get_running_processes");
}

export function getFocusedWindow(): Promise<FocusedWindowInfo | null> {
  return invoke("get_focused_window");
}

export function getKnownApps(): Promise<KnownApp[]> {
  return invoke("get_known_apps");
}

export function refreshKnownAppsInventory(): Promise<KnownApp[]> {
  return invoke("refresh_known_apps_inventory");
}

export function updateKnownApp(
  appKey: string,
  updates: KnownAppUpdate,
): Promise<KnownApp> {
  return invoke("update_known_app", { app_key: appKey, updates });
}

export function createKnownApp(app: KnownAppInput): Promise<KnownApp> {
  return invoke("create_known_app", { app });
}

export function getKnownBrowserTargets(): Promise<KnownBrowserTarget[]> {
  return invoke("get_known_browser_targets");
}

export function updateKnownBrowserTarget(
  targetKey: string,
  updates: KnownBrowserTargetUpdate,
): Promise<KnownBrowserTarget> {
  return invoke("update_known_browser_target", {
    target_key: targetKey,
    updates,
  });
}

export function createKnownBrowserTarget(
  target: KnownBrowserTargetInput,
): Promise<KnownBrowserTarget> {
  return invoke("create_known_browser_target", { target });
}

export function getPendingClassifications(): Promise<PendingClassificationBatch> {
  return invoke("get_pending_classifications");
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

export function getAppCategories(): Promise<AppCategory[]> {
  return invoke("get_app_categories");
}

export function upsertAppCategory(
  category: AppCategoryInput,
): Promise<AppCategory> {
  return invoke("upsert_app_category", { category });
}

export function deleteAppCategory(name: string): Promise<void> {
  return invoke("delete_app_category", { name });
}

export function getEnforcementProfiles(): Promise<EnforcementProfile[]> {
  return invoke("get_enforcement_profiles");
}

export function upsertEnforcementProfile(
  profile: EnforcementProfileInput,
): Promise<EnforcementProfile> {
  return invoke("upsert_enforcement_profile", { profile });
}

export function deleteEnforcementProfile(name: string): Promise<void> {
  return invoke("delete_enforcement_profile", { name });
}

export function getEnforcementProfileOverrides(
  profileName: string,
): Promise<EnforcementProfileOverride[]> {
  return invoke("get_enforcement_profile_overrides", {
    profile_name: profileName,
  });
}

export function setEnforcementProfileOverride(
  overrideEntry: EnforcementProfileOverrideInput,
): Promise<EnforcementProfileOverride> {
  return invoke("set_enforcement_profile_override", {
    override_entry: overrideEntry,
  });
}

export function deleteEnforcementProfileOverride(
  profileName: string,
  subjectType: string,
  subjectKey: string,
): Promise<void> {
  return invoke("delete_enforcement_profile_override", {
    profile_name: profileName,
    subject_type: subjectType,
    subject_key: subjectKey,
  });
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

export function getEnforcementHistory(
  from: number,
  to: number,
): Promise<HistoryEntry[]> {
  return invoke("get_enforcement_history", { from, to });
}
