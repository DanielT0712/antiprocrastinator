export type TaskGroupClusteringMode =
  | "priority"
  | "group_same_group_tasks"
  | "separate_same_group_tasks";

export type TaskChunkClusteringMode =
  | "group_same_task_chunks"
  | "separate_same_task_chunks";

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
  taskGroupClustering: TaskGroupClusteringMode;
  taskChunkClustering: TaskChunkClusteringMode;
  clusteringAllowsPriorityInversions: boolean;
  fillDeadGaps: boolean;
}
