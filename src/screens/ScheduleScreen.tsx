import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../api';
import type { Task, TimeBlock } from '../api/types';
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

const TIMELINE_PX_PER_HOUR = 56;
const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 24;

function startOfDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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

function blockTopPx(block: TimeBlock): number {
  const start = new Date(block.startTime);
  const minutes = start.getHours() * 60 + start.getMinutes();
  const baseMin = TIMELINE_START_HOUR * 60;
  return ((minutes - baseMin) / 60) * TIMELINE_PX_PER_HOUR;
}

function blockHeightPx(block: TimeBlock): number {
  const minutes = (block.endTime - block.startTime) / 60_000;
  return Math.max(28, (minutes / 60) * TIMELINE_PX_PER_HOUR);
}

function BlockTile({
  block,
  task,
  selected,
  onClick,
}: {
  block: TimeBlock;
  task: Task | null;
  selected: boolean;
  onClick: () => void;
}) {
  const kind = railKindFor(block);
  const bar = blockBarColor(kind);
  const title = task?.name ?? block.title;
  const isPast = block.endTime < Date.now();
  return (
    <button
      onClick={onClick}
      style={{
        position: 'absolute',
        left: 4,
        right: 4,
        top: blockTopPx(block),
        height: blockHeightPx(block),
        textAlign: 'left',
        padding: '4px 8px',
        background: selected ? 'var(--accent-soft)' : 'var(--bg-raise)',
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
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--muted)',
      }}>
        {formatHHMM(block.startTime)} – {formatHHMM(block.endTime)}
      </div>
      <div style={{
        fontSize: 12,
        marginTop: 2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {title}
      </div>
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
        <select
          value={draft.blockType}
          onChange={(e) =>
            setDraft({ ...draft, blockType: e.target.value as TimeBlock['blockType'] })
          }
          style={inputStyle}
        >
          <option value="work">Work</option>
          <option value="break">Break</option>
          <option value="sleep">Sleep</option>
          <option value="meal">Meal</option>
          <option value="custom">Custom</option>
        </select>
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
        <select
          value={draft.taskId ?? ''}
          onChange={(e) =>
            setDraft({
              ...draft,
              taskId: e.target.value === '' ? null : Number(e.target.value),
            })
          }
          style={inputStyle}
        >
          <option value="">No task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Profile</div>
        <select
          value={draft.enforcementProfile ?? ''}
          onChange={(e) =>
            setDraft({
              ...draft,
              enforcementProfile: e.target.value === '' ? null : e.target.value,
            })
          }
          style={inputStyle}
        >
          <option value="">Inherit</option>
          <option value="rest">Rest</option>
          <option value="work">Work</option>
          <option value="deep_work">Deep Work</option>
          <option value="emergency">Emergency</option>
        </select>
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
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TimeBlock['blockType'])}
                style={inputStyle}
              >
                <option value="work">Work</option>
                <option value="break">Break</option>
                <option value="sleep">Sleep</option>
                <option value="meal">Meal</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Profile</div>
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                style={inputStyle}
              >
                <option value="rest">Rest</option>
                <option value="work">Work</option>
                <option value="deep_work">Deep Work</option>
              </select>
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
            <select
              value={taskId ?? ''}
              onChange={(e) =>
                setTaskId(e.target.value === '' ? null : Number(e.target.value))
              }
              style={inputStyle}
            >
              <option value="">No task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
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

function HourLabels(): ReactNode {
  const out: ReactNode[] = [];
  for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h++) {
    out.push(
      <div
        key={h}
        style={{
          height: TIMELINE_PX_PER_HOUR,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--faint)',
          textAlign: 'right',
          paddingRight: 8,
          paddingTop: 2,
          borderTop: h === TIMELINE_START_HOUR ? 'none' : '1px dashed var(--line)',
        }}
      >
        {String(h).padStart(2, '0')}:00
      </div>,
    );
  }
  return out;
}

function HourLines(): ReactNode {
  const out: ReactNode[] = [];
  for (let h = TIMELINE_START_HOUR + 1; h <= TIMELINE_END_HOUR; h++) {
    out.push(
      <div
        key={h}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: (h - TIMELINE_START_HOUR) * TIMELINE_PX_PER_HOUR,
          borderTop: '1px dashed var(--line)',
        }}
      />,
    );
  }
  return out;
}

const DEFAULT_DAYS = 5;
type ViewMode = 'day' | 'week';

