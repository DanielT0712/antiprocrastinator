import { create } from "zustand";
import * as api from "@/api/guard";
import type { GuardStatus, QuitRequiredEvent } from "@/types/guard";

interface GuardState {
  guardStatus: GuardStatus | null;
  quitRequired: QuitRequiredEvent | null;
  showQuitModal: boolean;

  fetchGuardStatus: () => Promise<void>;
  requestQuit: () => Promise<void>;
  confirmQuit: (phrase: string) => Promise<boolean>;
  suspendGuard: (minutes: number, reason?: string | null) => Promise<boolean>;
  setQuitRequired: (event: QuitRequiredEvent) => void;
  dismissQuitModal: () => void;
}

export const useGuardStore = create<GuardState>((set) => ({
  guardStatus: null,
  quitRequired: null,
  showQuitModal: false,

  fetchGuardStatus: async () => {
    const guardStatus = await api.getGuardStatus();
    set({ guardStatus });
  },

  requestQuit: async () => {
    const challenge = await api.requestQuit();
    set({
      quitRequired: {
        source: "user",
        minimizedToTray: false,
        warning: challenge.warning,
        requiredPhrase: challenge.requiredPhrase,
      },
      showQuitModal: true,
    });
  },

  confirmQuit: async (phrase) => {
    return api.confirmQuit(phrase);
  },

  suspendGuard: async (minutes, reason) => {
    return api.suspendGuard(minutes, reason);
  },

  setQuitRequired: (event) => {
    set({ quitRequired: event, showQuitModal: true });
  },

  dismissQuitModal: () => {
    set({ showQuitModal: false, quitRequired: null });
  },
}));
