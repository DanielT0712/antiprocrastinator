import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AppCategory,
  BlockDecisionPrompt,
  EmergencyBlockRequest,
  EnforcementProfile,
  EnforcementProfileOverride,
  GuardStatus,
  KnownApp,
  NewTask,
  ScheduleMutationResult,
  ScheduleWarning,
  Task,
  TaskGroup,
  TaskUpdate,
  TimeBlock,
  TimerTickPayload,
  UserPreferences,
} from './types';

export const api = {
  // Schedule
  getCurrentBlock: () => invoke<TimeBlock | null>('get_current_block'),
  getNextBlock: () => invoke<TimeBlock | null>('get_next_block'),
  getProjectedFinish: (taskId: number) =>
    invoke<number | null>('get_projected_finish', { taskId }),
  getPauseBufferMinutes: () => invoke<number>('get_pause_buffer_minutes'),
  getScheduleRange: (from: number, to: number) =>
    invoke<TimeBlock[]>('get_schedule_range', { from, to }),

  completeCurrentBlock: () =>
    invoke<ScheduleMutationResult>('complete_current_block'),
  skipCurrentBlock: () => invoke<ScheduleMutationResult>('skip_current_block'),
  extendCurrentBlock: (minutes: number) =>
    invoke<ScheduleMutationResult>('extend_current_block', { minutes }),
  pauseCurrentBlock: () =>
    invoke<ScheduleMutationResult>('pause_current_block'),
  resumeCurrentBlock: () =>
    invoke<ScheduleMutationResult>('resume_current_block'),
  continueCurrentBlock: () =>
    invoke<ScheduleMutationResult>('continue_current_block'),
  startEmergencyBlock: (request: EmergencyBlockRequest) =>
    invoke<ScheduleMutationResult>('start_emergency_block', { request }),
  rebuildSchedule: (from?: number) =>
    invoke<ScheduleMutationResult>('rebuild_schedule', { from: from ?? null }),

  // Tasks
  getTasks: () => invoke<Task[]>('get_tasks', { filter: null }),
  searchTasks: (query: string) => invoke<Task[]>('search_tasks', { query }),
  createTask: (task: NewTask) => invoke<Task>('create_task', { task }),
  updateTask: (id: number, updates: TaskUpdate) =>
    invoke<Task>('update_task', { id, updates }),
  deleteTask: (id: number) => invoke<void>('delete_task', { id }),
  getTaskGroups: () => invoke<TaskGroup[]>('get_task_groups'),
  createTaskGroup: (name: string, color: string | null = null) =>
    invoke<TaskGroup>('create_task_group', { name, color }),

  // Config
  getPreferences: () => invoke<UserPreferences>('get_preferences'),
  updatePreferences: (updates: Partial<UserPreferences>) =>
    invoke<UserPreferences>('update_preferences', { updates }),

  // Guard
  getGuardStatus: () => invoke<GuardStatus>('get_guard_status'),
  requestQuit: () =>
    invoke<{ warning: string; requiredPhrase: string }>('request_quit'),
  confirmQuit: (phrase: string) => invoke<boolean>('confirm_quit', { phrase }),
  suspendGuard: (durationMinutes: number, reason: string | null = null) =>
    invoke<boolean>('suspend_guard', { durationMinutes, reason }),

  // Processes / Apps
  getKnownApps: () => invoke<KnownApp[]>('get_known_apps'),
  refreshKnownAppsInventory: () =>
    invoke<KnownApp[]>('refresh_known_apps_inventory'),
  getEmergencyAllowlist: () => invoke<KnownApp[]>('get_emergency_allowlist'),
  getEmergencyBlockedCategories: () =>
    invoke<string[]>('get_emergency_blocked_categories'),
  getAppCategories: () => invoke<AppCategory[]>('get_app_categories'),
  upsertAppCategory: (input: { name: string }) =>
    invoke<AppCategory>('upsert_app_category', { input }),
  deleteAppCategory: (name: string) =>
    invoke<void>('delete_app_category', { name }),
  getEnforcementProfiles: () =>
    invoke<EnforcementProfile[]>('get_enforcement_profiles'),
  upsertEnforcementProfile: (input: {
    name: string;
    parentName?: string | null;
  }) => invoke<EnforcementProfile>('upsert_enforcement_profile', { input }),
  deleteEnforcementProfile: (name: string) =>
    invoke<void>('delete_enforcement_profile', { name }),
  getEnforcementProfileOverrides: () =>
    invoke<EnforcementProfileOverride[]>('get_enforcement_profile_overrides'),
  setEnforcementProfileOverride: (input: {
    profileName: string;
    subjectType: 'app' | 'category' | 'browser_target';
    subjectKey: string;
    decision: 'allow' | 'block';
  }) =>
    invoke<EnforcementProfileOverride>('set_enforcement_profile_override', {
      override: input,
    }),
  deleteEnforcementProfileOverride: (
    profileName: string,
    subjectType: string,
    subjectKey: string,
  ) =>
    invoke<void>('delete_enforcement_profile_override', {
      profileName,
      subjectType,
      subjectKey,
    }),
};

// Event subscriptions
export type AppEventMap = {
  'timer-tick': TimerTickPayload;
  'block-changed': TimeBlock;
  'block-finished-prompt': BlockDecisionPrompt;
  'schedule-warning': ScheduleWarning[];
};

export function onAppEvent<K extends keyof AppEventMap>(
  name: K,
  handler: (payload: AppEventMap[K]) => void,
): Promise<UnlistenFn> {
  return listen<AppEventMap[K]>(name, (event) => handler(event.payload));
}
