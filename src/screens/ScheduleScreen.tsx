import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../api';
import type { Task, TaskGroup, TimeBlock } from '../api/types';
import { Dropdown } from '../components/Dropdown';
import { Icons } from '../components/Icons';
import { blockBarColor, railKindFor } from '../lib/blocks';
import { formatDuration, formatHHMM } from '../lib/format';

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  color: 'var(--faint)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 5,
  padding: '7px 9px',
  fontSize: 13,
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box',
};

const DAY_MS = 86_400_000;
const HOUR_MS = 60 * 60 * 1_000;
const DEFAULT_TIMELINE_PX_PER_HOUR = 56;
const MIN_TIMELINE_PX_PER_HOUR = 48;
const MAX_TIMELINE_PX_PER_HOUR = 96;
const TIMELINE_START_HOUR = 0;
const TIMELINE_END_HOUR = 24;

function startOfDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Monday-anchored start of the week containing `epoch`. JS getDay() is
// 0=Sun..6=Sat; (day + 6) % 7 maps Mon->0..Sun->6.
function startOfWeek(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  const offsetDays = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offsetDays);
  return d.getTime();
}

// Anchor for the schedule grid given the active view. Day and 5d start
// today; week stays Monday-anchored.
function viewStartDay(view: ViewMode, now: number): number {
  if (view === 'day' || view === '5d') return startOfDay(now);
  return startOfWeek(now);
}

