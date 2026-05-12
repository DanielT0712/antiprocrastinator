import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../api';
import type { NewTask, Task, TaskGroup, TaskUpdate, TimeBlock } from '../api/types';
import { Icons } from '../components/Icons';
import {
  PlanModal,
  RemoveFromPlanModal,
  TasksBulkBar,
  TasksGroupManager,
  TasksGroupRail,
  type BulkAction,
} from '../components/TasksExtras';
import { formatDuration, formatHHMM, priorityLabel } from '../lib/format';

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  color: 'var(--faint)',
};

const inputStyle: CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--line)',
  borderRadius: 5,
  color: 'var(--ink)',
  fontSize: 12,
  padding: '6px 8px',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
};

const PROFILE_OPTIONS = [
  { v: 'rest', l: 'Rest' },
  { v: 'work', l: 'Work' },
  { v: 'deep_work', l: 'Deep Work' },
  { v: 'emergency', l: 'Emergency' },
] as const;

function PriorityChip({ p }: { p: number }) {
  const color =
    p >= 5
      ? 'var(--danger)'
      : p >= 4
        ? 'oklch(0.65 0.16 35)'
        : p >= 3
          ? 'var(--accent-ink)'
          : 'var(--muted)';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      fontFamily: 'var(--font-mono)',
      color,
    }}>
      <span style={{
        fontWeight: 500,
        padding: '1px 5px',
        borderRadius: 3,
        background: 'color-mix(in oklch, currentColor 14%, transparent)',
      }}>P{p}</span>
      {priorityLabel(p)}
    </span>
  );
}

function GroupChip({
  group,
}: {
  group: TaskGroup | undefined;
}) {
  if (!group) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: 'var(--faint)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          border: '1px dashed var(--line)',
        }} />
        no group
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11.5,
      color: 'var(--ink)',
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: 2,
        background: group.color ?? 'var(--muted)',
      }} />
      {group.name}
    </span>
  );
}

function formatDeadline(deadline: number | null, now: number): string {
  if (!deadline) return 'No deadline';
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const time = formatHHMM(deadline);
  if (dayDiff < 0) return `${Math.abs(dayDiff)}d overdue`;
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (dayDiff < 7) {
    return `${new Date(deadline).toLocaleDateString('en-US', {
      weekday: 'short',
    })} ${time}`;
  }
  return `${new Date(deadline).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })} ${time}`;
}

function epochFromDateInput(value: string): number | null {
  if (!value) return null;
  const ts = new Date(value + 'T18:00:00').getTime();
  return Number.isFinite(ts) ? ts : null;
}

