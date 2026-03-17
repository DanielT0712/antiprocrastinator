import { create } from "zustand";
import * as api from "@/api/config";
import type { UserPreferences } from "@/types/config";

interface ConfigState {
  preferences: UserPreferences | null;
  isLoading: boolean;

  fetchPreferences: () => Promise<void>;
  updatePreferences: (preferences: UserPreferences) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  preferences: null,
  isLoading: false,

  fetchPreferences: async () => {
    set({ isLoading: true });
    const preferences = await api.getPreferences();
    set({ preferences, isLoading: false });
  },

  updatePreferences: async (preferences) => {
    const updated = await api.updatePreferences(preferences);
    set({ preferences: updated });
  },
}));
