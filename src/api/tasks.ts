import { invoke } from "@tauri-apps/api/core";
import type {
  NewTask,
  Task,
  TaskFilter,
  TaskGroup,
  TaskStats,
  TaskUpdate,
} from "@/types/task";

export function getTasks(filter?: TaskFilter | null): Promise<Task[]> {
  return invoke("get_tasks", { filter: filter ?? null });
}

export function searchTasks(query: string): Promise<Task[]> {
  return invoke("search_tasks", { query });
}

export function createTask(task: NewTask): Promise<Task> {
  return invoke("create_task", { task });
}

export function updateTask(id: number, updates: TaskUpdate): Promise<Task> {
  return invoke("update_task", { id, updates });
}

export function deleteTask(id: number): Promise<void> {
  return invoke("delete_task", { id });
}

export function getTaskGroups(): Promise<TaskGroup[]> {
  return invoke("get_task_groups");
}

export function createTaskGroup(
  name: string,
  color?: string | null,
): Promise<TaskGroup> {
  return invoke("create_task_group", { name, color: color ?? null });
}

export function getTaskStats(taskId: number): Promise<TaskStats> {
  return invoke("get_task_stats", { task_id: taskId });
}