function dateInputFromEpoch(epoch: number | null): string {
  if (!epoch) return '';
  const d = new Date(epoch);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function minutesToTime(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0) return '';
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number | null {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

interface QuickAddProps {
  groups: TaskGroup[];
  onAdd: (task: NewTask) => Promise<void>;
}

function QuickAdd({ groups, onAdd }: QuickAddProps) {
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [priority, setPriority] = useState(3);
  const [estimate, setEstimate] = useState(60);
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      await onAdd({
        name: name.trim(),
        groupId: groupId === '' ? null : Number(groupId),
        priority,
        estimatedMinutes: estimate || null,
        deadline: epochFromDateInput(deadline),
      });
      setName('');
      setEstimate(60);
      setDeadline('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      borderBottom: '1px solid var(--line)',
      padding: '10px 24px',
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
      background: 'var(--bg-raise)',
    }}>
      <span style={{ ...labelStyle, marginRight: 4 }}>Quick add</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Task name…"
        style={{ ...inputStyle, flex: '1 1 220px', minWidth: 180 }}
      />
      <select
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        style={{ ...inputStyle, width: 130 }}
      >
        <option value="">No group</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <select
        value={priority}
        onChange={(e) => setPriority(Number(e.target.value))}
        style={{ ...inputStyle, width: 110 }}
      >
        {[1, 2, 3, 4, 5].map((p) => (
          <option key={p} value={p}>
            P{p} {priorityLabel(p)}
          </option>
        ))}
      </select>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          min={5}
          step={5}
          value={estimate}
          onChange={(e) => setEstimate(Number(e.target.value))}
          style={{ ...inputStyle, width: 64, fontFamily: 'var(--font-mono)', textAlign: 'right' }}
        />
        <span style={{ color: 'var(--faint)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          min
        </span>
      </div>
      <input
        type="date"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        title="Deadline (optional)"
        style={{ ...inputStyle, width: 132, fontFamily: 'var(--font-mono)' }}
      />
      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        style={{
          padding: '6px 12px',
          background: busy || !name.trim() ? 'var(--line)' : 'var(--accent)',
          color: busy || !name.trim() ? 'var(--muted)' : 'oklch(0.18 0.04 60)',
          border: '1px solid var(--accent)',
          borderRadius: 5,
          fontSize: 12,
          cursor: busy || !name.trim() ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-sans)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <Icons.plus size={12} /> Add
      </button>
      <span style={{
        fontSize: 10.5,
        color: 'var(--faint)',
        fontFamily: 'var(--font-mono)',
      }}>
        added to library · open task to plan
      </span>
    </div>
  );
}

interface DrawerProps {
  task: Task;
  groups: TaskGroup[];
  onClose: () => void;
  onUpdate: (id: number, updates: TaskUpdate) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  planned: boolean;
  onAddToPlan: () => void;
  onRemoveFromPlan: () => void;
}

function Drawer({
  task,
  groups,
  onClose,
  onUpdate,
  onDelete,
  planned,
  onAddToPlan,
  onRemoveFromPlan,
}: DrawerProps) {
  const [draft, setDraft] = useState<Task>(task);

  useEffect(() => setDraft(task), [task.id]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (patch: Partial<Task>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    const updates: TaskUpdate = {};
    if (draft.name !== task.name) updates.name = draft.name;
    if (draft.groupId !== task.groupId) updates.groupId = draft.groupId;
    if (draft.priority !== task.priority) updates.priority = draft.priority;
    if (draft.estimatedMinutes !== task.estimatedMinutes) {
      updates.estimatedMinutes = draft.estimatedMinutes;
    }
    if (draft.deadline !== task.deadline) updates.deadline = draft.deadline;
    if (draft.maxChunkMinutes !== task.maxChunkMinutes) {
      updates.maxChunkMinutes = draft.maxChunkMinutes;
    }
    if (draft.minChunkMinutes !== task.minChunkMinutes) {
      updates.minChunkMinutes = draft.minChunkMinutes;
    }
    if (draft.minimumRestMinutes !== task.minimumRestMinutes) {
      updates.minimumRestMinutes = draft.minimumRestMinutes;
    }
    if (draft.workRatio !== task.workRatio) updates.workRatio = draft.workRatio;
    if (draft.restRatio !== task.restRatio) updates.restRatio = draft.restRatio;
    if (draft.protectGeneratedBlocks !== task.protectGeneratedBlocks) {
      updates.protectGeneratedBlocks = draft.protectGeneratedBlocks;
    }
    if (draft.enforcementProfile !== task.enforcementProfile) {
      updates.enforcementProfile = draft.enforcementProfile;
    }
    if (draft.kind !== task.kind) updates.kind = draft.kind;
    if (draft.fixedWindowStartMinute !== task.fixedWindowStartMinute) {
      updates.fixedWindowStartMinute = draft.fixedWindowStartMinute;
    }
    if (draft.fixedWindowEndMinute !== task.fixedWindowEndMinute) {
      updates.fixedWindowEndMinute = draft.fixedWindowEndMinute;
    }
    if (draft.recurrenceKind !== task.recurrenceKind) {
      updates.recurrenceKind = draft.recurrenceKind;
    }
    if (draft.recurrenceDaysMask !== task.recurrenceDaysMask) {
      updates.recurrenceDaysMask = draft.recurrenceDaysMask;
    }
    if (draft.recurrenceAnchorDate !== task.recurrenceAnchorDate) {
      updates.recurrenceAnchorDate = draft.recurrenceAnchorDate;
    }
    if (Object.keys(updates).length > 0) {
      await onUpdate(task.id, updates);
    }
    onClose();
  };

  const drawerInp: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--bg)',
    border: '1px solid var(--line)',
    borderRadius: 5,
    padding: '7px 9px',
    fontSize: 13,
    color: 'var(--ink)',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.38)',
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'ap-fade 150ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540,
          height: '100%',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <span style={labelStyle}>Task detail</span>
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
              <Icons.x size={16} />
            </button>
          </div>
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
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
            }}
          />
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px 90px' }}>
          <FieldRow>
            <FieldCell label="Group">
              <select
                value={draft.groupId ?? ''}
                onChange={(e) =>
                  set({ groupId: e.target.value === '' ? null : Number(e.target.value) })
                }
                style={drawerInp}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </FieldCell>
            <FieldCell label="Priority">
              <select
                value={draft.priority}
                onChange={(e) => set({ priority: Number(e.target.value) })}
                style={drawerInp}
              >
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    P{p} — {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </FieldCell>
            <FieldCell label="Estimate (min)">
              <input
                type="number"
                min={0}
                step={5}
                value={draft.estimatedMinutes ?? ''}
                onChange={(e) =>
                  set({
                    estimatedMinutes:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                style={drawerInp}
              />
            </FieldCell>
            <FieldCell label="Deadline">
              <input
                type="date"
                value={dateInputFromEpoch(draft.deadline)}
                onChange={(e) => set({ deadline: epochFromDateInput(e.target.value) })}
                style={drawerInp}
              />
            </FieldCell>
            <FieldCell label="Profile">
              <select
                value={draft.enforcementProfile ?? 'work'}
                onChange={(e) => set({ enforcementProfile: e.target.value })}
                style={drawerInp}
              >
                {PROFILE_OPTIONS.filter((o) => o.v !== 'emergency').map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </FieldCell>
          </FieldRow>

          <div style={{
            marginTop: 4,
            marginBottom: 14,
            padding: 14,
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--bg-raise)',
          }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Kind</div>
            <div style={{
              display: 'flex',
              border: '1px solid var(--line)',
              borderRadius: 5,
              overflow: 'hidden',
              width: 'fit-content',
              marginBottom: 14,
            }}>
              {(
                [
                  { v: 'flexible' as const, l: 'Flexible', hint: 'planner picks slots' },
                  { v: 'fixed' as const, l: 'Fixed', hint: 'pinned to your window' },
                ]
              ).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() =>
                    set({
                      kind: opt.v,
                      fixedWindowStartMinute:
                        opt.v === 'fixed'
                          ? draft.fixedWindowStartMinute ?? 9 * 60
                          : draft.fixedWindowStartMinute,
                      fixedWindowEndMinute:
                        opt.v === 'fixed'
                          ? draft.fixedWindowEndMinute ?? 10 * 60
                          : draft.fixedWindowEndMinute,
                    })
                  }
                  style={{
                    padding: '7px 14px',
                    fontSize: 12.5,
                    background: draft.kind === opt.v ? 'var(--ink-soft)' : 'transparent',
                    color: draft.kind === opt.v ? 'var(--ink)' : 'var(--muted)',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                  }}
                >
                  <span>{opt.l}</span>
                  <span style={{
                    fontSize: 9.5,
                    color: 'var(--faint)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>

            {draft.kind === 'fixed' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...labelStyle, marginBottom: 6 }}>Window</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="time"
                    value={minutesToTime(draft.fixedWindowStartMinute)}
                    onChange={(e) =>
                      set({
                        fixedWindowStartMinute: timeToMinutes(e.target.value),
                      })
                    }
                    style={{ ...drawerInp, width: 120, fontFamily: 'var(--font-mono)' }}
                  />
                  <span style={{ color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>
                    –
                  </span>
                  <input
                    type="time"
                    value={minutesToTime(draft.fixedWindowEndMinute)}
                    onChange={(e) =>
                      set({
                        fixedWindowEndMinute: timeToMinutes(e.target.value),
                      })
                    }
                    style={{ ...drawerInp, width: 120, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              </div>
            )}

            <div style={{ ...labelStyle, marginBottom: 6 }}>
              {draft.kind === 'fixed' ? 'When' : 'Repeat'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(draft.kind === 'fixed'
                ? ([
                    { v: 'once' as const, l: 'Once' },
                    { v: 'weekdays' as const, l: 'Weekdays' },
                    { v: 'weekly' as const, l: 'Custom days' },
                  ])
                : ([
                    { v: 'none' as const, l: 'No repeat' },
                    { v: 'daily' as const, l: 'Daily' },
                    { v: 'weekdays' as const, l: 'Weekdays' },
                    { v: 'weekly' as const, l: 'Custom days' },
                  ])
              ).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => set({ recurrenceKind: opt.v })}
                  style={{
                    padding: '6px 11px',
                    fontSize: 12,
                    background:
                      draft.recurrenceKind === opt.v
                        ? 'var(--accent-soft)'
                        : 'transparent',
                    color:
                      draft.recurrenceKind === opt.v
                        ? 'var(--accent-ink)'
                        : 'var(--ink)',
                    border:
                      '1px solid ' +
                      (draft.recurrenceKind === opt.v
                        ? 'var(--accent)'
                        : 'var(--line)'),
                    borderRadius: 5,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {opt.l}
                </button>
              ))}
            </div>

            {draft.recurrenceKind === 'weekly' && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, idx) => {
                  const bit = 1 << idx;
                  const selected = (draft.recurrenceDaysMask & bit) !== 0;
                  return (
                    <button
                      key={label}
                      onClick={() =>
                        set({
                          recurrenceDaysMask: selected
                            ? draft.recurrenceDaysMask & ~bit
                            : draft.recurrenceDaysMask | bit,
                        })
                      }
                      style={{
                        width: 36,
                        padding: '5px 0',
                        fontSize: 11,
                        background: selected ? 'var(--accent-soft)' : 'transparent',
                        color: selected ? 'var(--accent-ink)' : 'var(--muted)',
                        border:
                          '1px solid ' + (selected ? 'var(--accent)' : 'var(--line)'),
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {draft.recurrenceKind === 'once' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>On</span>
                <input
                  type="date"
                  value={dateInputFromEpoch(draft.recurrenceAnchorDate)}
                  onChange={(e) =>
                    set({
                      recurrenceAnchorDate: epochFromDateInput(e.target.value),
                    })
                  }
                  style={{ ...drawerInp, width: 160 }}
                />
              </div>
            )}
          </div>

          <div style={{
            marginTop: 14,
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: 14,
          }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Planner knobs</div>
            <FieldRow>
              <FieldCell label="Max chunk (min)">
                <input
                  type="number"
                  min={0}
                  value={draft.maxChunkMinutes ?? ''}
                  onChange={(e) =>
                    set({
                      maxChunkMinutes:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={drawerInp}
                />
              </FieldCell>
              <FieldCell label="Min chunk (min)">
                <input
                  type="number"
                  min={0}
                  value={draft.minChunkMinutes ?? ''}
                  onChange={(e) =>
                    set({
                      minChunkMinutes:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={drawerInp}
                />
              </FieldCell>
              <FieldCell label="Min rest (min)">
                <input
                  type="number"
                  min={0}
                  value={draft.minimumRestMinutes ?? ''}
                  onChange={(e) =>
                    set({
                      minimumRestMinutes:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={drawerInp}
                />
              </FieldCell>
              <FieldCell label="Work ratio">
                <input
                  type="number"
                  min={0}
                  value={draft.workRatio ?? ''}
                  onChange={(e) =>
                    set({
                      workRatio: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={drawerInp}
                />
              </FieldCell>
              <FieldCell label="Rest ratio">
                <input
                  type="number"
                  min={0}
                  value={draft.restRatio ?? ''}
                  onChange={(e) =>
                    set({
                      restRatio: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={drawerInp}
                />
              </FieldCell>
              <FieldCell label="Protect blocks" hint="Planner can't reflow these once placed">
                <label style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={draft.protectGeneratedBlocks}
                    onChange={(e) => set({ protectGeneratedBlocks: e.target.checked })}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  Lock blocks
                </label>
              </FieldCell>
            </FieldRow>
          </div>

          <div style={{ marginTop: 22 }}>
            <div style={{ ...labelStyle, marginBottom: 6 }}>History</div>
            <div style={{
              fontSize: 12,
              color: 'var(--muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              fontFamily: 'var(--font-mono)',
            }}>
              <span>
                Created{' '}
                <span style={{ color: 'var(--ink)' }}>
                  {new Date(task.createdAt).toLocaleString()}
                </span>
              </span>
              <span>
                Updated{' '}
                <span style={{ color: 'var(--ink)' }}>
                  {new Date(task.updatedAt).toLocaleString()}
                </span>
              </span>
              <span>
                Completed{' '}
                <span style={{ color: 'var(--ink)' }}>{task.completionCount}</span>{' '}
                times · avg priority{' '}
                <span style={{ color: 'var(--ink)' }}>
                  {task.averagePriority.toFixed(1)}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: 'var(--bg)',
        }}>
          <button
            onClick={() => {
              if (confirm(`Delete "${task.name}"?`)) onDelete(task.id);
            }}
            style={{
              padding: '6px 12px',
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
          {planned ? (
            <button
              onClick={onRemoveFromPlan}
              style={{
                padding: '6px 12px',
                background: 'var(--bg-raise)',
                border: '1px solid var(--line)',
                borderRadius: 5,
                color: 'var(--ink)',
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              Remove from plan…
            </button>
          ) : (
            <button
              onClick={onAddToPlan}
              style={{
                padding: '6px 12px',
                background: 'var(--bg-raise)',
                border: '1px solid var(--line)',
                borderRadius: 5,
                color: 'var(--ink)',
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              Add to plan…
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
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
            onClick={save}
            style={{
              padding: '6px 14px',
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
      </div>
    </div>
  );
}

function FieldRow({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 12,
    }}>
      {children}
    </div>
  );
}

function FieldCell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      {children}
      {hint && (
        <div style={{
          fontSize: 11,
          color: 'var(--faint)',
          marginTop: 4,
          fontFamily: 'var(--font-mono)',
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

type TasksTab = 'active' | 'library';

function startOfDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function ActiveBlockRow({ block }: { block: TimeBlock }) {
  const day = new Date(block.startTime).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const mins = Math.round((block.endTime - block.startTime) / 60_000);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 130px 70px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 12,
        padding: '6px 10px',
        background: 'var(--bg)',
        borderRadius: 5,
        border: '1px solid var(--line)',
        fontSize: 12,
        color: 'var(--muted)',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{day}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        color: 'var(--ink)',
      }}>
        {formatHHMM(block.startTime)} – {formatHHMM(block.endTime)}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--faint)',
      }}>
        {formatDuration(mins)}
      </span>
      <span style={{
        fontSize: 11.5,
        color: 'var(--muted)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {block.title}
      </span>
    </div>
  );
}

// Pressure: how much remaining work this task needs vs. days left to deadline.
// Rough capacity = 8 hours / day (mirrors the design's tasksPressure).
function tasksPressure(task: Task, blocks: TimeBlock[]): number {
  if (task.deadline == null) return 0.05;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(task.deadline);
  target.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
  const days = Math.max(0.25, dayDiff + 1);
  const capMin = days * 8 * 60;
  // remaining = estimatedMinutes minus consumed time on planned blocks
  const consumedMs = blocks.reduce((acc, b) => {
    if (b.status === 'completed') return acc + (b.endTime - b.startTime);
    if (b.status === 'active' || b.status === 'paused') {
      return acc + Math.max(0, Math.min(Date.now(), b.endTime) - b.startTime);
    }
    return acc;
  }, 0);
  const remaining = Math.max(
    0,
    (task.estimatedMinutes ?? 0) - Math.round(consumedMs / 60_000),
  );
  return Math.min(1.4, remaining / capMin);
}

function pressureLabel(p: number): string {
  if (p < 0.15) return 'low';
  if (p < 0.45) return 'med';
  if (p < 0.85) return 'high';
  if (p < 1.0) return 'crit';
  return 'over';
}

function pressureColor(p: number): string {
  if (p < 0.15) return 'oklch(0.70 0.07 150)';
  if (p < 0.45) return 'oklch(0.72 0.06 90)';
  if (p < 0.85) return 'oklch(0.72 0.10 75)';
  if (p < 1.0) return 'oklch(0.65 0.16 35)';
  return 'var(--danger)';
}

function PressureBar({ value }: { value: number }) {
  const v = Math.min(1.05, Math.max(0.02, value));
  const color = pressureColor(value);
  return (
    <span style={{
      width: 56,
      height: 4,
      borderRadius: 2,
      background: 'color-mix(in oklch, var(--ink) 8%, transparent)',
      display: 'inline-block',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <span style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: Math.min(1, v) * 100 + '%',
        background: color,
        borderRadius: 2,
      }} />
      {value > 1 && (
        <span style={{
          position: 'absolute',
          right: -2,
          top: -2,
          bottom: -2,
          width: 4,
          background: 'var(--danger)',
          borderRadius: 1,
        }} />
      )}
    </span>
  );
}

const ACTIVE_COLS =
  '20px minmax(200px, 1fr) 110px 120px 140px 78px 28px 28px';

function ActiveRowMenu({
  hover,
  onRemoveFromPlan,
}: {
  hover: boolean;
  onRemoveFromPlan: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-row-menu]')) setOpen(false);
    };
    setTimeout(() => document.addEventListener('click', h), 0);
    return () => document.removeEventListener('click', h);
  }, [open]);
  return (
    <div
      data-row-menu
      style={{ position: 'relative', justifySelf: 'end' }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--faint)',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
          opacity: hover || open ? 1 : 0.4,
          fontFamily: 'var(--font-mono)',
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 4px)',
          zIndex: 30,
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          padding: 4,
          minWidth: 180,
          boxShadow: '0 12px 24px rgba(0,0,0,0.35)',
        }}>
          <div
            onClick={() => {
              onRemoveFromPlan();
              setOpen(false);
            }}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
              borderRadius: 4,
              color: 'var(--danger)',
            }}
          >
            Remove from plan…
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveTaskCard({
  task,
  group,
  blocks,
  onOpen,
  onRemoveFromPlan,
}: {
  task: Task;
  group: TaskGroup | undefined;
  blocks: TimeBlock[];
  onOpen: () => void;
  onRemoveFromPlan: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pressure = tasksPressure(task, blocks);
  const overdue = task.deadline != null && task.deadline < Date.now();
  const totalPlannedMin = blocks.reduce(
    (acc, b) => acc + Math.round((b.endTime - b.startTime) / 60_000),
    0,
  );
  const consumedMs = blocks.reduce((acc, b) => {
    if (b.status === 'completed') return acc + (b.endTime - b.startTime);
    if (b.status === 'active' || b.status === 'paused') {
      return acc + Math.max(0, Math.min(Date.now(), b.endTime) - b.startTime);
    }
    return acc;
  }, 0);
  const remainingMin = Math.max(
    0,
    (task.estimatedMinutes ?? 0) - Math.round(consumedMs / 60_000),
  );

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover || expanded ? 'var(--bg-raise)' : 'transparent',
        borderBottom: '1px solid var(--line)',
        transition: 'background 80ms',
      }}
    >
      <div
        onClick={onOpen}
        style={{
          display: 'grid',
          gridTemplateColumns: ACTIVE_COLS,
          alignItems: 'center',
          gap: 14,
          padding: '12px 14px',
          cursor: 'pointer',
        }}
      >
        <span style={{
          width: 3,
          height: 28,
          borderRadius: 2,
          background: overdue ? 'var(--danger)' : pressureColor(pressure),
          justifySelf: 'start',
        }} />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            title={task.name}
            style={{
              color: 'var(--ink)',
              fontSize: 13.5,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {task.name}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            overflow: 'hidden',
            minWidth: 0,
          }}>
            <GroupChip group={group} />
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: overdue ? 'var(--danger)' : 'var(--muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {formatDeadline(task.deadline, Date.now())}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
        }}>
          {formatDuration(remainingMin)}
          <span style={{
            color: 'var(--faint)',
            fontSize: 10.5,
            marginLeft: 4,
          }}>
            / {formatDuration(task.estimatedMinutes)}
          </span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        }}>
          <PressureBar value={pressure} />
          <span style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {pressureLabel(pressure)}
          </span>
        </div>
        <PriorityChip p={task.priority} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          title={expanded ? 'Hide blocks' : 'Show blocks'}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: 4,
            justifySelf: 'center',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 140ms',
          }}
        >
          <Icons.chevronD size={13} />
        </button>
        <ActiveRowMenu hover={hover} onRemoveFromPlan={onRemoveFromPlan} />
      </div>
      {expanded && (
        <div style={{
          padding: '0 14px 14px 56px',
          borderTop: '1px solid var(--line)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '10px 0 6px',
          }}>
            <span style={labelStyle}>Planner blocks</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--muted)',
            }}>
              {blocks.length} blocks · {formatDuration(totalPlannedMin)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {blocks.map((b) => (
              <ActiveBlockRow key={b.id} block={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ACTIVE_HORIZON_DAYS = 14;

export function TasksScreen() {
  const [tab, setTab] = useState<TasksTab>('active');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [scheduledBlocks, setScheduledBlocks] = useState<TimeBlock[]>([]);
  const [query, setQuery] = useState('');
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [groupFilter, setGroupFilter] = useState<Set<string>>(new Set());
  const [groupManagerFocus, setGroupManagerFocus] = useState<
    number | 'new' | undefined | null
  >(null);
  const [planModalTaskId, setPlanModalTaskId] = useState<number | null>(null);
  const [removeModalTaskId, setRemoveModalTaskId] = useState<number | null>(null);
  const [activeSort, setActiveSort] = useState<
    'pressure' | 'deadline' | 'priority' | 'next-block'
  >('pressure');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const horizonStart = startOfDay(Date.now());
      const horizonEnd = horizonStart + ACTIVE_HORIZON_DAYS * 86_400_000;
      const [t, g, blocks] = await Promise.all([
        api.getTasks(),
        api.getTaskGroups(),
        api.getScheduleRange(horizonStart, horizonEnd),
      ]);
      setTasks(t);
      setGroups(g);
      setScheduledBlocks(blocks);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const groupById = useMemo(() => {
    const map = new Map<number, TaskGroup>();
    groups.forEach((g) => map.set(g.id, g));
    return map;
  }, [groups]);

  const blocksByTaskId = useMemo(() => {
    const map = new Map<number, TimeBlock[]>();
    for (const b of scheduledBlocks) {
      if (b.taskId == null) continue;
      if (b.status !== 'scheduled' && b.status !== 'active' && b.status !== 'paused') {
        continue;
      }
      const list = map.get(b.taskId) ?? [];
      list.push(b);
      map.set(b.taskId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime - b.startTime);
    }
    return map;
  }, [scheduledBlocks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = tasks;
    if (groupFilter.size > 0) {
      out = out.filter((t) => {
        const key = t.groupId == null ? '__none__' : String(t.groupId);
        return groupFilter.has(key);
      });
    }
    if (q) {
      const ops: Record<string, string> = {};
      const text: string[] = [];
      for (const token of q.split(/\s+/)) {
        const m = token.match(/^(\w+):(.+)$/);
        if (m) ops[m[1]] = m[2];
        else text.push(token);
      }
      out = out.filter((t) => {
        if (ops.group) {
          const g = t.groupId ? groupById.get(t.groupId) : undefined;
          if (!g || g.name.toLowerCase() !== ops.group) return false;
        }
        if (ops.planned != null) {
          const want = ops.planned === 'true' || ops.planned === '1';
          const planned = (blocksByTaskId.get(t.id) ?? []).length > 0;
          if (planned !== want) return false;
        }
        if (ops.p) {
          const m2 = ops.p.match(/^(>=|<=|>|<|=)?(\d)$/);
          if (m2) {
            const op = m2[1] || '=';
            const n = Number(m2[2]);
            const ok =
              op === '='
                ? t.priority === n
                : op === '>'
                  ? t.priority > n
                  : op === '<'
                    ? t.priority < n
                    : op === '>='
                      ? t.priority >= n
                      : op === '<='
                        ? t.priority <= n
                        : true;
            if (!ok) return false;
          }
        }
        if (ops.deadline === 'none' && t.deadline) return false;
        if (
          ops.deadline === 'overdue' &&
          !(t.deadline && t.deadline < Date.now())
        ) {
          return false;
        }
        if (text.length) {
          const groupName = t.groupId
            ? groupById.get(t.groupId)?.name ?? ''
            : '';
          const hay = (t.name + ' ' + groupName).toLowerCase();
          if (!text.every((w) => hay.includes(w))) return false;
        }
        return true;
      });
    }
    return out;
  }, [tasks, query, groupFilter, groupById, blocksByTaskId]);

  const create = async (task: NewTask) => {
    try {
      await api.createTask(task);
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const update = async (id: number, updates: TaskUpdate) => {
    try {
      await api.updateTask(id, updates);
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const remove = async (id: number) => {
    try {
      await api.deleteTask(id);
      setOpenTaskId(null);
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const toggleGroupFilter = (id: string) => {
    setGroupFilter((prev) => {
      const next = new Set(prev);
      if (id === '__all__') {
        next.clear();
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulk = async (action: BulkAction) => {
    const ids = Array.from(selectedRows);
    if (ids.length === 0) return;
    try {
      if (action.kind === 'delete') {
        if (!confirm(`Delete ${ids.length} task${ids.length === 1 ? '' : 's'}?`))
          return;
        for (const id of ids) {
          await api.deleteTask(id);
        }
      } else if (action.kind === 'group') {
        for (const id of ids) {
          await api.updateTask(id, { groupId: action.groupId });
        }
      } else if (action.kind === 'priority') {
        for (const id of ids) {
          await api.updateTask(id, { priority: action.priority });
        }
      }
      setSelectedRows(new Set());
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  const activeTasks = useMemo(() => {
    const planned = tasks.filter(
      (t) => (blocksByTaskId.get(t.id) ?? []).length > 0,
    );
    if (activeSort === 'pressure') {
      planned.sort(
        (a, b) =>
          tasksPressure(b, blocksByTaskId.get(b.id) ?? []) -
          tasksPressure(a, blocksByTaskId.get(a.id) ?? []),
      );
    } else if (activeSort === 'deadline') {
      planned.sort((a, b) => {
        const ad = a.deadline ?? Number.POSITIVE_INFINITY;
        const bd = b.deadline ?? Number.POSITIVE_INFINITY;
        return ad - bd;
      });
    } else if (activeSort === 'priority') {
      planned.sort((a, b) => b.priority - a.priority);
    } else if (activeSort === 'next-block') {
      const nextOf = (t: Task) => {
        const list = blocksByTaskId.get(t.id) ?? [];
        if (list.length === 0) return Number.POSITIVE_INFINITY;
        return list
          .slice()
          .sort((x, y) => x.startTime - y.startTime)[0].startTime;
      };
      planned.sort((a, b) => nextOf(a) - nextOf(b));
    }
    return planned;
  }, [tasks, blocksByTaskId, activeSort]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        padding: '14px 24px 0',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          minWidth: 0,
        }}>
          {(['active', 'library'] as TasksTab[]).map((id) => {
            const sel = tab === id;
            const count = id === 'active' ? activeTasks.length : tasks.length;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: '8px 4px',
                  marginRight: 18,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: sel
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
                  color: sel ? 'var(--ink)' : 'var(--muted)',
                  fontSize: 13,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: sel ? 500 : 400,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!sel) e.currentTarget.style.color = 'var(--ink)';
                }}
                onMouseLeave={(e) => {
                  if (!sel) e.currentTarget.style.color = 'var(--muted)';
                }}
              >
                {id === 'active' ? 'Active' : 'Library'}
                <span style={{
                  marginLeft: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--faint)',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
          {tab === 'library' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 11px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: 'var(--bg-raise)',
              minWidth: 0,
              maxWidth: 480,
              flex: '1 1 160px',
              marginLeft: 'auto',
            }}>
              <span style={{ color: 'var(--faint)', flexShrink: 0 }}>
                <Icons.search size={13} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                style={{
                  flex: 1,
                  minWidth: 0,
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--ink)',
                  fontSize: 12.5,
                  fontFamily: 'var(--font-mono)',
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--faint)',
                    cursor: 'pointer',
                    padding: 2,
                  }}
                >
                  <Icons.x size={12} />
                </button>
              )}
            </div>
          )}
          <div style={{
            fontSize: 11.5,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            marginLeft: tab === 'library' ? 0 : 'auto',
          }}>
            {tab === 'library'
              ? `${filtered.length} of ${tasks.length}`
              : `${ACTIVE_HORIZON_DAYS}d horizon`}
          </div>
        </div>
        <div style={{ height: 8 }} />
      </div>

      {tab === 'library' && <QuickAdd groups={groups} onAdd={create} />}

      {tab === 'active' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px 40px' }}>
          {activeTasks.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
            }}>
              <div style={{
                maxWidth: 440,
                textAlign: 'center',
                padding: '40px 30px',
                border: '1px dashed var(--line)',
                borderRadius: 12,
                background: 'var(--bg-raise)',
              }}>
                <div style={{ ...labelStyle, marginBottom: 10 }}>
                  Nothing on the plan
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  color: 'var(--ink)',
                  letterSpacing: '-0.015em',
                  marginBottom: 6,
                }}>
                  The planner has no scheduled tasks
                </div>
                <div style={{
                  fontSize: 13,
                  color: 'var(--muted)',
                  lineHeight: 1.5,
                }}>
                  Add a task in the Library tab, then run Rebuild on the Schedule
                  screen to put it on the plan.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                paddingBottom: 10,
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: 'var(--ink)',
                  fontWeight: 500,
                }}>
                  Scheduled
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--faint)',
                }}>
                  {activeTasks.length}{' '}
                  {activeTasks.length === 1 ? 'task' : 'tasks'}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{
                  fontSize: 11,
                  color: 'var(--faint)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  Sort
                </span>
                <select
                  value={activeSort}
                  onChange={(e) =>
                    setActiveSort(
                      e.target.value as
                        | 'pressure'
                        | 'deadline'
                        | 'priority'
                        | 'next-block',
                    )
                  }
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    color: 'var(--ink)',
                    fontSize: 12.5,
                    padding: '6px 10px',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                  }}
                >
                  <option value="pressure">Pressure</option>
                  <option value="deadline">Deadline</option>
                  <option value="priority">Priority</option>
                  <option value="next-block">Next block</option>
                </select>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: ACTIVE_COLS,
                alignItems: 'center',
                gap: 14,
                padding: '8px 14px',
                borderTop: '1px solid var(--line)',
                borderBottom: '1px solid var(--line)',
              }}>
                <span />
                <span style={labelStyle}>Task</span>
                <span style={labelStyle}>Deadline</span>
                <span style={labelStyle}>Remaining</span>
                <span style={labelStyle}>Pressure</span>
                <span style={labelStyle}>Priority</span>
                <span />
                <span />
              </div>
            </>
          )}
          {activeTasks.map((t) => (
            <ActiveTaskCard
              key={t.id}
              task={t}
              group={t.groupId ? groupById.get(t.groupId) : undefined}
              blocks={blocksByTaskId.get(t.id) ?? []}
              onOpen={() => setOpenTaskId(t.id)}
              onRemoveFromPlan={() => setRemoveModalTaskId(t.id)}
            />
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
          <TasksGroupRail
            groups={groups}
            tasks={tasks}
            selected={groupFilter}
            onToggle={toggleGroupFilter}
            onManageGroups={(focus) => setGroupManagerFocus(focus ?? 'new')}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selectedRows.size > 0 && (
            <div style={{
              padding: '10px 24px',
              borderBottom: '1px solid var(--line)',
              background: 'var(--bg)',
            }}>
              <TasksBulkBar
                count={selectedRows.size}
                onClear={() => setSelectedRows(new Set())}
                onAction={handleBulk}
                groups={groups}
              />
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontSize: 13,
          }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                background: 'var(--bg)',
              }}>
                <th style={{ ...th, width: 36, padding: '8px 4px 8px 14px' }}>
                  <input
                    type="checkbox"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((t) => selectedRows.has(t.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRows(new Set(filtered.map((t) => t.id)));
                      } else {
                        setSelectedRows(new Set());
                      }
                    }}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                </th>
                <th style={th}>Name</th>
                <th style={{ ...th, width: 130 }}>Group</th>
                <th style={{ ...th, width: 100 }}>Priority</th>
                <th style={{ ...th, width: 110 }}>Estimate</th>
                <th style={{ ...th, width: 130 }}>Deadline</th>
                <th style={{ ...th, width: 110 }}>Status</th>
                <th style={{ ...th, width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const overdue = t.deadline != null && t.deadline < Date.now();
                const planned = (blocksByTaskId.get(t.id) ?? []).length > 0;
                const sel = selectedRows.has(t.id);
                return (
                  <tr
                    key={t.id}
                    onClick={() => setOpenTaskId(t.id)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--line)',
                      background: sel
                        ? 'color-mix(in oklch, var(--accent) 8%, transparent)'
                        : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!sel)
                        e.currentTarget.style.background = 'var(--bg-raise)';
                    }}
                    onMouseLeave={(e) => {
                      if (!sel) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td
                      style={{ padding: '6px 4px 6px 14px', verticalAlign: 'middle' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => {
                          setSelectedRows((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.id)) next.delete(t.id);
                            else next.add(t.id);
                            return next;
                          });
                        }}
                        style={{
                          accentColor: 'var(--accent)',
                          cursor: 'pointer',
                        }}
                      />
                    </td>
                    <td style={td}>
                      <div style={{
                        color: 'var(--ink)',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 380,
                      }}>
                        {t.name}
                      </div>
                    </td>
                    <td style={td}>
                      <GroupChip group={t.groupId ? groupById.get(t.groupId) : undefined} />
                    </td>
                    <td style={td}>
                      <PriorityChip p={t.priority} />
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {formatDuration(t.estimatedMinutes)}
                    </td>
                    <td style={{
                      ...td,
                      color: overdue ? 'var(--danger)' : 'var(--muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                    }}>
                      {formatDeadline(t.deadline, Date.now())}
                    </td>
                    <td style={td}>
                      {planned ? (
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: 'var(--accent-ink)',
                          background: 'var(--accent-soft)',
                          padding: '2px 6px',
                          borderRadius: 3,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}>
                          Planned
                        </span>
                      ) : (
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10,
                          color: 'var(--muted)',
                          border: '1px solid var(--line)',
                          padding: '2px 6px',
                          borderRadius: 3,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}>
                          Library
                        </span>
                      )}
                    </td>
                    <td
                      style={{ padding: '6px 8px 6px 4px', verticalAlign: 'middle' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${t.name}"?`)) remove(t.id);
                        }}
                        title="Delete"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--faint)',
                          cursor: 'pointer',
                          padding: 4,
                          borderRadius: 4,
                          display: 'flex',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--danger)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--faint)';
                        }}
                      >
                        <Icons.trash size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 13,
            }}>
              {query
                ? `No matches for "${query}".`
                : 'No tasks yet — use Quick add above.'}
            </div>
          )}
          </div>
          </div>
        </div>
      )}

      {openTask && (
        <Drawer
          task={openTask}
          groups={groups}
          onClose={() => setOpenTaskId(null)}
          onUpdate={update}
          onDelete={remove}
          planned={(blocksByTaskId.get(openTask.id) ?? []).length > 0}
          onAddToPlan={() => setPlanModalTaskId(openTask.id)}
          onRemoveFromPlan={() => setRemoveModalTaskId(openTask.id)}
        />
      )}

      {groupManagerFocus !== null && (
        <TasksGroupManager
          initialFocus={groupManagerFocus ?? undefined}
          groups={groups}
          tasks={tasks}
          onClose={() => setGroupManagerFocus(null)}
          onRefresh={refresh}
        />
      )}

      {planModalTaskId != null && (
        <PlanModal
          task={tasks.find((t) => t.id === planModalTaskId)!}
          groups={groups}
          onClose={() => setPlanModalTaskId(null)}
          onError={(msg) => setError(msg)}
          onAfterPlan={refresh}
        />
      )}

      {removeModalTaskId != null && (
        <RemoveFromPlanModal
          task={tasks.find((t) => t.id === removeModalTaskId)!}
          onClose={() => setRemoveModalTaskId(null)}
          onError={(msg) => setError(msg)}
          onAfterRemove={refresh}
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

const th: CSSProperties = {
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--faint)',
  padding: '8px 12px',
  borderBottom: '1px solid var(--line)',
};

const td: CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
