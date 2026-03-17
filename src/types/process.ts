import type { BlockType } from "./schedule";

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

export interface ProcessInfo {
  pid: number;
  name: string;
  exePath: string | null;
  memoryBytes: number;
}

export interface ProcessWarning {
  processName: string;
  secondsUntilKill: number;
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
  warnings: ProcessWarning[];
  lastKilledProcesses: string[];
}
