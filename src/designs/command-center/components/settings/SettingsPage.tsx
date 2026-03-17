import { useEffect } from "react";
import { useConfigStore } from "@/stores/configStore";
import type {
  UserPreferences,
  TaskGroupClusteringMode,
  TaskChunkClusteringMode,
} from "@/types/config";
import { Toggle } from "../common/Toggle";
import { Select } from "../common/Select";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--text-primary)]">{label}</span>
      <input
        type="number"
        step={step ?? 1}
        min={min ?? 0}
        className="w-24 bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--bg-tertiary)] rounded-md px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)] transition-colors text-right"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--text-primary)]">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-[var(--text-primary)]">{label}</span>
      <Select options={options} value={value} onChange={onChange} />
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-6 space-y-1">
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { preferences, fetchPreferences, updatePreferences } =
    useConfigStore();

  useEffect(() => {
    if (!preferences) {
      fetchPreferences();
    }
  }, [preferences, fetchPreferences]);

  if (!preferences) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--text-secondary)]">Loading settings...</p>
      </div>
    );
  }

  // Helper to update a single preference field and save immediately
  const update = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => {
    const updated = { ...preferences, [key]: value };
    updatePreferences(updated);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">
        SETTINGS
      </h1>

      {/* Schedule */}
      <SectionCard title="Schedule">
        <NumberField
          label="Work Duration (min)"
          value={preferences.workDurationMinutes}
          onChange={(v) => update("workDurationMinutes", v)}
          min={1}
        />
        <NumberField
          label="Break Duration (min)"
          value={preferences.breakDurationMinutes}
          onChange={(v) => update("breakDurationMinutes", v)}
          min={1}
        />
        <NumberField
          label="Minimum Rest (min)"
          value={preferences.minimumRestMinutes}
          onChange={(v) => update("minimumRestMinutes", v)}
          min={0}
        />
        <NumberField
          label="Max Rest Multiplier"
          value={preferences.maximumRestMultiplier}
          onChange={(v) => update("maximumRestMultiplier", v)}
          step={0.1}
          min={0}
        />
        <ToggleField
          label="Fill Dead Gaps"
          checked={preferences.fillDeadGaps}
          onChange={(v) => update("fillDeadGaps", v)}
        />
      </SectionCard>

      {/* Enforcement */}
      <SectionCard title="Enforcement">
        <NumberField
          label="Warning Seconds"
          value={preferences.processWarningSeconds}
          onChange={(v) => update("processWarningSeconds", v)}
          min={0}
        />
        <NumberField
          label="Countdown Seconds"
          value={preferences.processCountdownSeconds}
          onChange={(v) => update("processCountdownSeconds", v)}
          min={0}
        />
        <NumberField
          label="Scan Interval (sec)"
          value={preferences.processScanIntervalSeconds}
          onChange={(v) => update("processScanIntervalSeconds", v)}
          min={1}
        />
        <NumberField
          label="Emergency Block Max (min)"
          value={preferences.emergencyBlockMaxMinutes}
          onChange={(v) => update("emergencyBlockMaxMinutes", v)}
          min={0}
        />
        <ToggleField
          label="Classification Popups"
          checked={preferences.classificationPopupsEnabled}
          onChange={(v) => update("classificationPopupsEnabled", v)}
        />
      </SectionCard>

      {/* Clustering */}
      <SectionCard title="Clustering">
        <SelectField
          label="Task Group Clustering"
          value={preferences.taskGroupClustering}
          options={[
            { value: "priority", label: "Priority" },
            { value: "group_same_group_tasks", label: "Group Same Group Tasks" },
            { value: "separate_same_group_tasks", label: "Separate Same Group Tasks" },
          ]}
          onChange={(v) =>
            update("taskGroupClustering", v as TaskGroupClusteringMode)
          }
        />
        <SelectField
          label="Task Chunk Clustering"
          value={preferences.taskChunkClustering}
          options={[
            { value: "group_same_task_chunks", label: "Group Same Task Chunks" },
            { value: "separate_same_task_chunks", label: "Separate Same Task Chunks" },
          ]}
          onChange={(v) =>
            update("taskChunkClustering", v as TaskChunkClusteringMode)
          }
        />
        <ToggleField
          label="Allow Priority Inversions"
          checked={preferences.clusteringAllowsPriorityInversions}
          onChange={(v) =>
            update("clusteringAllowsPriorityInversions", v)
          }
        />
      </SectionCard>

      {/* Guard */}
      <SectionCard title="Guard">
        <ToggleField
          label="Strong Guard"
          checked={preferences.strongGuardEnabled}
          onChange={(v) => update("strongGuardEnabled", v)}
        />
        <ToggleField
          label="Minimize to Tray"
          checked={preferences.minimizeToTray}
          onChange={(v) => update("minimizeToTray", v)}
        />
        <ToggleField
          label="Launch at Login"
          checked={preferences.launchAtLogin}
          onChange={(v) => update("launchAtLogin", v)}
        />
      </SectionCard>

      {/* General */}
      <SectionCard title="General">
        <SelectField
          label="Theme"
          value={preferences.theme}
          options={[{ value: "minimal-dark", label: "Minimal Dark" }]}
          onChange={(v) => update("theme", v)}
        />
        <ToggleField
          label="Notifications"
          checked={preferences.notificationsEnabled}
          onChange={(v) => update("notificationsEnabled", v)}
        />
      </SectionCard>
    </div>
  );
}