function dayKey(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function dateInputFromEpoch(epoch: number): string {
  const d = new Date(epoch);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function epochFromDateInput(value: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

interface BlockSegment {
  block: TimeBlock;
  startTime: number;
  endTime: number;
  continuesFromPreviousDay: boolean;
  continuesToNextDay: boolean;
  lane: number;
  laneCount: number;
}

interface TimelineRun {
  startHour: number;
  endHour: number;
  compressed: boolean;
}

interface TimelineScale {
  height: number;
  runs: TimelineRun[];
  yOf: (hour: number) => number;
}

function segmentTopPx(segment: BlockSegment, dayStart: number, scale: TimelineScale): number {
  return scale.yOf((segment.startTime - dayStart) / HOUR_MS);
}

function segmentHeightPx(segment: BlockSegment, dayStart: number, scale: TimelineScale): number {
  const startHour = (segment.startTime - dayStart) / HOUR_MS;
  const endHour = (segment.endTime - dayStart) / HOUR_MS;
  return Math.max(8, scale.yOf(endHour) - scale.yOf(startHour) - 1);
}

function buildBlockSegmentsForDay(day: number, blocks: TimeBlock[]): BlockSegment[] {
  const dayEnd = day + DAY_MS;
  const segments = blocks
    .filter((block) => block.startTime < dayEnd && block.endTime > day)
    .map((block) => ({
      block,
      startTime: Math.max(block.startTime, day),
      endTime: Math.min(block.endTime, dayEnd),
      continuesFromPreviousDay: block.startTime < day,
      continuesToNextDay: block.endTime > dayEnd,
      lane: 0,
      laneCount: 1,
    }))
    .filter((segment) => segment.endTime > segment.startTime)
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

  let cluster: BlockSegment[] = [];
  let clusterEnd = 0;
  const flushCluster = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    for (const segment of cluster) {
      const lane = laneEnds.findIndex((end) => end <= segment.startTime);
      segment.lane = lane === -1 ? laneEnds.length : lane;
      laneEnds[segment.lane] = segment.endTime;
    }
    const laneCount = Math.max(1, laneEnds.length);
    for (const segment of cluster) segment.laneCount = laneCount;
    cluster = [];
    clusterEnd = 0;
  };

  for (const segment of segments) {
    if (cluster.length > 0 && segment.startTime >= clusterEnd) {
      flushCluster();
    }
    cluster.push(segment);
    clusterEnd = Math.max(clusterEnd, segment.endTime);
  }
  flushCluster();

  return segments;
}

function classifyHour(day: number, segments: BlockSegment[], hour: number): '.' | 's' | 'r' {
  const start = day + hour * HOUR_MS;
  const end = start + HOUR_MS;
  let hasWork = false;
  let hasSleep = false;
  let hasRest = false;
  for (const segment of segments) {
    if (segment.startTime >= end || segment.endTime <= start) continue;
    if (segment.block.blockType === 'work' || segment.block.blockType === 'custom') {
      hasWork = true;
    } else if (segment.block.blockType === 'sleep') {
      hasSleep = true;
    } else {
      hasRest = true;
    }
  }
  if (hasWork) return '.';
  if (hasSleep) return 's';
  return hasRest ? 'r' : 'r';
}

function canCompressLongBlockRun(
  buckets: { day: number; segments: BlockSegment[] }[],
  startHour: number,
  endHour: number,
): boolean {
  if (endHour - startHour < 3) return false;
  return buckets.every((bucket) => {
    const start = bucket.day + startHour * HOUR_MS;
    const end = bucket.day + endHour * HOUR_MS;
    const overlapping = bucket.segments.filter(
      (segment) => segment.startTime < end && segment.endTime > start,
    );
    if (overlapping.length === 0) return true;
    return overlapping.every((segment) => {
      const duration = segment.block.endTime - segment.block.startTime;
      return duration >= 3 * HOUR_MS && segment.startTime <= start && segment.endTime >= end;
    });
  });
}

function runKey(run: TimelineRun): string {
  return `${run.startHour}-${run.endHour}`;
}

function buildTimelineScale(
  buckets: { day: number; segments: BlockSegment[] }[],
  pxPerHour: number,
  expandedRuns: ReadonlySet<string>,
): TimelineScale {
  const patterns: string[] = [];
  for (let h = TIMELINE_START_HOUR; h < TIMELINE_END_HOUR; h++) {
    patterns.push(buckets.map((bucket) => classifyHour(bucket.day, bucket.segments, h)).join(''));
  }

  const runs: TimelineRun[] = [];
  let index = 0;
  while (index < patterns.length) {
    const pattern = patterns[index];
    const restCompressible = !pattern.includes('.');
    let next = index + 1;
    while (next < patterns.length && patterns[next] === pattern) next += 1;
    const startHour = TIMELINE_START_HOUR + index;
    const endHour = TIMELINE_START_HOUR + next;
    const longBlockCompressible =
      !restCompressible && canCompressLongBlockRun(buckets, startHour, endHour);
    runs.push({
      startHour,
      endHour,
      compressed: restCompressible ? next - index >= 2 : longBlockCompressible,
    });
    index = next;
  }

  const heights = runs.map((run) =>
    run.compressed && !expandedRuns.has(runKey(run))
      ? pxPerHour
      : (run.endHour - run.startHour) * pxPerHour,
  );
  const offsets = [0];
  for (const height of heights) offsets.push(offsets[offsets.length - 1] + height);
  const height = offsets[offsets.length - 1];
  const yOf = (hour: number) => {
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (hour >= run.startHour && hour <= run.endHour) {
        const span = run.endHour - run.startHour;
        return offsets[i] + ((hour - run.startHour) / span) * heights[i];
      }
    }
    return hour < TIMELINE_START_HOUR ? 0 : height;
  };

  return { height, runs, yOf };
}

function BlockTile({
  segment,
  dayStart,
  scale,
  task,
  groupColor,
  selected,
  onClick,
}: {
  segment: BlockSegment;
  dayStart: number;
  scale: TimelineScale;
  task: Task | null;
  groupColor: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  const { block } = segment;
  const kind = railKindFor(block);
  const defaultBar = blockBarColor(kind);
  // Work-type blocks inherit task group color so users can scan day by topic.
  // Rest/sleep/meal keep their kind-based color since they're not task-bound.
  const bar =
    (block.blockType === 'work' || block.blockType === 'custom') && groupColor
      ? groupColor
      : defaultBar;
  const title = task?.name ?? block.title;
  const isPast = block.endTime < Date.now();
  const height = segmentHeightPx(segment, dayStart, scale);
  const laneWidth = 100 / segment.laneCount;
  const isRest = block.blockType === 'break' || block.blockType === 'meal';
  const isTinyRest = isRest && height < 38;
  const isBoundary = block.source === 'template' || block.isProtected;
  const compactRestPattern =
    'repeating-linear-gradient(90deg, transparent 0 5px, color-mix(in oklch, var(--muted) 35%, transparent) 5px 7px)';
  const restPattern = isTinyRest
    ? compactRestPattern
    : 'repeating-linear-gradient(90deg, transparent 0 5px, color-mix(in oklch, var(--muted) 14%, transparent) 5px 7px)';
  const background = isBoundary
    ? 'repeating-linear-gradient(135deg, transparent 0 8px, color-mix(in oklch, var(--ink) 6%, transparent) 8px 9px), var(--bg-raise)'
    : isRest
      ? `${restPattern}, ${selected ? 'var(--accent-soft)' : 'var(--bg-raise)'}`
    : selected
      ? 'var(--accent-soft)'
      : 'var(--bg-raise)';
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `calc(${segment.lane * laneWidth}% + 4px)`,
        width: `calc(${laneWidth}% - 8px)`,
        top: segmentTopPx(segment, dayStart, scale),
        height,
        textAlign: 'left',
        padding: '4px 8px',
        background,
        border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--line)'),
        borderLeft: '3px solid ' + bar,
        borderRadius: 5,
        color: isPast ? 'var(--faint)' : 'var(--ink)',
        cursor: 'pointer',
        opacity: isPast ? 0.65 : 1,
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {isTinyRest ? null : <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--muted)',
      }}>
        {segment.continuesFromPreviousDay ? '00:00' : formatHHMM(segment.startTime)}
        {' - '}
        {segment.continuesToNextDay ? '24:00' : formatHHMM(segment.endTime)}
        {block.isProtected && (
          <span
            title="Protected block"
            style={{ marginLeft: 6, color: 'var(--accent-ink)', display: 'inline-flex' }}
          >
            <Icons.pin size={9} />
          </span>
        )}
      </div>}
      {isTinyRest ? null : <div style={{
        fontSize: 12,
        marginTop: 2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {title}
      </div>}
    </button>
  );
}

