export type BlockType = "work" | "break" | "sleep" | "meal" | "custom";

export type BlockStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "skipped"
  | "paused";

export type BlockSource = "manual" | "template" | "planner" | "emergency";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

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
  before: TimeBlock | null;
  after: TimeBlock | null;
}

export interface ScheduleMutationResult {
  currentBlock: TimeBlock | null;
  blocks: TimeBlock[];
  warnings: ScheduleWarning[];
  pseudoDeadline: number | null;
  mutations: ScheduleMutation[];
}

export type ScheduleActionResult = ScheduleMutationResult;
export type ScheduleRebuildResult = ScheduleMutationResult;

export interface ScheduleMutationHistoryEntry {
  id: number;
  action: string;
  payloadJson: string;
  occurredAt: number;
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

export interface NewTimeBlock {
  title: string;
  blockType: BlockType;
  startTime: number;
  endTime: number;
  taskId?: number | null;
  intensity?: number;
  source?: BlockSource | null;
  isProtected?: boolean | null;
  enforcementProfile?: string | null;
}

export interface TimeBlockUpdate {
  title?: string;
  blockType?: BlockType;
  startTime?: number;
  endTime?: number;
  taskId?: number | null;
  status?: BlockStatus;
  intensity?: number;
  source?: BlockSource;
  isProtected?: boolean;
  enforcementProfile?: string | null;
}

export interface EmergencyBlockRequest {
  title?: string | null;
  durationMinutes: number;
}

export interface WeeklyTemplate {
  defaultWorkMinutes: number;
  defaultBreakMinutes: number;
  days: DayTemplate[];
  fixedBlocks: FixedTemplateBlock[];
}

export interface DayTemplate {
  day: Weekday;
  enabled: boolean;
  sleepStartMinute: number | null;
  sleepEndMinute: number | null;
  workMinutes: number | null;
  breakMinutes: number | null;
}

export interface FixedTemplateBlock {
  title: string;
  blockType: BlockType;
  daysOfWeek: Weekday[];
  startMinute: number;
  durationMinutes: number;
  intensity: number;
}
