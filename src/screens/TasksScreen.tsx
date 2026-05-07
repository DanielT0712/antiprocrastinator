import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../api';
import type { NewTask, Task, TaskGroup, TaskUpdate } from '../api/types';
import { Icons } from '../components/Icons';
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
}

function Drawer({ task, groups, onClose, onUpdate, onDelete }: DrawerProps) {
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

export function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [query, setQuery] = useState('');
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [t, g] = await Promise.all([api.getTasks(), api.getTaskGroups()]);
      setTasks(t);
      setGroups(g);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => {
      if (t.name.toLowerCase().includes(q)) return true;
      const group = t.groupId ? groupById.get(t.groupId) : undefined;
      if (group?.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [tasks, query, groupById]);

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

  const openTask = openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        padding: '14px 24px 12px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 11px',
          border: '1px solid var(--line)',
          borderRadius: 6,
          background: 'var(--bg-raise)',
          minWidth: 320,
          flex: '1 0 320px',
          maxWidth: 540,
        }}>
          <span style={{ color: 'var(--faint)' }}>
            <Icons.search size={13} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            style={{
              flex: 1,
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
        <div style={{
          fontSize: 11.5,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono)',
          marginLeft: 'auto',
        }}>
          {filtered.length} of {tasks.length} tasks
        </div>
      </div>

      <QuickAdd groups={groups} onAdd={create} />

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
              <th style={th}>Name</th>
              <th style={{ ...th, width: 130 }}>Group</th>
              <th style={{ ...th, width: 100 }}>Priority</th>
              <th style={{ ...th, width: 110 }}>Estimate</th>
              <th style={{ ...th, width: 130 }}>Deadline</th>
              <th style={{ ...th, width: 110 }}>Profile</th>
              <th style={{ ...th, width: 90 }}>Done×</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const overdue = t.deadline != null && t.deadline < Date.now();
              return (
                <tr
                  key={t.id}
                  onClick={() => setOpenTaskId(t.id)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--line)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-raise)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
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
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)' }}>
                    {PROFILE_OPTIONS.find((p) => p.v === t.enforcementProfile)?.l ??
                      t.enforcementProfile ??
                      '—'}
                  </td>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--muted)' }}>
                    {t.completionCount}
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
            {query ? `No matches for "${query}".` : 'No tasks yet — use Quick add above.'}
          </div>
        )}
      </div>

      {openTask && (
        <Drawer
          task={openTask}
          groups={groups}
          onClose={() => setOpenTaskId(null)}
          onUpdate={update}
          onDelete={remove}
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
