export interface TaskGroup {
  id: number;
  name: string;
  color: string | null;
  createdAt: number;
}

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
  averagePriority: number;
  averageActualMinutes: number | null;
  completionCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskFilter {
  groupId?: number | null;
  query?: string | null;
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
  averagePriority?: number;
  averageActualMinutes?: number | null;
  completionCount?: number;
}

export interface TaskStats {
  taskId: number;
  averagePriority: number;
  averageActualMinutes: number | null;
  completionCount: number;
}
