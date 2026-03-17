import { useState } from "react";
import { useConfigStore } from "@/stores/configStore";
import { useTaskStore } from "@/stores/taskStore";
import * as scheduleApi from "@/api/schedule";
import type { UserPreferences } from "@/types/config";
import type { WeeklyTemplate, Weekday } from "@/types/schedule";
import { Button } from "../common/Button";
import { Toggle } from "../common/Toggle";

const ALL_DAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS: Record<Weekday, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);

  const preferences = useConfigStore((s) => s.preferences);
  const updatePreferences = useConfigStore((s) => s.updatePreferences);
  const createTask = useTaskStore((s) => s.createTask);
  const createTaskGroup = useTaskStore((s) => s.createTaskGroup);

  // Step 0: Schedule settings
  const [workMinutes, setWorkMinutes] = useState(
    preferences?.workDurationMinutes ?? 90,
  );
  const [breakMinutes, setBreakMinutes] = useState(
    preferences?.breakDurationMinutes ?? 30,
  );
  const [sleepStartHour, setSleepStartHour] = useState(23);
  const [sleepStartMin, setSleepStartMin] = useState(0);
  const [sleepEndHour, setSleepEndHour] = useState(7);
  const [sleepEndMin, setSleepEndMin] = useState(0);
  const [enabledDays, setEnabledDays] = useState<Record<Weekday, boolean>>(
    () =>
      Object.fromEntries(
        ALL_DAYS.map((d) => [d, true]),
      ) as Record<Weekday, boolean>,
  );
  const [strongGuard, setStrongGuard] = useState(
    preferences?.strongGuardEnabled ?? true,
  );
  const [launchAtLogin, setLaunchAtLogin] = useState(
    preferences?.launchAtLogin ?? false,
  );

  // Step 1: First tasks
  const [tasks, setTasks] = useState([
    { name: "", priority: 3, estimatedMinutes: 60 },
    { name: "", priority: 3, estimatedMinutes: 60 },
    { name: "", priority: 3, estimatedMinutes: 60 },
  ]);
  const [groupName, setGroupName] = useState("");

  const handleNext = async () => {
    if (step === 0) {
      // Save preferences
      if (preferences) {
        const updated: UserPreferences = {
          ...preferences,
          workDurationMinutes: workMinutes,
          breakDurationMinutes: breakMinutes,
          strongGuardEnabled: strongGuard,
          launchAtLogin,
        };
        await updatePreferences(updated);
      }
      setStep(1);
    } else if (step === 1) {
      // Create tasks
      let groupId: number | null = null;
      if (groupName.trim()) {
        const group = await createTaskGroup(groupName.trim());
        groupId = group.id;
      }

      for (const t of tasks) {
        if (!t.name.trim()) continue;
        await createTask({
          name: t.name.trim(),
          groupId,
          priority: t.priority,
          estimatedMinutes: t.estimatedMinutes,
          maxChunkMinutes: workMinutes,
          minChunkMinutes: 25,
          minimumRestMinutes: 5,
          workRatio: 3,
          restRatio: 1,
        });
      }
      setStep(2);
    } else if (step === 2) {
      // Save and apply weekly template
      const sleepStart = sleepStartHour * 60 + sleepStartMin;
      const sleepEnd = sleepEndHour * 60 + sleepEndMin;

      const template: WeeklyTemplate = {
        defaultWorkMinutes: workMinutes,
        defaultBreakMinutes: breakMinutes,
        days: ALL_DAYS.map((day) => ({
          day,
          enabled: enabledDays[day],
          sleepStartMinute: sleepStart,
          sleepEndMinute: sleepEnd,
          workMinutes: null,
          breakMinutes: null,
        })),
        fixedBlocks: [],
      };

      await scheduleApi.saveWeeklyTemplate(template);

      // Apply template for the next 7 days
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const endRange = startOfDay + 7 * 24 * 60 * 60 * 1000;
      await scheduleApi.applyWeeklyTemplate(template, startOfDay, endRange);
      await scheduleApi.rebuildSchedule(startOfDay);

      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const updateTask = (
    index: number,
    field: string,
    value: string | number,
  ) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    );
  };

  const addTaskRow = () => {
    setTasks((prev) => [
      ...prev,
      { name: "", priority: 3, estimatedMinutes: 60 },
    ]);
  };

  const removeTaskRow = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Welcome to AntiProcrastinator
        </h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Let's set up your schedule in a few steps.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {["Schedule", "Tasks", "Confirm"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                i <= step
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm ${i <= step ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
            >
              {label}
            </span>
            {i < 2 && (
              <div className="mx-2 h-px w-8 bg-[var(--bg-tertiary)]" />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Schedule Settings */}
      {step === 0 && (
        <div className="space-y-6 rounded-xl bg-[var(--bg-secondary)] p-6">
          <h2 className="text-lg font-semibold">Schedule Settings</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">
                Work Block Duration (min)
              </label>
              <input
                type="number"
                value={workMinutes}
                onChange={(e) => setWorkMinutes(Number(e.target.value))}
                min={10}
                max={180}
                className="mt-1 w-full rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">
                Break Duration (min)
              </label>
              <input
                type="number"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value))}
                min={5}
                max={60}
                className="mt-1 w-full rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)]">
              Sleep Schedule
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                value={sleepStartHour}
                onChange={(e) => setSleepStartHour(Number(e.target.value))}
                min={0}
                max={23}
                className="w-16 rounded-md bg-[var(--bg-tertiary)] px-2 py-2 text-center text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              <span className="text-[var(--text-secondary)]">:</span>
              <input
                type="number"
                value={sleepStartMin}
                onChange={(e) => setSleepStartMin(Number(e.target.value))}
                min={0}
                max={59}
                step={15}
                className="w-16 rounded-md bg-[var(--bg-tertiary)] px-2 py-2 text-center text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-secondary)]">to</span>
              <input
                type="number"
                value={sleepEndHour}
                onChange={(e) => setSleepEndHour(Number(e.target.value))}
                min={0}
                max={23}
                className="w-16 rounded-md bg-[var(--bg-tertiary)] px-2 py-2 text-center text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              <span className="text-[var(--text-secondary)]">:</span>
              <input
                type="number"
                value={sleepEndMin}
                onChange={(e) => setSleepEndMin(Number(e.target.value))}
                min={0}
                max={59}
                step={15}
                className="w-16 rounded-md bg-[var(--bg-tertiary)] px-2 py-2 text-center text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--text-secondary)]">
              Active Days
            </label>
            <div className="mt-1 flex gap-1">
              {ALL_DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() =>
                    setEnabledDays((prev) => ({
                      ...prev,
                      [day]: !prev[day],
                    }))
                  }
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    enabledDays[day]
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Toggle
              checked={strongGuard}
              onChange={setStrongGuard}
              label="Strong Guard (requires typing a phrase to quit)"
            />
            <Toggle
              checked={launchAtLogin}
              onChange={setLaunchAtLogin}
              label="Launch at login"
            />
          </div>
        </div>
      )}

      {/* Step 1: Create Tasks */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl bg-[var(--bg-secondary)] p-6">
          <h2 className="text-lg font-semibold">Add Your Tasks</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            What do you need to focus on? Add at least one task. Each will
            default to{" "}
            <span className="text-[var(--text-primary)]">
              {workMinutes}min max chunks
            </span>
            ,{" "}
            <span className="text-[var(--text-primary)]">
              25min minimum chunks
            </span>
            ,{" "}
            <span className="text-[var(--text-primary)]">
              5min rest between chunks
            </span>
            , and a{" "}
            <span className="text-[var(--text-primary)]">3:1 work:rest</span>{" "}
            ratio.
          </p>

          <div>
            <label className="block text-sm text-[var(--text-secondary)]">
              Task Group (optional)
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder='e.g. "Work", "Study", "Personal"'
              className="mt-1 w-full rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="space-y-2">
            {tasks.map((task, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={task.name}
                  onChange={(e) => updateTask(i, "name", e.target.value)}
                  placeholder={`Task ${i + 1}`}
                  className="flex-1 rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <select
                  value={task.priority}
                  onChange={(e) =>
                    updateTask(i, "priority", Number(e.target.value))
                  }
                  className="w-20 rounded-md bg-[var(--bg-tertiary)] px-2 py-2 text-sm text-[var(--text-primary)] outline-none"
                >
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>
                      P{p}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={task.estimatedMinutes}
                  onChange={(e) =>
                    updateTask(i, "estimatedMinutes", Number(e.target.value))
                  }
                  min={15}
                  className="w-20 rounded-md bg-[var(--bg-tertiary)] px-2 py-2 text-sm text-[var(--text-primary)] outline-none"
                  placeholder="min"
                />
                <span className="text-xs text-[var(--text-secondary)]">
                  min
                </span>
                {tasks.length > 1 && (
                  <button
                    onClick={() => removeTaskRow(i)}
                    className="text-[var(--text-secondary)] hover:text-[var(--danger)]"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addTaskRow}
            className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            + Add another task
          </button>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl bg-[var(--bg-secondary)] p-6">
          <h2 className="text-lg font-semibold">Ready to Go</h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">
                Work blocks
              </span>
              <span>{workMinutes} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Breaks</span>
              <span>{breakMinutes} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Sleep</span>
              <span>
                {String(sleepStartHour).padStart(2, "0")}:
                {String(sleepStartMin).padStart(2, "0")} -{" "}
                {String(sleepEndHour).padStart(2, "0")}:
                {String(sleepEndMin).padStart(2, "0")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Active days</span>
              <span>
                {ALL_DAYS.filter((d) => enabledDays[d])
                  .map((d) => DAY_LABELS[d])
                  .join(", ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Tasks</span>
              <span>
                {tasks.filter((t) => t.name.trim()).length} task(s)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">
                Strong guard
              </span>
              <span>{strongGuard ? "On" : "Off"}</span>
            </div>
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            This will save your settings, create your tasks, and generate a
            weekly schedule starting today. You can adjust everything later.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <div>
          {step > 0 && (
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          )}
        </div>
        <Button
          variant="primary"
          onClick={handleNext}
          disabled={step === 1 && tasks.every((t) => !t.name.trim())}
        >
          {step === 2 ? "Finish Setup" : "Next"}
        </Button>
      </div>
    </div>
  );
}
