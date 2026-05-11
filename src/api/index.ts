import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AppCategory,
  BlockDecisionPrompt,
  ClassificationAction,
  EmergencyBlockRequest,
  EnforcementProfile,
  EnforcementProfileOverride,
  GuardStatus,
  KnownApp,
  KnownBrowserTarget,
  KnownBrowserTargetInput,
  KnownBrowserTargetUpdate,
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

  addTimeBlock: (block: {
    title: string;
    blockType: 'work' | 'break' | 'sleep' | 'meal' | 'custom';
    startTime: number;
    endTime: number;
    taskId?: number | null;
    intensity?: number;
    source?: 'manual' | 'template' | 'planner' | 'emergency';
    isProtected?: boolean | null;
    enforcementProfile?: string | null;
  }) => invoke<ScheduleMutationResult>('add_time_block', { block }),
  updateTimeBlock: (id: number, updates: Partial<TimeBlock>) =>
    invoke<ScheduleMutationResult>('update_time_block', { id, updates }),
  deleteTimeBlock: (id: number) =>
    invoke<ScheduleMutationResult>('delete_time_block', { id }),

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
  updateTaskGroup: (
    id: number,
    name: string | null = null,
    color: { value: string | null } | null = null,
  ) =>
    invoke<TaskGroup>('update_task_group', {
      id,
      name,
      color: color ? color.value : null,
    }),
  deleteTaskGroup: (id: number, reassignTo: number | null = null) =>
    invoke<void>('delete_task_group', { id, reassignTo }),
  getPendingClassifications: () =>
    invoke<{ apps: KnownApp[]; browserTargets: KnownBrowserTarget[] }>(
      'get_pending_classifications',
    ),
  getScheduleMutationHistory: (from: number, to: number) =>
    invoke<
      { id: number; action: string; payloadJson: string; occurredAt: number }[]
    >('get_schedule_mutation_history', { from, to }),
  getWeeklyTemplate: () =>
    invoke<unknown | null>('get_weekly_template'),
  saveWeeklyTemplate: (template: unknown) =>
    invoke<unknown>('save_weekly_template', { template }),

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
  updateKnownApp: (
    appKey: string,
    updates: {
      displayName?: string;
      categoryOverride?: { value: string | null };
      categoryNames?: string[];
      classificationAction?: ClassificationAction;
      classificationStatus?: string;
      syncRule?: boolean;
    },
  ) =>
    invoke<KnownApp>('update_known_app', {
      appKey,
      updates: {
        ...updates,
        categoryOverride: updates.categoryOverride
          ? updates.categoryOverride.value
          : undefined,
      },
    }),
  getEmergencyAllowlist: () => invoke<KnownApp[]>('get_emergency_allowlist'),
  getEmergencyBlockedCategories: () =>
    invoke<string[]>('get_emergency_blocked_categories'),
  getKnownBrowserTargets: () =>
    invoke<KnownBrowserTarget[]>('get_known_browser_targets'),
  updateKnownBrowserTarget: (
    targetKey: string,
    updates: KnownBrowserTargetUpdate,
  ) =>
    invoke<KnownBrowserTarget>('update_known_browser_target', {
      targetKey,
      updates,
    }),
  createKnownBrowserTarget: (target: KnownBrowserTargetInput) =>
    invoke<KnownBrowserTarget>('create_known_browser_target', { target }),
  getAppCategories: () => invoke<AppCategory[]>('get_app_categories'),
  upsertAppCategory: (input: { name: string }) =>
    invoke<AppCategory>('upsert_app_category', { category: input }),
  deleteAppCategory: (name: string) =>
    invoke<void>('delete_app_category', { name }),
  getEnforcementProfiles: () =>
    invoke<EnforcementProfile[]>('get_enforcement_profiles'),
  upsertEnforcementProfile: (input: {
    name: string;
    parentName?: string | null;
  }) =>
    invoke<EnforcementProfile>('upsert_enforcement_profile', {
      profile: input,
    }),
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
      overrideEntry: input,
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