function Stat({
  n,
  l,
  accent,
}: {
  n: number;
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
  const [view, setView] = useState<ViewMode>('week');
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState<MutationHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysToShow = view === 'day' ? 1 : DEFAULT_DAYS;

  const refresh = useCallback(async () => {
    try {
      const now = Date.now();
      const from = startOfDay(now);
      const to = from + daysToShow * 86_400_000;
      const [list, taskList, historyList] = await Promise.all([
        api.getScheduleRange(from, to),
        api.getTasks(),
        api.getScheduleMutationHistory(from - 7 * 86_400_000, to),
      ]);
      setBlocks(list);
      setTasks(taskList);
      setHistory(historyList);
    } catch (err) {
      setError(String(err));
    }
  }, [daysToShow]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const dayBuckets = useMemo(() => {
    const buckets: { day: number; blocks: TimeBlock[] }[] = [];
    const today = startOfDay(Date.now());
    for (let i = 0; i < daysToShow; i++) {
      const day = today + i * 86_400_000;
      buckets.push({
        day,
        blocks: blocks.filter(
          (b) => b.startTime >= day && b.startTime < day + 86_400_000,
        ),
      });
    }
    return buckets;
  }, [blocks, daysToShow]);

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

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{
          padding: '16px 28px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              color: 'var(--ink)',
              letterSpacing: '-0.02em',
            }}>
              Schedule
            </div>
            <span style={{ flex: 1 }} />
            <div style={{
              display: 'inline-flex',
              gap: 0,
              border: '1px solid var(--line)',
              borderRadius: 6,
              overflow: 'hidden',
            }}>
              {(['day', 'week'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: '6px 14px',
                    background: view === v ? 'var(--ink-soft)' : 'transparent',
                    color: view === v ? 'var(--ink)' : 'var(--muted)',
                    border: 'none',
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer',
                    fontWeight: view === v ? 500 : 400,
                  }}
                >
                  {v === 'day' ? 'Day' : 'Week'}
                </button>
              ))}
            </div>
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
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {showHistory ? 'Hide' : 'Show'} replan log
            </button>
            <button
              onClick={() => setAdding(true)}
              style={{
                padding: '7px 14px',
                background: 'var(--bg-raise)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                color: 'var(--ink)',
                fontSize: 12.5,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Icons.plus size={13} /> Add block
            </button>
            <button
              onClick={rebuild}
              style={{
                padding: '7px 14px',
                background: 'var(--accent)',
                color: 'oklch(0.18 0.04 60)',
                border: '1px solid var(--accent)',
                borderRadius: 6,
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              Rebuild
            </button>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            flexWrap: 'wrap',
            fontFamily: 'var(--font-mono)',
            fontSize: 11.5,
            color: 'var(--muted)',
          }}>
            <Stat n={stats.blockCount} l="blocks" />
            <DotSep />
            <Stat n={stats.workHours} l="work hours" />
            <DotSep />
            <Stat n={stats.deepBlocks} l="deep" accent />
            <DotSep />
            <Stat n={stats.restHours} l="rest hours" />
            <DotSep />
            <Stat n={stats.fixedBlocks} l="fixed" />
            {projectedFinish && (
              <>
                <DotSep />
                <span>
                  projected finish{' '}
                  <span style={{ color: 'var(--ink)' }}>
                    {new Date(projectedFinish).toLocaleString('en-US', {
                      weekday: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
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
              zIndex: 1,
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
                  zIndex: 1,
                }}
              >
                {dayKey(bucket.day)}
                <span style={{ color: 'var(--faint)', marginLeft: 6 }}>
                  ({bucket.blocks.length})
                </span>
              </div>
            ))}

            <div style={{
              borderRight: '1px solid var(--line)',
              padding: '4px 0',
            }}>
              {HourLabels()}
            </div>
            {dayBuckets.map((bucket) => (
              <div
                key={bucket.day}
                style={{
                  borderRight: '1px solid var(--line)',
                  position: 'relative',
                  height:
                    (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * TIMELINE_PX_PER_HOUR,
                  paddingTop: 4,
                }}
              >
                {HourLines()}
                {bucket.blocks.map((block) => (
                  <BlockTile
                    key={block.id}
                    block={block}
                    task={block.taskId ? taskById.get(block.taskId) ?? null : null}
                    selected={block.id === selected}
                    onClick={() => setSelected(block.id)}
                  />
                ))}
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
