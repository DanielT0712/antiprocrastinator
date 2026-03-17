import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "@/api/schedule";
import type {
  BlockType,
  DayTemplate,
  FixedTemplateBlock,
  WeeklyTemplate,
  Weekday,
} from "@/types/schedule";
import { Button } from "../common/Button";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_LABELS: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const BLOCK_TYPES: BlockType[] = ["work", "break", "sleep", "meal", "custom"];

function minuteToHHMM(minute: number | null): string {
  if (minute === null) return "";
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hhmmToMinute(hhmm: string): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function defaultTemplate(): WeeklyTemplate {
  return {
    defaultWorkMinutes: 90,
    defaultBreakMinutes: 15,
    days: WEEKDAYS.map((day) => ({
      day,
      enabled: !["saturday", "sunday"].includes(day),
      sleepStartMinute: 23 * 60,
      sleepEndMinute: 7 * 60,
      workMinutes: null,
      breakMinutes: null,
    })),
    fixedBlocks: [],
  };
}

function weekRange(): { from: number; to: number } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + mondayOffset,
  );
  const sunday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { from: monday.getTime(), to: sunday.getTime() };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const inputClass =
  "rounded-md bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]";

function DayRow({
  day,
  onChange,
}: {
  day: DayTemplate;
  onChange: (updated: DayTemplate) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
      <span className="w-24 text-sm font-medium text-[var(--text-primary)]">
        {DAY_LABELS[day.day]}
      </span>

      {/* Enabled toggle */}
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={day.enabled}
          onChange={(e) => onChange({ ...day, enabled: e.target.checked })}
          className="accent-[var(--accent)]"
        />
        <span className="text-xs text-[var(--text-secondary)]">On</span>
      </label>

      {day.enabled && (
        <>
          <div className="flex items-center gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              Sleep
            </label>
            <input
              type="time"
              value={minuteToHHMM(day.sleepStartMinute)}
              onChange={(e) =>
                onChange({
                  ...day,
                  sleepStartMinute: hhmmToMinute(e.target.value),
                })
              }
              className={`${inputClass} w-24`}
            />
            <span className="text-xs text-[var(--text-secondary)]">-</span>
            <input
              type="time"
              value={minuteToHHMM(day.sleepEndMinute)}
              onChange={(e) =>
                onChange({
                  ...day,
                  sleepEndMinute: hhmmToMinute(e.target.value),
                })
              }
              className={`${inputClass} w-24`}
            />
          </div>

          <div className="flex items-center gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              Work
            </label>
            <input
              type="number"
              value={day.workMinutes ?? ""}
              onChange={(e) =>
                onChange({
                  ...day,
                  workMinutes: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              placeholder="default"
              className={`${inputClass} w-20`}
            />
          </div>

          <div className="flex items-center gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              Break
            </label>
            <input
              type="number"
              value={day.breakMinutes ?? ""}
              onChange={(e) =>
                onChange({
                  ...day,
                  breakMinutes: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              placeholder="default"
              className={`${inputClass} w-20`}
            />
          </div>
        </>
      )}
    </div>
  );
}

function FixedBlockRow({
  block,
  onChange,
  onDelete,
}: {
  block: FixedTemplateBlock;
  onChange: (updated: FixedTemplateBlock) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--bg-secondary)] px-4 py-3">
      {/* Title */}
      <input
        type="text"
        value={block.title}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Title"
        className={`${inputClass} w-32`}
      />

      {/* Type */}
      <select
        value={block.blockType}
        onChange={(e) =>
          onChange({ ...block, blockType: e.target.value as BlockType })
        }
        className={`${inputClass} w-24`}
      >
        {BLOCK_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {/* Days checkboxes */}
      <div className="flex gap-1">
        {WEEKDAYS.map((w) => {
          const short = DAY_LABELS[w].slice(0, 2);
          const active = block.daysOfWeek.includes(w);
          return (
            <button
              key={w}
              type="button"
              onClick={() => {
                const next = active
                  ? block.daysOfWeek.filter((d) => d !== w)
                  : [...block.daysOfWeek, w];
                onChange({ ...block, daysOfWeek: next });
              }}
              className={`flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
              }`}
            >
              {short}
            </button>
          );
        })}
      </div>

      {/* Start time */}
      <input
        type="time"
        value={minuteToHHMM(block.startMinute)}
        onChange={(e) =>
          onChange({
            ...block,
            startMinute: hhmmToMinute(e.target.value) ?? 0,
          })
        }
        className={`${inputClass} w-24`}
      />

      {/* Duration */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={block.durationMinutes}
          onChange={(e) =>
            onChange({
              ...block,
              durationMinutes: Number(e.target.value) || 0,
            })
          }
          className={`${inputClass} w-16`}
        />
        <span className="text-xs text-[var(--text-secondary)]">min</span>
      </div>

      {/* Intensity */}
      <div className="flex items-center gap-1">
        <label className="text-xs text-[var(--text-secondary)]">Int</label>
        <input
          type="range"
          min={1}
          max={5}
          value={block.intensity}
          onChange={(e) =>
            onChange({ ...block, intensity: Number(e.target.value) })
          }
          className="w-16 accent-[var(--accent)]"
        />
        <span className="text-xs text-[var(--text-secondary)]">
          {block.intensity}
        </span>
      </div>

      {/* Delete */}
      <Button variant="danger" size="sm" onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeeklyTemplatePage
// ---------------------------------------------------------------------------

export function WeeklyTemplatePage() {
  const [template, setTemplate] = useState<WeeklyTemplate>(defaultTemplate());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await api.getWeeklyTemplate();
      if (saved) setTemplate(saved);
      setLoaded(true);
    })();
  }, []);

  const updateDay = (index: number, updated: DayTemplate) => {
    setTemplate((prev) => {
      const days = [...prev.days];
      days[index] = updated;
      return { ...prev, days };
    });
  };

  const updateFixedBlock = (index: number, updated: FixedTemplateBlock) => {
    setTemplate((prev) => {
      const fixedBlocks = [...prev.fixedBlocks];
      fixedBlocks[index] = updated;
      return { ...prev, fixedBlocks };
    });
  };

  const removeFixedBlock = (index: number) => {
    setTemplate((prev) => ({
      ...prev,
      fixedBlocks: prev.fixedBlocks.filter((_, i) => i !== index),
    }));
  };

  const addFixedBlock = () => {
    const newBlock: FixedTemplateBlock = {
      title: "",
      blockType: "work",
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      startMinute: 9 * 60,
      durationMinutes: 60,
      intensity: 3,
    };
    setTemplate((prev) => ({
      ...prev,
      fixedBlocks: [...prev.fixedBlocks, newBlock],
    }));
  };

  const handleSave = async () => {
    await api.saveWeeklyTemplate(template);
  };

  const handleApplyToWeek = async () => {
    const { from, to } = weekRange();
    await api.applyWeeklyTemplate(template, from, to);
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/schedule"
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          &larr; Schedule
        </Link>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          WEEKLY TEMPLATE
        </h1>
      </div>

      {/* Default durations */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--text-secondary)]">
            Work Duration
          </label>
          <input
            type="number"
            value={template.defaultWorkMinutes}
            onChange={(e) =>
              setTemplate((prev) => ({
                ...prev,
                defaultWorkMinutes: Number(e.target.value) || 0,
              }))
            }
            className={`${inputClass} w-20`}
          />
          <span className="text-xs text-[var(--text-secondary)]">min</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--text-secondary)]">
            Break Duration
          </label>
          <input
            type="number"
            value={template.defaultBreakMinutes}
            onChange={(e) =>
              setTemplate((prev) => ({
                ...prev,
                defaultBreakMinutes: Number(e.target.value) || 0,
              }))
            }
            className={`${inputClass} w-20`}
          />
          <span className="text-xs text-[var(--text-secondary)]">min</span>
        </div>
      </div>

      {/* Days grid */}
      <div className="space-y-1">
        {template.days.map((day, i) => (
          <DayRow
            key={day.day}
            day={day}
            onChange={(updated) => updateDay(i, updated)}
          />
        ))}
      </div>

      {/* Fixed Blocks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Fixed Blocks
          </h2>
          <Button variant="secondary" size="sm" onClick={addFixedBlock}>
            + Add Fixed Block
          </Button>
        </div>
        {template.fixedBlocks.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            No fixed blocks yet.
          </p>
        )}
        {template.fixedBlocks.map((block, i) => (
          <FixedBlockRow
            key={i}
            block={block}
            onChange={(updated) => updateFixedBlock(i, updated)}
            onDelete={() => removeFixedBlock(i)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="primary" onClick={handleSave}>
          Save Template
        </Button>
        <Button variant="secondary" onClick={handleApplyToWeek}>
          Apply to This Week
        </Button>
      </div>
    </div>
  );
}
