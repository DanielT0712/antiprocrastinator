import { useCallback } from "react";
import { useTauriEvent } from "./useTauriEvent";
import { useGuardStore } from "@/stores/guardStore";
import type { QuitRequiredEvent } from "@/types/guard";

export function useGuardEvents() {
  const setQuitRequired = useGuardStore((s) => s.setQuitRequired);

  const handleQuitRequired = useCallback(
    (event: QuitRequiredEvent) => {
      setQuitRequired(event);
    },
    [setQuitRequired],
  );

  useTauriEvent<QuitRequiredEvent>(
    "guard-quit-required",
    handleQuitRequired,
  );
}