interface InspectorProps {
  block: TimeBlock | null;
  tasks: Task[];
  onClose: () => void;
  onSave: (id: number, patch: Partial<TimeBlock>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function Inspector({ block, tasks, onClose, onSave, onDelete }: InspectorProps) {
  const [draft, setDraft] = useState<TimeBlock | null>(block);
  useEffect(() => setDraft(block), [block?.id]);
  if (!draft) return null;

  return (
    <aside style={{
      width: 360,
      flexShrink: 0,
      borderLeft: '1px solid var(--line)',
      padding: '20px 22px',
      background: 'var(--bg)',
      overflow: 'auto',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={labelStyle}>Block detail</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <Icons.x size={15} />
        </button>
      </div>

      <input
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--ink)',
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          letterSpacing: '-0.015em',
          padding: 0,
          marginBottom: 16,
        }}
      />

      <div style={{ marginBottom: 12 }}>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Type</div>
        <Dropdown
          value={draft.blockType}
          onChange={(v) => setDraft({ ...draft, blockType: v })}
          style={inputStyle}
          options={[
            { value: 'work', label: 'Work' },
            { value: 'break', label: 'Break' },
            { value: 'sleep', label: 'Sleep' },
            { value: 'meal', label: 'Meal' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Start</div>
          <input
            type="datetime-local"
            value={dateInputFromEpoch(draft.startTime)}
            onChange={(e) => {
              const t = epochFromDateInput(e.target.value);
              if (t != null) setDraft({ ...draft, startTime: t });
            }}
            style={inputStyle}
          />
        </div>
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>End</div>
          <input
            type="datetime-local"
            value={dateInputFromEpoch(draft.endTime)}
            onChange={(e) => {
              const t = epochFromDateInput(e.target.value);
              if (t != null) setDraft({ ...draft, endTime: t });
            }}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Linked task</div>
        <Dropdown
          value={draft.taskId == null ? '' : String(draft.taskId)}
          onChange={(v) =>
            setDraft({ ...draft, taskId: v === '' ? null : Number(v) })
          }
          style={inputStyle}
          options={[
            { value: '', label: 'No task' },
            ...tasks.map((t) => ({ value: String(t.id), label: t.name })),
          ]}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Profile</div>
        <Dropdown
          value={draft.enforcementProfile ?? ''}
          onChange={(v) =>
            setDraft({ ...draft, enforcementProfile: v === '' ? null : v })
          }
          style={inputStyle}
          options={[
            { value: '', label: 'Inherit' },
            { value: 'rest', label: 'Rest' },
            { value: 'work', label: 'Work' },
            { value: 'deep_work', label: 'Deep Work' },
            { value: 'emergency', label: 'Emergency' },
          ]}
        />
      </div>

      <label style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--ink)',
        cursor: 'pointer',
        marginBottom: 18,
      }}>
        <input
          type="checkbox"
          checked={draft.isProtected}
          onChange={(e) => setDraft({ ...draft, isProtected: e.target.checked })}
          style={{ accentColor: 'var(--accent)' }}
        />
        Protect from rebuild
      </label>

      <div style={{
        padding: '10px 12px',
        border: '1px solid var(--line)',
        borderRadius: 6,
        background: 'var(--bg-raise)',
        fontSize: 11.5,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono)',
        marginBottom: 18,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        rowGap: 4,
      }}>
        <span>Status</span>
        <span style={{ color: 'var(--ink)', textAlign: 'right' }}>{draft.status}</span>
        <span>Source</span>
        <span style={{ color: 'var(--ink)', textAlign: 'right' }}>{draft.source}</span>
        <span>Duration</span>
        <span style={{ color: 'var(--ink)', textAlign: 'right' }}>
          {formatDuration(Math.round((draft.endTime - draft.startTime) / 60_000))}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            if (confirm(`Delete block "${draft.title}"?`)) onDelete(draft.id);
          }}
          style={{
            padding: '7px 12px',
            background: 'transparent',
            border: '1px solid color-mix(in oklch, var(--danger) 50%, var(--line))',
            borderRadius: 5,
            color: 'var(--danger)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icons.trash size={12} /> Delete
        </button>
        <span style={{ flex: 1 }} />
        <button
          onClick={onClose}
          style={{
            padding: '7px 14px',
            background: 'var(--bg-raise)',
            border: '1px solid var(--line)',
            borderRadius: 5,
            color: 'var(--ink)',
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSave(draft.id, {
              title: draft.title,
              blockType: draft.blockType,
              startTime: draft.startTime,
              endTime: draft.endTime,
              taskId: draft.taskId,
              enforcementProfile: draft.enforcementProfile,
              isProtected: draft.isProtected,
            })
          }
          style={{
            padding: '7px 14px',
            background: 'var(--accent)',
            color: 'oklch(0.18 0.04 60)',
            border: '1px solid var(--accent)',
            borderRadius: 5,
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>
    </aside>
  );
}

interface AddModalProps {
  onClose: () => void;
  onCreate: (block: {
    title: string;
    blockType: TimeBlock['blockType'];
    startTime: number;
    endTime: number;
    taskId: number | null;
    enforcementProfile: string | null;
  }) => Promise<void>;
  tasks: Task[];
}

function AddBlockModal({ onClose, onCreate, tasks }: AddModalProps) {
  const now = Date.now();
  const oneHour = 60 * 60_000;
  const [title, setTitle] = useState('Focus block');
  const [type, setType] = useState<TimeBlock['blockType']>('work');
  const [start, setStart] = useState(now);
  const [end, setEnd] = useState(now + oneHour);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [profile, setProfile] = useState<string>('work');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const submit = async () => {
    if (busy) return;
    if (end <= start) {
      alert('End must be after start.');
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        title: title.trim() || 'Untitled',
        blockType: type,
        startTime: start,
        endTime: end,
        taskId,
        enforcementProfile: profile,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(10,9,8,0.55)',
        backdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: 'center',
        animation: 'ap-fade 140ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          padding: '22px 24px',
          animation: 'ap-rise 180ms cubic-bezier(.2,.7,.2,1)',
        }}
      >
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          color: 'var(--ink)',
          letterSpacing: '-0.015em',
          marginBottom: 14,
        }}>
          Add time block
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Type</div>
              <Dropdown
                value={type}
                onChange={setType}
                style={inputStyle}
                options={[
                  { value: 'work', label: 'Work' },
                  { value: 'break', label: 'Break' },
                  { value: 'sleep', label: 'Sleep' },
                  { value: 'meal', label: 'Meal' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Profile</div>
              <Dropdown
                value={profile}
                onChange={setProfile}
                style={inputStyle}
                options={[
                  { value: 'rest', label: 'Rest' },
                  { value: 'work', label: 'Work' },
                  { value: 'deep_work', label: 'Deep Work' },
                ]}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Start</div>
              <input
                type="datetime-local"
                value={dateInputFromEpoch(start)}
                onChange={(e) => {
                  const t = epochFromDateInput(e.target.value);
                  if (t != null) setStart(t);
                }}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>End</div>
              <input
                type="datetime-local"
                value={dateInputFromEpoch(end)}
                onChange={(e) => {
                  const t = epochFromDateInput(e.target.value);
                  if (t != null) setEnd(t);
                }}
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Linked task (optional)</div>
            <Dropdown
              value={taskId == null ? '' : String(taskId)}
              onChange={(v) => setTaskId(v === '' ? null : Number(v))}
              style={inputStyle}
              options={[
                { value: '', label: 'No task' },
                ...tasks.map((t) => ({ value: String(t.id), label: t.name })),
              ]}
            />
          </div>
        </div>
        <div style={{
          marginTop: 18,
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 5,
              color: 'var(--ink)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '8px 14px',
              background: 'var(--accent)',
              color: 'oklch(0.18 0.04 60)',
              border: '1px solid var(--accent)',
              borderRadius: 5,
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Add block
          </button>
        </div>
      </div>
    </div>
  );
}

function HourLabels({
  scale,
  expandedRuns,
  onToggleRun,
}: {
  scale: TimelineScale;
  expandedRuns: ReadonlySet<string>;
  onToggleRun: (key: string) => void;
}): ReactNode {
  const out: ReactNode[] = [];
  for (const run of scale.runs) {
    const key = runKey(run);
    const expanded = expandedRuns.has(key);
    if (run.compressed) {
      const yMid = (scale.yOf(run.startHour) + scale.yOf(run.endHour)) / 2;
      out.push(
        <button
          key={`toggle-${key}`}
          onClick={() => onToggleRun(key)}
          title={expanded ? 'Collapse compressed time' : 'Expand compressed time'}
          style={{
            position: 'absolute',
            top: yMid,
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 16,
            height: 16,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {expanded ? <Icons.chevronD size={12} /> : <Icons.chevron size={12} />}
        </button>,
      );
    }
    const marks = run.compressed
      ? [run.startHour, run.endHour]
      : Array.from({ length: run.endHour - run.startHour + 1 }, (_, i) => run.startHour + i);
    for (const h of marks) {
      const key = `${run.startHour}-${run.endHour}-${h}`;
      const isLast = h === TIMELINE_END_HOUR;
      out.push(
        <div
          key={key}
          style={{
            position: 'absolute',
            top: isLast ? scale.height - 14 : scale.yOf(h) + 2,
            right: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--faint)',
            textAlign: 'right',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {String(h % 24).padStart(2, '0')}:00
        </div>,
      );
    }
  }
  return (
    <div style={{ position: 'relative', height: scale.height }}>
      {out}
    </div>
  );
}

function HourLines({ scale }: { scale: TimelineScale }): ReactNode {
  const out: ReactNode[] = [];
  for (const run of scale.runs) {
    if (run.compressed) {
      out.push(
        <div
          key={`compressed-${run.startHour}`}
          title="Compressed time"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: scale.yOf(run.startHour),
            height: scale.yOf(run.endHour) - scale.yOf(run.startHour),
            background:
              'repeating-linear-gradient(135deg, transparent 0 10px, color-mix(in oklch, var(--ink) 4%, transparent) 10px 11px)',
            borderTop: '1px dashed color-mix(in oklch, var(--line) 70%, transparent)',
            borderBottom: '1px dashed color-mix(in oklch, var(--line) 70%, transparent)',
          }}
        />,
      );
      continue;
    }
    for (let h = run.startHour + 1; h <= run.endHour; h++) {
      out.push(
        <div
          key={`${run.startHour}-${h}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: scale.yOf(h),
            borderTop: '1px dashed var(--line)',
          }}
        />,
      );
    }
  }
  return out;
}

function CurrentTimeLine({
  day,
  now,
  scale,
}: {
  day: number;
  now: number;
  scale: TimelineScale;
}) {
  if (startOfDay(now) !== day) return null;
  const hour = (now - day) / HOUR_MS;
  if (hour < TIMELINE_START_HOUR || hour > TIMELINE_END_HOUR) return null;
  const y = scale.yOf(hour);
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        zIndex: 3,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: -1,
          borderTop: '2px solid var(--accent)',
          background: 'var(--accent)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 6,
          top: 0,
          transform: 'translateY(-50%)',
          width: 42,
          height: 18,
          padding: '0 4px',
          borderRadius: 4,
          background: 'var(--accent)',
          color: 'oklch(0.18 0.04 60)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          lineHeight: '18px',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatHHMM(now)}
      </div>
    </div>
  );
}

const SCHED_TEMPLATES = [
  {
    id: 'maker',
    name: 'Maker week',
    desc: 'No meetings before 13:00 · deep windows 09–12 · PR review 17:00.',
  },
  {
    id: 'manager',
    name: 'Manager week',
    desc: '1:1s Tue/Thu · standup daily 09:00 · lunch held 12:00–12:45.',
  },
  {
    id: 'thesis',
    name: 'Thesis sprint',
    desc: 'Two 2h deep blocks daily · lit-review only · gym moved to 19:00.',
  },
  {
    id: 'recover',
    name: 'Recovery',
    desc: 'No deep work · max 3h task time/day · long lunch · hard stop 18:00.',
  },
];

function TemplatesButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '7px 12px',
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          color: 'var(--ink)',
          fontSize: 12.5,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Templates
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          width: 320,
          zIndex: 50,
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          boxShadow: '0 16px 32px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--line)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            textTransform: 'uppercase',
            letterSpacing: '0.13em',
            color: 'var(--faint)',
          }}>
            Apply weekly template
          </div>
          <div style={{ padding: '6px 0' }}>
            {SCHED_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ink-soft)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>{t.name}</div>
                <div style={{
                  fontSize: 11.5,
                  color: 'var(--muted)',
                  marginTop: 3,
                  lineHeight: 1.4,
                }}>
                  {t.desc}
                </div>
              </button>
            ))}
          </div>
          <div style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--line)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--faint)',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>Edit templates…</span>
            <span>Save current week as template</span>
          </div>
        </div>
      )}
    </div>
  );
}

type ViewMode = 'day' | '5d' | 'week';

const VIEW_DAYS: Record<ViewMode, number> = {
  day: 1,
  '5d': 5,
  week: 7,
};

const VIEW_LABELS: Record<ViewMode, string> = {
  day: 'Day',
  '5d': '5d',
  week: 'Week',
};

function Stat({
  n,
  l,
  accent,
}: {
  n: number | string;
  l: string;
  accent?: boolean;
}) {
  return (
    <span>
      <span style={{
        color: accent ? 'var(--accent-ink)' : 'var(--ink)',
        fontWeight: 500,
      }}>
        {n}
      </span>{' '}
      {l}
    </span>
  );
}

function DotSep() {
  return <span style={{ color: 'var(--faint)' }}>·</span>;
}

function ReplanLog({ entries }: { entries: MutationHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div style={{
        padding: '16px 28px',
        fontSize: 12,
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        No mutations recorded in the last week.
      </div>
    );
  }
  return (
    <div style={{
      maxHeight: 220,
      overflow: 'auto',
      padding: '10px 28px',
      borderTop: '1px solid var(--line)',
      background: 'var(--bg-raise)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 8,
      }}>
        Replan log · {entries.length} entries
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries
          .slice()
          .sort((a, b) => b.occurredAt - a.occurredAt)
          .slice(0, 80)
          .map((e) => (
            <div
              key={e.id}
              style={{
                padding: '8px 10px',
                border: '1px solid var(--line)',
                borderRadius: 6,
                background: 'var(--bg)',
                display: 'grid',
                gridTemplateColumns: '160px 160px minmax(0, 1fr)',
                gap: 12,
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--muted)',
              }}
            >
              <span style={{ color: 'var(--faint)' }}>
                {new Date(e.occurredAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: false,
                })}
              </span>
              <span style={{ color: 'var(--ink)' }}>{e.action}</span>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {summariseHistory(e.payloadJson)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function summariseHistory(payloadJson: string): string {
  try {
    const parsed = JSON.parse(payloadJson) as {
      mutations?: { kind: string }[];
      warnings?: { kind: string }[];
      pseudoDeadline?: number | null;
    };
    const mutCount = parsed.mutations?.length ?? 0;
    const warnCount = parsed.warnings?.length ?? 0;
    const parts: string[] = [];
    if (mutCount > 0) parts.push(`${mutCount} mutation${mutCount === 1 ? '' : 's'}`);
    if (warnCount > 0) parts.push(`${warnCount} warning${warnCount === 1 ? '' : 's'}`);
    if (parsed.pseudoDeadline) {
      parts.push(
        `finish ${new Date(parsed.pseudoDeadline).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: false,
        })}`,
      );
    }
    return parts.length > 0 ? parts.join(' · ') : 'no diff';
  } catch {
    return '—';
  }
}

interface MutationHistoryEntry {
  id: number;
  action: string;
  payloadJson: string;
  occurredAt: number;
}

export function ScheduleScreen() {
  const [view, setView] = useState<ViewMode>('5d');
  // Track short window height so the toolbar can collapse to a single
  // horizontally-scrollable row instead of wrapping to 3-4 rows of
  // chrome that eat the actual schedule grid.
  const [shortHeight, setShortHeight] = useState(
    () => typeof window !== 'undefined' && window.innerHeight < 600,
  );
  useEffect(() => {
    const onResize = () => setShortHeight(window.innerHeight < 600);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState<MutationHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pxPerHour, setPxPerHour] = useState(DEFAULT_TIMELINE_PX_PER_HOUR);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const daysToShow = VIEW_DAYS[view];

  const refresh = useCallback(async () => {
    try {
      const now = Date.now();
      const from = viewStartDay(view, now);
      const to = from + daysToShow * DAY_MS;
      const [list, taskList, historyList, groupList] = await Promise.all([
        api.getScheduleRange(from, to),
        api.getTasks(),
        api.getScheduleMutationHistory(from - 7 * DAY_MS, to),
        api.getTaskGroups(),
      ]);
      setBlocks(list);
      setTasks(taskList);
      setHistory(historyList);
      setGroups(groupList);
    } catch (err) {
      setError(String(err));
    }
  }, [view, daysToShow]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const dayBuckets = useMemo(() => {
    const buckets: { day: number; segments: BlockSegment[]; blockCount: number }[] = [];
    const start = viewStartDay(view, now);
    for (let i = 0; i < daysToShow; i++) {
      const day = start + i * DAY_MS;
      const segments = buildBlockSegmentsForDay(day, blocks);
      buckets.push({
        day,
        segments,
        blockCount: new Set(segments.map((segment) => segment.block.id)).size,
      });
    }
    return buckets;
  }, [blocks, view, daysToShow, now]);

  const timelineScale = useMemo(
    () => buildTimelineScale(dayBuckets, pxPerHour, expandedRuns),
    [dayBuckets, pxPerHour, expandedRuns],
  );

  const toggleRun = useCallback((key: string) => {
    setExpandedRuns((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const zoomTimeline = useCallback((delta: number) => {
    setPxPerHour((previous) =>
      Math.min(MAX_TIMELINE_PX_PER_HOUR, Math.max(MIN_TIMELINE_PX_PER_HOUR, previous + delta)),
    );
  }, []);

  const stats = useMemo(() => {
    let workMinutes = 0;
    let deepBlocks = 0;
    let restMinutes = 0;
    let fixedBlocks = 0;
    for (const b of blocks) {
      const mins = Math.max(0, (b.endTime - b.startTime) / 60_000);
      if (b.blockType === 'work') workMinutes += mins;
      if (b.enforcementProfile === 'deep_work') deepBlocks += 1;
      if (
        b.blockType === 'break' ||
        b.blockType === 'sleep' ||
        b.blockType === 'meal'
      ) {
        restMinutes += mins;
      }
      if (b.source === 'template') fixedBlocks += 1;
    }
    return {
      blockCount: blocks.length,
      workHours: Math.round(workMinutes / 6) / 10,
      deepBlocks,
      restHours: Math.round(restMinutes / 6) / 10,
      fixedBlocks,
    };
  }, [blocks]);

  const projectedFinish = useMemo(() => {
    const filtered = blocks.filter(
      (b) =>
        b.blockType !== 'sleep' &&
        b.blockType !== 'meal' &&
        b.blockType !== 'break' &&
        (b.status === 'scheduled' || b.status === 'active' || b.status === 'paused'),
    );
    if (filtered.length === 0) return null;
    return Math.max(...filtered.map((b) => b.endTime));
  }, [blocks]);

  const taskById = useMemo(() => {
    const map = new Map<number, Task>();
    tasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [tasks]);

  const groupColorById = useMemo(() => {
    const map = new Map<number, string | null>();
    groups.forEach((g) => map.set(g.id, g.color));
    return map;
  }, [groups]);

  const selectedBlock = selected ? blocks.find((b) => b.id === selected) ?? null : null;

  const rebuild = async () => {
    try {
      await api.rebuildSchedule();
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const saveBlock = async (id: number, patch: Partial<TimeBlock>) => {
    try {
      await api.updateTimeBlock(id, patch);
      setSelected(null);
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const deleteBlock = async (id: number) => {
    try {
      await api.deleteTimeBlock(id);
      setSelected(null);
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const addBlock = async (block: {
    title: string;
    blockType: TimeBlock['blockType'];
    startTime: number;
    endTime: number;
    taskId: number | null;
    enforcementProfile: string | null;
  }) => {
    try {
      await api.addTimeBlock({
        title: block.title,
        blockType: block.blockType,
        startTime: block.startTime,
        endTime: block.endTime,
        taskId: block.taskId,
        intensity: block.blockType === 'work' ? 3 : 1,
        source: 'manual',
        isProtected: false,
        enforcementProfile: block.enforcementProfile,
      });
      refresh();
    } catch (err) {
      setError(String(err));
      throw err;
    }
  };

  const rangeLabel = useMemo(() => {
    const startMs = viewStartDay(view, Date.now());
    const first = new Date(startMs);
    const last = new Date(startMs + (daysToShow - 1) * DAY_MS);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (daysToShow === 1) return fmt(first);
    return `${fmt(first)} – ${fmt(last)}`;
  }, [view, daysToShow]);

  const finishLabel = projectedFinish
    ? new Date(projectedFinish).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '—';

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
        <div style={{
          padding: shortHeight ? '8px 16px' : '14px 28px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: shortHeight ? 10 : 20,
          // Items always wrap left-to-right so they stay left-aligned.
          // At short height we cap the toolbar's height and let it
          // scroll vertically inside that cap, so toolbar chrome can't
          // dominate the page.
          flexWrap: 'wrap',
          maxHeight: shortHeight ? 76 : undefined,
          overflowY: shortHeight ? 'auto' : 'visible',
          flexShrink: 0,
        }}>
          {!shortHeight && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {rangeLabel}
            </div>
          )}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 18,
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}>
            <Stat n={stats.blockCount} l="blocks today" />
            <DotSep />
            <Stat n={`${stats.workHours}h`} l="task time" />
            <DotSep />
            <Stat n={finishLabel} l="projected finish" accent />
          </div>
          {/* Buttons grouped together so they wrap as a single block
              to the next row when the toolbar can't fit them all,
              instead of splitting (e.g. view+templates on row 1 and
              replan on row 2). */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: shortHeight ? 10 : 20,
            flexShrink: 0,
            flexWrap: 'nowrap',
          }}>
          <div style={{
            display: 'inline-flex',
            border: '1px solid var(--line)',
            borderRadius: 6,
            overflow: 'hidden',
            background: 'var(--bg-raise)',
            flexShrink: 0,
          }}>
            {(['day', '5d', 'week'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '6px 12px',
                  background: view === v ? 'var(--ink-soft)' : 'transparent',
                  color: view === v ? 'var(--ink)' : 'var(--muted)',
                  border: 'none',
                  fontSize: 12,
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  fontWeight: view === v ? 500 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          <TemplatesButton />
          <button
            onClick={() => setShowHistory((v) => !v)}
            style={{
              padding: '7px 12px',
              background: 'var(--bg-raise)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              color: 'var(--ink)',
              fontSize: 12.5,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {showHistory ? 'Hide log' : 'Replan log'}
          </button>
          <button
            onClick={rebuild}
            title="Recompute the plan based on current tasks and boundaries"
            style={{
              padding: '7px 14px',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-fg)',
              border: '1px solid var(--btn-primary-bg)',
              borderRadius: 6,
              fontSize: 12.5,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Replan
          </button>
          </div>
        </div>

        <div
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
            event.preventDefault();
            zoomTimeline(event.deltaY < 0 ? 4 : -4);
          }}
          style={{ flex: 1, overflow: 'auto' }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: `60px repeat(${daysToShow}, 1fr)`,
            minWidth: view === 'day' ? 320 : 720,
          }}>
            <div style={{
              borderRight: '1px solid var(--line)',
              borderBottom: '1px solid var(--line)',
              background: 'var(--bg)',
              position: 'sticky',
              top: 0,
              zIndex: 8,
            }}>
              <div style={{ height: 40 }} />
            </div>
            {dayBuckets.map((bucket) => (
              <div
                key={bucket.day}
                style={{
                  borderRight: '1px solid var(--line)',
                  borderBottom: '1px solid var(--line)',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  background: 'var(--bg)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 8,
                }}
              >
                {dayKey(bucket.day)}
                <span style={{ color: 'var(--faint)', marginLeft: 6 }}>
                  ({bucket.blockCount})
                </span>
              </div>
            ))}

            <div style={{
              borderRight: '1px solid var(--line)',
              position: 'relative',
            }}>
              <HourLabels
                scale={timelineScale}
                expandedRuns={expandedRuns}
                onToggleRun={toggleRun}
              />
            </div>
            {dayBuckets.map((bucket) => (
              <div
                key={bucket.day}
                style={{
                  borderRight: '1px solid var(--line)',
                  position: 'relative',
                  height: timelineScale.height,
                  background:
                    startOfDay(now) === bucket.day
                      ? 'color-mix(in oklch, var(--ink) 5%, var(--bg))'
                      : 'transparent',
                }}
              >
                <HourLines scale={timelineScale} />
                <CurrentTimeLine day={bucket.day} now={now} scale={timelineScale} />
                {bucket.segments.map((segment) => {
                  const task = segment.block.taskId
                    ? taskById.get(segment.block.taskId) ?? null
                    : null;
                  const groupColor =
                    task?.groupId != null
                      ? groupColorById.get(task.groupId) ?? null
                      : null;
                  return (
                    <BlockTile
                      key={`${segment.block.id}-${segment.startTime}`}
                      segment={segment}
                      dayStart={bucket.day}
                      scale={timelineScale}
                      task={task}
                      groupColor={groupColor}
                      selected={segment.block.id === selected}
                      onClick={() => setSelected(segment.block.id)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {showHistory && <ReplanLog entries={history} />}
      </div>

      {selectedBlock && (
        <Inspector
          block={selectedBlock}
          tasks={tasks}
          onClose={() => setSelected(null)}
          onSave={saveBlock}
          onDelete={deleteBlock}
        />
      )}

      {adding && (
        <AddBlockModal
          tasks={tasks}
          onClose={() => setAdding(false)}
          onCreate={addBlock}
        />
      )}

      {error && (
        <div
          onClick={() => setError(null)}
          style={{
            position: 'fixed',
            bottom: 30,
            right: 30,
            padding: '10px 14px',
            background: 'var(--bg-raise)',
            border: '1px solid var(--danger)',
            borderRadius: 8,
            color: 'var(--ink)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            cursor: 'pointer',
            maxWidth: 360,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
