import { useEffect, useState, useCallback } from "react";
import * as api from "@/api/schedule";
import type {
  BlockType,
  BlockStatus,
  NewTimeBlock,
  TimeBlock,
  TimeBlockUpdate,
} from "@/types/schedule";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { Modal } from "../common/Modal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHHMM(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  return `${Math.round(ms / 60_000)}m`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function dayRange(date: Date): { from: number; to: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.getTime(), to: end.getTime() };
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateToHHMM(epochMs: number): string {
  return formatHHMM(epochMs);
}

function hhmmToEpoch(date: Date, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Status icons
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: BlockStatus }) {
  switch (status) {
    case "completed":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--success)"
          strokeWidth="2"
        >
          <path d="M3 8l3 3 7-7" />
        </svg>
      );
    case "skipped":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth="2"
        >
          <path d="M4 4l8 8M4 12l8-8" />
        </svg>
      );
    case "active":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
        >
          <polygon points="5,3 13,8 5,13" fill="var(--accent)" stroke="none" />
        </svg>
      );
    case "paused":
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--warning)"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="3" height="10" fill="var(--warning)" stroke="none" />
          <rect x="10" y="3" width="3" height="10" fill="var(--warning)" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// TimeBlockRow
// ---------------------------------------------------------------------------

function TimeBlockRow({
  block,
  isActive,
  onClick,
}: {
  block: TimeBlock;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg bg-[var(--bg-secondary)] px-4 py-3 text-left transition-colors hover:bg-[var(--bg-tertiary)] cursor-pointer ${
        isActive ? "border-l-2 border-[var(--accent)]" : ""
      }`}
    >
      <span className="w-16 text-sm text-[var(--text-secondary)]">
        {formatHHMM(block.startTime)}
      </span>
      <Badge variant={block.blockType}>{block.blockType}</Badge>
      <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
        {block.title}
      </span>
      <span className="text-xs text-[var(--text-secondary)]">
        {formatDuration(block.endTime - block.startTime)}
      </span>
      <StatusIcon status={block.status} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// BlockFormModal
// ---------------------------------------------------------------------------

interface BlockFormModalProps {
  open: boolean;
  onClose: () => void;
  selectedDate: Date;
  block: TimeBlock | null; // null = new
  onSaved: () => void;
}

const BLOCK_TYPES: BlockType[] = ["work", "break", "sleep", "meal", "custom"];

function BlockFormModal({
  open,
  onClose,
  selectedDate,
  block,
  onSaved,
}: BlockFormModalProps) {
  const isEdit = block !== null;

  const [title, setTitle] = useState("");
  const [blockType, setBlockType] = useState<BlockType>("work");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [taskName, setTaskName] = useState("");
  const [intensity, setIntensity] = useState(3);
  const [isProtected, setIsProtected] = useState(false);

  useEffect(() => {
    if (block) {
      setTitle(block.title);
      setBlockType(block.blockType);
      setStartTime(dateToHHMM(block.startTime));
      setEndTime(dateToHHMM(block.endTime));
      setIntensity(block.intensity);
      setIsProtected(block.isProtected);
      setTaskName("");
    } else {
      setTitle("");
      setBlockType("work");
      setStartTime("09:00");
      setEndTime("10:00");
      setTaskName("");
      setIntensity(3);
      setIsProtected(false);
    }
  }, [block, open]);

  const handleSubmit = async () => {
    const st = hhmmToEpoch(selectedDate, startTime);
    const et = hhmmToEpoch(selectedDate, endTime);

    if (isEdit && block) {
      const updates: TimeBlockUpdate = {
        title,
        blockType,
        startTime: st,
        endTime: et,
        intensity,
        isProtected,
      };
      await api.updateTimeBlock(block.id, updates);
    } else {
      const newBlock: NewTimeBlock = {
        title,
        blockType,
        startTime: st,
        endTime: et,
        intensity,
        isProtected: isProtected || undefined,
      };
      await api.addTimeBlock(newBlock);
    }

    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    if (block) {
      await api.deleteTimeBlock(block.id);
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Block" : "Add Block"}
    >
      <div className="space-y-4">
        {/* Title */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-secondary)]">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>

        {/* Block Type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-secondary)]">
            Block Type
          </label>
          <select
            value={blockType}
            onChange={(e) => setBlockType(e.target.value as BlockType)}
            className="rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            {BLOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Start / End Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              Start Time
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-secondary)]">
              End Time
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        {/* Task */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-secondary)]">
            Task (optional)
          </label>
          <input
            type="text"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="Task name"
            className="rounded-md bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>

        {/* Intensity */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--text-secondary)]">
            Intensity ({intensity})
          </label>
          <input
            type="range"
            min={1}
            max={5}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="accent-[var(--accent)]"
          />
        </div>

        {/* Protected */}
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
          <input
            type="checkbox"
            checked={isProtected}
            onChange={(e) => setIsProtected(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Protected
        </label>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSubmit}>
            {isEdit ? "Save" : "Add"}
          </Button>
          {isEdit && (
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// SchedulePage
// ---------------------------------------------------------------------------

export function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);

  const fetchBlocks = useCallback(async () => {
    const { from, to } = dayRange(selectedDate);
    const data = await api.getScheduleRange(from, to);
    setBlocks(data.sort((a, b) => a.startTime - b.startTime));
  }, [selectedDate]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  const shiftDate = (days: number) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const goToday = () => setSelectedDate(new Date());

  const handleApplyTemplate = async () => {
    const template = await api.getWeeklyTemplate();
    if (!template) return;
    const { from, to } = dayRange(selectedDate);
    await api.applyWeeklyTemplate(template, from, to);
    fetchBlocks();
  };

  const handleRebuild = async () => {
    const { from } = dayRange(selectedDate);
    await api.rebuildSchedule(from);
    fetchBlocks();
  };

  const openNew = () => {
    setEditingBlock(null);
    setModalOpen(true);
  };

  const openEdit = (block: TimeBlock) => {
    setEditingBlock(block);
    setModalOpen(true);
  };

  const now = Date.now();

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          SCHEDULE
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => shiftDate(-1)}>
            &lt;
          </Button>
          <span className="min-w-[120px] text-center text-sm font-medium text-[var(--text-primary)]">
            {formatDateLabel(selectedDate)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => shiftDate(1)}>
            &gt;
          </Button>
          {!isSameDay(selectedDate, new Date()) && (
            <Button variant="ghost" size="sm" onClick={goToday}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        {blocks.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
            No blocks scheduled for this day.
          </p>
        )}
        {blocks.map((block) => {
          const isActive =
            block.status === "active" ||
            (block.status === "scheduled" &&
              block.startTime <= now &&
              block.endTime > now);
          return (
            <TimeBlockRow
              key={block.id}
              block={block}
              isActive={isActive}
              onClick={() => openEdit(block)}
            />
          );
        })}
      </div>

      {/* Action bar */}
      <div className="flex gap-2 pt-4">
        <Button variant="primary" onClick={openNew}>
          + Add Block
        </Button>
        <Button variant="secondary" onClick={handleApplyTemplate}>
          Apply Template
        </Button>
        <Button variant="ghost" onClick={handleRebuild}>
          Rebuild
        </Button>
      </div>

      {/* Block form modal */}
      <BlockFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedDate={selectedDate}
        block={editingBlock}
        onSaved={fetchBlocks}
      />
    </div>
  );
}
