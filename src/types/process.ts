import type { BlockType } from "./schedule";

export type ClassificationAction =
  | "unclassified"
  | "always_ban"
  | "ban_during_work"
  | "never_ban";

export type EnforcementDecision = "allow" | "block";

export type ProcessAction =
  | "always_block"
  | "block_during_work"
  | "allow_during_break"
  | "warn"
  | "always_allow";

export interface ProcessRule {
  processName: string;
  category: string | null;
  action: ProcessAction;
  warnSeconds: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProcessCategory {
  name: string;
  processNames: string[];
  defaultAction: ProcessAction;
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
  subjectType: string;
  subjectKey: string;
  decision: EnforcementDecision;
  createdAt: number;
  updatedAt: number;
}

export interface EnforcementProfileInput {
  name: string;
  parentName?: string | null;
}

export interface AppCategoryInput {
  name: string;
}

export interface EnforcementProfileOverrideInput {
  profileName: string;
  subjectType: string;
  subjectKey: string;
  decision: EnforcementDecision;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  exePath: string | null;
  memoryBytes: number;
}

export interface FocusedWindowInfo {
  processName: string | null;
  pid: number | null;
  title: string | null;
}

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

export interface KnownAppUpdate {
  displayName?: string;
  categoryOverride?: string | null;
  categoryNames?: string[];
  classificationAction?: ClassificationAction;
  classificationStatus?: string;
  syncRule?: boolean;
}

export interface KnownAppInput {
  displayName: string;
  executableName?: string | null;
  executablePath?: string | null;
  appPath?: string | null;
  categoryNames?: string[];
  categoryOverride?: string | null;
  classificationAction: ClassificationAction;
  syncRule?: boolean | null;
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

export interface PendingClassificationBatch {
  apps: KnownApp[];
  browserTargets: KnownBrowserTarget[];
}

export interface HistoryEntry {
  id: number;
  entityKind: string;
  entityKey: string;
  action: string;
  payloadJson: string | null;
  occurredAt: number;
}

export interface ProcessWarning {
  processName: string;
  secondsUntilKill: number;
  warningCount: number;
  windowTitle: string | null;
  matchReason: string | null;
}

export interface BlockedProcessLogEntry {
  id: number;
  processName: string;
  ruleAction: ProcessAction;
  blockId: number | null;
  taskId: number | null;
  occurredAt: number;
}

export interface EnforcementStatus {
  lastScanAt: number | null;
  activeBlockType: BlockType | null;
  activeProfile: string | null;
  focusedWindow: FocusedWindowInfo | null;
  warnings: ProcessWarning[];
  lastKilledProcesses: string[];
}
