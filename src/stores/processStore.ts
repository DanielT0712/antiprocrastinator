import { create } from "zustand";
import * as api from "@/api/processes";
import type {
  EnforcementProfile,
  EnforcementStatus,
  KnownApp,
  KnownAppUpdate,
  KnownBrowserTarget,
  PendingClassificationBatch,
  ProcessRule,
  ProcessWarning,
} from "@/types/process";

interface ProcessState {
  knownApps: KnownApp[];
  browserTargets: KnownBrowserTarget[];
  enforcementStatus: EnforcementStatus | null;
  pendingClassifications: PendingClassificationBatch | null;
  processRules: ProcessRule[];
  enforcementProfiles: EnforcementProfile[];
  activeWarnings: ProcessWarning[];
  isLoading: boolean;

  fetchKnownApps: () => Promise<void>;
  updateKnownApp: (appKey: string, updates: KnownAppUpdate) => Promise<void>;
  fetchBrowserTargets: () => Promise<void>;
  fetchEnforcementStatus: () => Promise<void>;
  fetchPendingClassifications: () => Promise<void>;
  fetchProcessRules: () => Promise<void>;
  fetchEnforcementProfiles: () => Promise<void>;
  addWarning: (warning: ProcessWarning) => void;
  removeWarning: (processName: string) => void;
}

export const useProcessStore = create<ProcessState>((set) => ({
  knownApps: [],
  browserTargets: [],
  enforcementStatus: null,
  pendingClassifications: null,
  processRules: [],
  enforcementProfiles: [],
  activeWarnings: [],
  isLoading: false,

  fetchKnownApps: async () => {
    const knownApps = await api.getKnownApps();
    set({ knownApps });
  },

  updateKnownApp: async (appKey, updates) => {
    const updated = await api.updateKnownApp(appKey, updates);
    set((state) => ({
      knownApps: state.knownApps.map((a) =>
        a.appKey === appKey ? updated : a,
      ),
    }));
  },

  fetchBrowserTargets: async () => {
    const browserTargets = await api.getKnownBrowserTargets();
    set({ browserTargets });
  },

  fetchEnforcementStatus: async () => {
    const enforcementStatus = await api.getEnforcementStatus();
    set({ enforcementStatus });
  },

  fetchPendingClassifications: async () => {
    const pendingClassifications = await api.getPendingClassifications();
    set({ pendingClassifications });
  },

  fetchProcessRules: async () => {
    const processRules = await api.getProcessRules();
    set({ processRules });
  },

  fetchEnforcementProfiles: async () => {
    const enforcementProfiles = await api.getEnforcementProfiles();
    set({ enforcementProfiles });
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
