export type BlockType = 'work' | 'break' | 'sleep' | 'meal' | 'custom';
export type BlockStatus = 'scheduled' | 'active' | 'completed' | 'skipped' | 'paused';
export type BlockSource = 'manual' | 'template' | 'planner' | 'emergency';

export interface TimeBlock {
  id: number;
  title: string;
  blockType: BlockType;
  startTime: number;
  endTime: number;
  taskId: number | null;
  status: BlockStatus;
  intensity: number;
  source: BlockSource;
  isProtected: boolean;
  enforcementProfile: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleWarning {
  kind: string;
  message: string;
}

export interface ScheduleMutation {
  kind: string;
  blockId: number | null;
  taskId: number | null;
  before?: TimeBlock | null;
  after?: TimeBlock | null;
}

export interface ScheduleMutationResult {
  currentBlock: TimeBlock | null;
  blocks: TimeBlock[];
  warnings: ScheduleWarning[];
  pseudoDeadline?: number | null;
  mutations: ScheduleMutation[];
}

export interface BlockDecisionPrompt {
  block: TimeBlock;
  nextWorkStart: number | null;
  continuing: boolean;
}

export interface TimerTickPayload {
  remainingSecs: number;
  totalSecs: number;
}

export interface EmergencyBlockRequest {
  title?: string | null;
  durationMinutes: number;
  reason?: string | null;
}

export type TaskKind = 'flexible' | 'fixed';
export type RecurrenceKind =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'once';

export interface Task {
  id: number;
  name: string;
  groupId: number | null;
  priority: number;
  estimatedMinutes: number | null;
  deadline: number | null;
  maxChunkMinutes: number | null;
  minChunkMinutes: number | null;
  minimumRestMinutes: number | null;
  workRatio: number | null;
  restRatio: number | null;
  protectGeneratedBlocks: boolean;
  enforcementProfile: string | null;
  kind: TaskKind;
  fixedWindowStartMinute: number | null;
  fixedWindowEndMinute: number | null;
  recurrenceKind: RecurrenceKind;
  recurrenceDaysMask: number;
  recurrenceAnchorDate: number | null;
  recurrenceDates: number[] | null;
  recurrenceOverrides: string | null;
  averagePriority: number;
  averageActualMinutes: number | null;
  completionCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskGroup {
  id: number;
  name: string;
  color: string | null;
  createdAt: number;
}

export interface NewTask {
  name: string;
  groupId?: number | null;
  priority?: number | null;
  estimatedMinutes?: number | null;
  deadline?: number | null;
  maxChunkMinutes?: number | null;
  minChunkMinutes?: number | null;
  minimumRestMinutes?: number | null;
  workRatio?: number | null;
  restRatio?: number | null;
  protectGeneratedBlocks?: boolean | null;
  enforcementProfile?: string | null;
  kind?: TaskKind | null;
  fixedWindowStartMinute?: number | null;
  fixedWindowEndMinute?: number | null;
  recurrenceKind?: RecurrenceKind | null;
  recurrenceDaysMask?: number | null;
  recurrenceAnchorDate?: number | null;
  recurrenceDates?: number[] | null;
  recurrenceOverrides?: string | null;
}

export interface TaskUpdate {
  name?: string;
  groupId?: number | null;
  priority?: number;
  estimatedMinutes?: number | null;
  deadline?: number | null;
  maxChunkMinutes?: number | null;
  minChunkMinutes?: number | null;
  minimumRestMinutes?: number | null;
  workRatio?: number | null;
  restRatio?: number | null;
  protectGeneratedBlocks?: boolean;
  enforcementProfile?: string | null;
  kind?: TaskKind;
  fixedWindowStartMinute?: number | null;
  fixedWindowEndMinute?: number | null;
  recurrenceKind?: RecurrenceKind;
  recurrenceDaysMask?: number;
  recurrenceAnchorDate?: number | null;
  recurrenceDates?: number[] | null;
  recurrenceOverrides?: string | null;
}

export interface UserPreferences {
  theme: string;
  workDurationMinutes: number;
  breakDurationMinutes: number;
  minimumRestMinutes: number;
  maximumRestMultiplier: number;
  processWarningSeconds: number;
  processCountdownSeconds: number;
  processScanIntervalSeconds: number;
  notificationsEnabled: boolean;
  minimizeToTray: boolean;
  launchAtLogin: boolean;
  strongGuardEnabled: boolean;
  emergencyBlockMaxMinutes: number;
  emergencyAllowedApps: string[];
  browserTitleAllowKeywords: string[];
  browserTitleBlockKeywords: string[];
  classificationPopupsEnabled: boolean;
  taskGroupClustering: 'priority' | 'group_same_group_tasks' | 'separate_same_group_tasks';
  taskChunkClustering: 'group_same_task_chunks' | 'separate_same_task_chunks';
  clusteringAllowsPriorityInversions: boolean;
  fillDeadGaps: boolean;
  guardRestartDelaySeconds: number;
  suspendPhrase: string;
  suspendCooldownMinutes: number;
}

export interface GuardStatus {
  active: boolean;
  challengePhrase: string;
  supervisorMode: 'enforced' | 'suspended' | 'disabled';
  suspendedUntilEpochSecs: number | null;
  helperRunning: boolean;
}

export type ProcessAction =
  | 'always_block'
  | 'block_during_work'
  | 'allow_during_break'
  | 'warn'
  | 'always_allow';

export type ClassificationAction = 'unclassified' | 'always_ban' | 'ban_during_work' | 'never_ban';
export type EnforcementDecision = 'allow' | 'block';

export interface KnownApp {
  appKey: string;
  displayName: string;
  executableName: string | null;
  executablePath: string | null;
  appPath: string | null;
  platform: string;
  source: string;
  categoryGuess: string | null;
  categoryOverride: string | null;
  effectiveCategory: string | null;
  categories: string[];
  classificationAction: ClassificationAction;
  confidence: number;
  classificationStatus: string;
  firstSeenAt: number;
  lastSeenRunningAt: number | null;
  updatedAt: number;
}

export interface AppCategory {
  name: string;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EnforcementProfile {
  name: string;
  parentName: string | null;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EnforcementProfileOverride {
  profileName: string;
  subjectType: 'app' | 'category' | 'browser_target';
  subjectKey: string;
  decision: EnforcementDecision;
  createdAt: number;
  updatedAt: number;
}

export interface KnownBrowserTarget {
  targetKey: string;
  displayName: string;
  keyword: string;
  categoryName: string | null;
  confidence: number;
  classificationAction: ClassificationAction;
  builtin: boolean;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  updatedAt: number;
}

export interface KnownBrowserTargetUpdate {
  displayName?: string;
  keyword?: string;
  categoryName?: string | null;
  classificationAction?: ClassificationAction;
}

export interface KnownBrowserTargetInput {
  displayName: string;
  keyword: string;
  categoryName?: string | null;
  classificationAction: ClassificationAction;
}
