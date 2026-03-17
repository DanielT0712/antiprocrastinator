import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useScheduleStore } from "@/stores/scheduleStore";
import { useConfigStore } from "@/stores/configStore";
import { useGuardStore } from "@/stores/guardStore";
import { useProcessStore } from "@/stores/processStore";
import { useScheduleEvents } from "@/hooks/useScheduleEvents";
import { useProcessEvents } from "@/hooks/useProcessEvents";
import { useGuardEvents } from "@/hooks/useGuardEvents";
import { Sidebar } from "./Sidebar";
import { QuitChallengeModal } from "../common/QuitChallengeModal";
import { ProcessWarningOverlay } from "../common/ProcessWarningOverlay";

export function AppShell() {
  const fetchCurrentBlock = useScheduleStore((s) => s.fetchCurrentBlock);
  const fetchNextBlock = useScheduleStore((s) => s.fetchNextBlock);
  const fetchTodayBlocks = useScheduleStore((s) => s.fetchTodayBlocks);
  const fetchPreferences = useConfigStore((s) => s.fetchPreferences);
  const fetchGuardStatus = useGuardStore((s) => s.fetchGuardStatus);
  const showQuitModal = useGuardStore((s) => s.showQuitModal);
  const activeWarnings = useProcessStore((s) => s.activeWarnings);

  useScheduleEvents();
  useProcessEvents();
  useGuardEvents();

  useEffect(() => {
    fetchCurrentBlock();
    fetchNextBlock();
    fetchTodayBlocks();
    fetchPreferences();
    fetchGuardStatus();
  }, [
    fetchCurrentBlock,
    fetchNextBlock,
    fetchTodayBlocks,
    fetchPreferences,
    fetchGuardStatus,
  ]);

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
      {showQuitModal && <QuitChallengeModal />}
      {activeWarnings.length > 0 && <ProcessWarningOverlay />}
    </div>
  );
}
