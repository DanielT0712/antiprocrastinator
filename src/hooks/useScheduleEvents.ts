import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useScheduleStore } from "@/stores/scheduleStore";
import type {
  BlockDecisionPrompt,
  TimerTickPayload,
  TimeBlock,
} from "@/types/schedule";

export function useScheduleEvents() {
  const setTimerTick = useScheduleStore((s) => s.setTimerTick);
  const setCurrentBlock = useScheduleStore((s) => s.setCurrentBlock);
  const setBlockDecisionPrompt = useScheduleStore(
    (s) => s.setBlockDecisionPrompt,
  );
  const fetchNextBlock = useScheduleStore((s) => s.fetchNextBlock);

  const handleTimerTick = useCallback(
    (payload: TimerTickPayload) => {
      setTimerTick(payload.remainingSecs, payload.totalSecs);
    },
    [setTimerTick],
  );

  const handleBlockChanged = useCallback(
    (block: TimeBlock | null) => {
      setCurrentBlock(block);
      fetchNextBlock();
    },
    [setCurrentBlock, fetchNextBlock],
  );

  const handleBlockFinishedPrompt = useCallback(
    (prompt: BlockDecisionPrompt) => {
      setBlockDecisionPrompt(prompt);
    },
    [setBlockDecisionPrompt],
  );

  useTauriEvent<TimerTickPayload>("timer-tick", handleTimerTick);
  useTauriEvent<TimeBlock | null>("block-changed", handleBlockChanged);
  useTauriEvent<BlockDecisionPrompt>(
    "block-finished-prompt",
    handleBlockFinishedPrompt,
  );
}
