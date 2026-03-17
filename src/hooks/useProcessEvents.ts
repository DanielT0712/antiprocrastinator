import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useProcessStore } from "@/stores/processStore";
import type { ProcessWarning } from "@/types/process";

export function useProcessEvents() {
  const addWarning = useProcessStore((s) => s.addWarning);
  const removeWarning = useProcessStore((s) => s.removeWarning);

  const handleProcessWarning = useCallback(
    (warning: ProcessWarning) => {
      addWarning(warning);
    },
    [addWarning],
  );

  const handleProcessKilled = useCallback(
    (payload: { processName: string }) => {
      removeWarning(payload.processName);
    },
    [removeWarning],
  );

  useTauriEvent<ProcessWarning>("process-warning", handleProcessWarning);
  useTauriEvent<{ processName: string }>(
    "process-killed",
    handleProcessKilled,
  );
}
