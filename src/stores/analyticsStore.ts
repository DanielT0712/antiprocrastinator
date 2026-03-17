import { create } from "zustand";
import * as api from "@/api/analytics";
import type {
  DailySummary,
  FocusStatPoint,
  ProcessKillStat,
  TaskCompletionStat,
} from "@/types/analytics";

interface AnalyticsState {
  dailySummary: DailySummary | null;
  focusStats: FocusStatPoint[];
  taskCompletionStats: TaskCompletionStat[];
  processKillStats: ProcessKillStat[];
  dateRange: { from: number; to: number };

  fetchDailySummary: (date: string) => Promise<void>;
  fetchFocusStats: (from: number, to: number) => Promise<void>;
  fetchTaskCompletionStats: (from: number, to: number) => Promise<void>;
  fetchProcessKillStats: (from: number, to: number) => Promise<void>;
  setDateRange: (from: number, to: number) => void;
}

function defaultDateRange(): { from: number; to: number } {
  const now = new Date();
  const to = now.getTime();
  const from = to - 7 * 24 * 60 * 60 * 1000;
  return { from, to };
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  dailySummary: null,
  focusStats: [],
  taskCompletionStats: [],
  processKillStats: [],
  dateRange: defaultDateRange(),

  fetchDailySummary: async (date) => {
    const dailySummary = await api.getDailySummary(date);
    set({ dailySummary });
  },

  fetchFocusStats: async (from, to) => {
    const focusStats = await api.getFocusStats(from, to);
    set({ focusStats });
  },

  fetchTaskCompletionStats: async (from, to) => {
    const taskCompletionStats = await api.getTaskCompletionStats(from, to);
    set({ taskCompletionStats });
  },

  fetchProcessKillStats: async (from, to) => {
    const processKillStats = await api.getProcessKillStats(from, to);
    set({ processKillStats });
  },

  setDateRange: (from, to) => {
    set({ dateRange: { from, to } });
  },
}));
