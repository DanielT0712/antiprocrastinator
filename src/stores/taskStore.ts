import { create } from "zustand";
import * as api from "@/api/tasks";
import type {
  NewTask,
  Task,
  TaskFilter,
  TaskGroup,
  TaskUpdate,
} from "@/types/task";

interface TaskState {
  tasks: Task[];
  taskGroups: TaskGroup[];
  filter: TaskFilter;
  isLoading: boolean;

  fetchTasks: (filter?: TaskFilter | null) => Promise<void>;
  searchTasks: (query: string) => Promise<void>;
  createTask: (task: NewTask) => Promise<Task>;
  updateTask: (id: number, updates: TaskUpdate) => Promise<Task>;
  deleteTask: (id: number) => Promise<void>;
  fetchTaskGroups: () => Promise<void>;
  createTaskGroup: (name: string, color?: string | null) => Promise<TaskGroup>;
  setFilter: (filter: TaskFilter) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  taskGroups: [],
  filter: {},
  isLoading: false,

  fetchTasks: async (filter) => {
    set({ isLoading: true });
    const f = filter ?? get().filter;
    const tasks = await api.getTasks(f);
    set({ tasks, isLoading: false });
  },

  searchTasks: async (query) => {
    set({ isLoading: true });
    const tasks = await api.searchTasks(query);
    set({ tasks, isLoading: false });
  },

  createTask: async (task) => {
    const created = await api.createTask(task);
    await get().fetchTasks();
    return created;
  },

  updateTask: async (id, updates) => {
    const updated = await api.updateTask(id, updates);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
    }));
    return updated;
  },

  deleteTask: async (id) => {
    await api.deleteTask(id);
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
  },

  fetchTaskGroups: async () => {
    const taskGroups = await api.getTaskGroups();
    set({ taskGroups });
  },

  createTaskGroup: async (name, color) => {
    const group = await api.createTaskGroup(name, color);
    set((state) => ({ taskGroups: [...state.taskGroups, group] }));
    return group;
  },

  setFilter: (filter) => {
    set({ filter });
  },
}));
