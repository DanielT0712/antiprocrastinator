import { create } from "zustand";
import * as api from "@/api/processes";
import type {
  EnforcementStatus,
  ProcessCategory,
  ProcessInfo,
  ProcessRule,
  ProcessWarning,
} from "@/types/process";

interface ProcessState {
  runningProcesses: ProcessInfo[];
  processRules: ProcessRule[];
  processCategories: ProcessCategory[];
  enforcementStatus: EnforcementStatus | null;
  activeWarnings: ProcessWarning[];

  fetchRunningProcesses: () => Promise<void>;
  fetchProcessRules: () => Promise<void>;
  fetchProcessCategories: () => Promise<void>;
  fetchEnforcementStatus: () => Promise<void>;
  addWarning: (warning: ProcessWarning) => void;
  removeWarning: (processName: string) => void;
}

export const useProcessStore = create<ProcessState>((set) => ({
  runningProcesses: [],
  processRules: [],
  processCategories: [],
  enforcementStatus: null,
  activeWarnings: [],

  fetchRunningProcesses: async () => {
    const runningProcesses = await api.getRunningProcesses();
    set({ runningProcesses });
  },

  fetchProcessRules: async () => {
    const processRules = await api.getProcessRules();
    set({ processRules });
  },

  fetchProcessCategories: async () => {
    const processCategories = await api.getProcessCategories();
    set({ processCategories });
  },

  fetchEnforcementStatus: async () => {
    const enforcementStatus = await api.getEnforcementStatus();
    set({ enforcementStatus });
  },

  addWarning: (warning) => {
    set((state) => ({
      activeWarnings: [
        ...state.activeWarnings.filter(
          (w) => w.processName !== warning.processName,
        ),
        warning,
      ],
    }));
  },

  removeWarning: (processName) => {
    set((state) => ({
      activeWarnings: state.activeWarnings.filter(
        (w) => w.processName !== processName,
      ),
    }));
  },
}));
