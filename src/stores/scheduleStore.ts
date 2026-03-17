import { create } from "zustand";
import * as api from "@/api/schedule";
import type {
  BlockDecisionPrompt,
  EmergencyBlockRequest,
  ScheduleActionResult,
  TimeBlock,
} from "@/types/schedule";

interface ScheduleState {
  currentBlock: TimeBlock | null;
  nextBlock: TimeBlock | null;
  todayBlocks: TimeBlock[];
  timerRemainingSecs: number;
  timerTotalSecs: number;
  blockDecisionPrompt: BlockDecisionPrompt | null;
  isLoading: boolean;

  fetchCurrentBlock: () => Promise<void>;
  fetchNextBlock: () => Promise<void>;
  fetchTodayBlocks: () => Promise<void>;
  setTimerTick: (remaining: number, total: number) => void;
  setCurrentBlock: (block: TimeBlock | null) => void;
  setBlockDecisionPrompt: (prompt: BlockDecisionPrompt | null) => void;
  completeCurrentBlock: () => Promise<ScheduleActionResult>;
  skipCurrentBlock: () => Promise<ScheduleActionResult>;
  extendCurrentBlock: (minutes: number) => Promise<ScheduleActionResult>;
  pauseCurrentBlock: () => Promise<ScheduleActionResult>;
  resumeCurrentBlock: () => Promise<ScheduleActionResult>;
  continueCurrentBlock: () => Promise<ScheduleActionResult>;
  startEmergencyBlock: (
    request: EmergencyBlockRequest,
  ) => Promise<ScheduleActionResult>;
}

function todayRange(): { from: number; to: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.getTime(), to: end.getTime() };
}

function applyResult(
  set: (fn: (state: ScheduleState) => Partial<ScheduleState>) => void,
  result: ScheduleActionResult,
) {
  set(() => ({
    currentBlock: result.currentBlock,
  }));
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  currentBlock: null,
  nextBlock: null,
  todayBlocks: [],
  timerRemainingSecs: 0,
  timerTotalSecs: 0,
  blockDecisionPrompt: null,
  isLoading: false,

  fetchCurrentBlock: async () => {
    set(() => ({ isLoading: true }));
    const block = await api.getCurrentBlock();
    set(() => ({ currentBlock: block, isLoading: false }));
  },

  fetchNextBlock: async () => {
    const block = await api.getNextBlock();
    set(() => ({ nextBlock: block }));
  },

  fetchTodayBlocks: async () => {
    const { from, to } = todayRange();
    const blocks = await api.getScheduleRange(from, to);
    set(() => ({ todayBlocks: blocks }));
  },

  setTimerTick: (remaining, total) => {
    set(() => ({ timerRemainingSecs: remaining, timerTotalSecs: total }));
  },

  setCurrentBlock: (block) => {
    set(() => ({ currentBlock: block }));
  },

  setBlockDecisionPrompt: (prompt) => {
    set(() => ({ blockDecisionPrompt: prompt }));
  },

  completeCurrentBlock: async () => {
    const result = await api.completeCurrentBlock();
    applyResult(set, result);
    return result;
  },

  skipCurrentBlock: async () => {
    const result = await api.skipCurrentBlock();
    applyResult(set, result);
    return result;
  },

  extendCurrentBlock: async (minutes) => {
    const result = await api.extendCurrentBlock(minutes);
    applyResult(set, result);
    return result;
  },

  pauseCurrentBlock: async () => {
    const result = await api.pauseCurrentBlock();
    applyResult(set, result);
    return result;
  },

  resumeCurrentBlock: async () => {
    const result = await api.resumeCurrentBlock();
    applyResult(set, result);
    return result;
  },

  continueCurrentBlock: async () => {
    const result = await api.continueCurrentBlock();
    applyResult(set, result);
    return result;
  },

  startEmergencyBlock: async (request) => {
    const result = await api.startEmergencyBlock(request);
    applyResult(set, result);
    return result;
  },
}));
