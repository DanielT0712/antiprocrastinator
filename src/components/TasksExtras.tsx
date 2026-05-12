import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../api';
import type { Task, TaskGroup, TaskUpdate } from '../api/types';
import { Icons } from '../components/Icons';
import { priorityLabel } from '../lib/format';

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
  padding: '7px 9px',
  fontSize: 13,
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
};

export const GROUP_COLORS = [
  'oklch(0.68 0.08 45)',
  'oklch(0.72 0.10 75)',
  'oklch(0.70 0.07 150)',
  'oklch(0.68 0.07 200)',
  'oklch(0.70 0.07 260)',
  'oklch(0.72 0.05 320)',
  'oklch(0.72 0.04 90)',
  'oklch(0.65 0.06 25)',
];

interface GroupRailProps {
  groups: TaskGroup[];
  tasks: Task[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onManageGroups: (focus?: number | 'new') => void;
  // When true, render as a horizontal scrolling tab strip above the
  // task list instead of a 200px wide aside.
  horizontal?: boolean;
}

export function TasksGroupRail({
  groups,
  tasks,
  selected,
  onToggle,
  onManageGroups,
  horizontal = false,
}: GroupRailProps) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { __all__: tasks.length, __none__: 0 };
    groups.forEach((g) => (c[String(g.id)] = 0));
    tasks.forEach((t) => {
      if (!t.groupId) c.__none__ += 1;
      else if (c[String(t.groupId)] != null) c[String(t.groupId)] += 1;
    });
    return c;
  }, [tasks, groups]);

  const Row = ({
    id,
    label,
    color,
    count,
    dashed,
    onEdit,
  }: {
    id: string;
    label: string;
    color?: string | null;
    count: number;
    dashed?: boolean;
    onEdit?: () => void;
  }) => {
    const active = selected.has(id);
    return (
      <div
        onClick={() => onToggle(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 6,
          background: active ? 'var(--ink-soft)' : 'transparent',
          color: active ? 'var(--ink)' : 'var(--muted)',
          cursor: 'pointer',
          fontSize: 12.5,
        }}
        onMouseEnter={(e) => {
          if (!active) e.currentTarget.style.color = 'var(--ink)';
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.color = 'var(--muted)';
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          flexShrink: 0,
          background: color ?? 'transparent',
          border: dashed
            ? '1px dashed var(--line)'
            : color
              ? 'none'
              : '1px solid var(--line)',
        }} />
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--faint)',
        }}>
          {count}
        </span>
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit group"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--ink)';
              e.currentTarget.style.background = 'var(--bg-raise)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  if (horizontal) {
    return (
      <div style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--line)',
        padding: '8px 16px',
        background: 'var(--bg-rail)',
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        alignItems: 'center',
      }}>
        <span style={{ ...labelStyle, flexShrink: 0, marginRight: 4 }}>
          Groups
        </span>
        <HRow id="__all__" label="All" color="var(--muted)" count={counts.__all__} selected={selected} onToggle={onToggle} />
        <HRow id="__none__" label="No group" dashed count={counts.__none__} selected={selected} onToggle={onToggle} />
        {groups.map((g) => (
          <HRow
            key={g.id}
            id={String(g.id)}
            label={g.name}
            color={g.color}
            count={counts[String(g.id)] ?? 0}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
        <button
          onClick={() => onManageGroups('new')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 9px',
            borderRadius: 6,
            background: 'transparent',
            border: '1px dashed var(--line)',
            color: 'var(--muted)',
            fontSize: 11.5,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <Icons.plus size={10} /> New
        </button>
      </div>
    );
  }

  return (
    <aside style={{
      width: 200,
      flexShrink: 0,
      borderRight: '1px solid var(--line)',
      padding: '14px 10px',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    }}>
      <div style={{ ...labelStyle, padding: '4px 10px 8px' }}>Groups</div>
      <Row id="__all__" label="All tasks" color="var(--muted)" count={counts.__all__} />
      <Row id="__none__" label="No group" dashed count={counts.__none__} />
      <div style={{ height: 8 }} />
      {groups.map((g) => (
        <Row
          key={g.id}
          id={String(g.id)}
          label={g.name}
          color={g.color}
          count={counts[String(g.id)] ?? 0}
          onEdit={() => onManageGroups(g.id)}
        />
      ))}
      <button
        onClick={() => onManageGroups('new')}
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'transparent',
          border: '1px dashed var(--line)',
          color: 'var(--muted)',
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <Icons.plus size={11} /> New group
      </button>
    </aside>
  );
}

function HRow({
  id,
  label,
  color,
  count,
  dashed,
  selected,
  onToggle,
}: {
  id: string;
  label: string;
  color?: string | null;
  count: number;
  dashed?: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const active = selected.has(id);
  return (
    <button
      onClick={() => onToggle(id)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 6,
        background: active ? 'var(--ink-soft)' : 'transparent',
        color: active ? 'var(--ink)' : 'var(--muted)',
        border: '1px solid ' + (active ? 'var(--line)' : 'transparent'),
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'var(--font-sans)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: 7,
        height: 7,
        borderRadius: 2,
        flexShrink: 0,
        background: color ?? 'transparent',
        border: dashed
          ? '1px dashed var(--line)'
          : color
            ? 'none'
            : '1px solid var(--line)',
      }} />
      <span>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--faint)',
      }}>
        {count}
      </span>
    </button>
  );
}

export type BulkAction =
  | { kind: 'group'; groupId: number | null }
  | { kind: 'priority'; priority: number }
  | { kind: 'delete' };

interface BulkBarProps {
  count: number;
  onClear: () => void;
  onAction: (action: BulkAction) => void;
  groups: TaskGroup[];
}

export function TasksBulkBar({ count, onClear, onAction, groups }: BulkBarProps) {
  const [openMenu, setOpenMenu] = useState<'group' | 'priority' | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-bulk-menu]')) setOpenMenu(null);
    };
    setTimeout(() => document.addEventListener('click', h), 0);
    return () => document.removeEventListener('click', h);
  }, [openMenu]);

  const Btn = ({
    children,
    onClick,
    danger,
    menu,
  }: {
    children: ReactNode;
    onClick: () => void;
    danger?: boolean;
    menu?: boolean;
  }) => (
    <button
      onClick={onClick}
      data-bulk-menu={menu ? '1' : undefined}
      style={{
        padding: '6px 10px',
        background: 'transparent',
        border: '1px solid var(--line)',
        borderRadius: 5,
        color: danger ? 'var(--danger)' : 'var(--ink)',
        fontSize: 12,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
    >
      {children}
    </button>
  );

  const menuStyle: CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    zIndex: 30,
    background: 'var(--bg-raise)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: 4,
    minWidth: 160,
    boxShadow: '0 12px 24px rgba(0,0,0,0.35)',
  };

  const menuItemStyle: CSSProperties = {
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--ink)',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      padding: '6px 10px',
      borderRadius: 6,
      background: 'color-mix(in oklch, var(--accent) 12%, var(--bg-raise))',
      border: '1px solid color-mix(in oklch, var(--accent) 40%, var(--line))',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        color: 'var(--accent-ink)',
      }}>
        {count} selected
      </span>
      <span style={{ width: 1, height: 16, background: 'var(--line)' }} />

      <div data-bulk-menu="1" style={{ position: 'relative' }}>
        <Btn menu onClick={() => setOpenMenu(openMenu === 'group' ? null : 'group')}>
          Set group <Icons.chevronD size={11} />
        </Btn>
        {openMenu === 'group' && (
          <div style={menuStyle}>
            <div
              onClick={() => {
                onAction({ kind: 'group', groupId: null });
                setOpenMenu(null);
              }}
              style={menuItemStyle}
            >
              <span style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                border: '1px dashed var(--line)',
              }} />
              No group
            </div>
            {groups.map((g) => (
              <div
                key={g.id}
                onClick={() => {
                  onAction({ kind: 'group', groupId: g.id });
                  setOpenMenu(null);
                }}
                style={menuItemStyle}
              >
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: g.color ?? 'var(--muted)',
                }} />
                {g.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div data-bulk-menu="1" style={{ position: 'relative' }}>
        <Btn menu onClick={() => setOpenMenu(openMenu === 'priority' ? null : 'priority')}>
          Set priority <Icons.chevronD size={11} />
        </Btn>
        {openMenu === 'priority' && (
          <div style={menuStyle}>
            {[1, 2, 3, 4, 5].map((p) => (
              <div
                key={p}
                onClick={() => {
                  onAction({ kind: 'priority', priority: p });
                  setOpenMenu(null);
                }}
                style={menuItemStyle}
              >
                P{p} {priorityLabel(p)}
              </div>
            ))}
          </div>
        )}
      </div>

      <Btn onClick={() => onAction({ kind: 'delete' })} danger>
        <Icons.trash size={11} /> Delete
      </Btn>
      <span style={{ flex: 1 }} />
      <button
        onClick={onClear}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          fontSize: 11.5,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
        }}
      >
        Clear
      </button>
    </div>
  );
}

interface GroupManagerProps {
  initialFocus: number | 'new' | undefined;
  groups: TaskGroup[];
  tasks: Task[];
  onClose: () => void;
  onRefresh: () => void;
}

export function TasksGroupManager({
  initialFocus,
  groups,
  tasks,
  onClose,
  onRefresh,
}: GroupManagerProps) {
  const [editId, setEditId] = useState<number | null>(
    typeof initialFocus === 'number' ? initialFocus : null,
  );
  const [creating, setCreating] = useState(initialFocus === 'new');
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(GROUP_COLORS[0]);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const counts = useMemo(() => {
    const c: Record<number, number> = {};
    groups.forEach((g) => (c[g.id] = 0));
    tasks.forEach((t) => {
      if (t.groupId != null && c[t.groupId] != null) c[t.groupId] += 1;
    });
    return c;
  }, [tasks, groups]);

  const renameGroup = async (id: number, name: string) => {
    try {
      await api.updateTaskGroup(id, name);
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };
  const recolorGroup = async (id: number, color: string) => {
    try {
      await api.updateTaskGroup(id, null, { value: color });
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };
  const createGroup = async () => {
    if (!draftName.trim()) return;
    try {
      const created = await api.createTaskGroup(draftName.trim(), draftColor);
      setDraftName('');
      setDraftColor(GROUP_COLORS[0]);
      setCreating(false);
      setEditId(created.id);
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };
  const deleteGroup = async (id: number, reassignTo: number | null) => {
    try {
      await api.deleteTaskGroup(id, reassignTo);
      setConfirmDelete(null);
      if (editId === id) setEditId(null);
      onRefresh();
    } catch (err) {
      setError(String(err));
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
          width: 540,
          maxHeight: '80vh',
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'ap-rise 180ms cubic-bezier(.2,.7,.2,1)',
        }}
      >
        <div style={{
          padding: '20px 22px 14px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                color: 'var(--ink)',
                letterSpacing: '-0.015em',
              }}>
                Manage groups
              </div>
              <div style={{
                fontSize: 12.5,
                color: 'var(--muted)',
                marginTop: 4,
              }}>
                Rename, recolor, or delete. Tasks in a deleted group can be moved elsewhere.
              </div>
            </div>
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
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
          {groups.map((g) => {
            const open = editId === g.id;
            return (
              <div
                key={g.id}
                style={{
                  border: '1px solid ' + (open ? 'var(--accent)' : 'var(--line)'),
                  background: open ? 'var(--bg)' : 'transparent',
                  borderRadius: 8,
                  marginBottom: 8,
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setEditId(open ? null : g.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: g.color ?? 'var(--muted)',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    color: 'var(--ink)',
                    fontSize: 13.5,
                    fontWeight: 500,
                    flex: 1,
                  }}>
                    {g.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--faint)',
                  }}>
                    {counts[g.id] ?? 0} tasks
                  </span>
                  <span style={{
                    color: 'var(--muted)',
                    transform: open ? 'rotate(180deg)' : 'none',
                  }}>
                    <Icons.chevronD size={13} />
                  </span>
                </div>
                {open && (
                  <div style={{
                    padding: '4px 14px 14px',
                    borderTop: '1px solid var(--line)',
                  }}>
                    <div style={{ ...labelStyle, margin: '12px 0 6px' }}>Name</div>
                    <input
                      defaultValue={g.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== g.name) renameGroup(g.id, v);
                      }}
                      style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                    />
                    <div style={{ ...labelStyle, margin: '14px 0 8px' }}>Color</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {GROUP_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => recolorGroup(g.id, c)}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 5,
                            background: c,
                            cursor: 'pointer',
                            border:
                              g.color === c
                                ? '2px solid var(--ink)'
                                : '1px solid var(--line)',
                          }}
                        />
                      ))}
                    </div>
                    <div style={{
                      marginTop: 14,
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}>
                      <button
                        onClick={() => setConfirmDelete(g.id)}
                        style={{
                          padding: '6px 12px',
                          background: 'transparent',
                          border:
                            '1px solid color-mix(in oklch, var(--danger) 50%, var(--line))',
                          borderRadius: 5,
                          color: 'var(--danger)',
                          fontSize: 12,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Icons.trash size={12} /> Delete group
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {creating ? (
            <div style={{
              border: '1px dashed var(--accent)',
              borderRadius: 8,
              padding: 14,
              background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
            }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>New group</div>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createGroup();
                }}
                placeholder="Group name…"
                autoFocus
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 10,
              }}>
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDraftColor(c)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 5,
                      background: c,
                      cursor: 'pointer',
                      border:
                        draftColor === c
                          ? '2px solid var(--ink)'
                          : '1px solid var(--line)',
                    }}
                  />
                ))}
              </div>
              <div style={{
                marginTop: 12,
                display: 'flex',
                gap: 8,
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => {
                    setCreating(false);
                    setDraftName('');
                  }}
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    border: '1px solid var(--line)',
                    borderRadius: 5,
                    color: 'var(--ink)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={createGroup}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--accent)',
                    color: 'oklch(0.18 0.04 60)',
                    border: '1px solid var(--accent)',
                    borderRadius: 5,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{
                width: '100%',
                padding: '10px',
                background: 'transparent',
                border: '1px dashed var(--line)',
                borderRadius: 8,
                color: 'var(--muted)',
                fontSize: 12.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Icons.plus size={12} /> New group
            </button>
          )}
        </div>
        {error && (
          <div
            onClick={() => setError(null)}
            style={{
              padding: '8px 14px',
              background: 'color-mix(in oklch, var(--danger) 12%, var(--bg))',
              borderTop: '1px solid var(--danger)',
              color: 'var(--danger)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {confirmDelete != null && (
        <DeleteGroupConfirm
          group={groups.find((g) => g.id === confirmDelete)!}
          count={counts[confirmDelete] ?? 0}
          others={groups.filter((g) => g.id !== confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={(reassign) => deleteGroup(confirmDelete, reassign)}
        />
      )}
    </div>
  );
}

function DeleteGroupConfirm({
  group,
  count,
  others,
  onCancel,
  onConfirm,
}: {
  group: TaskGroup;
  count: number;
  others: TaskGroup[];
  onCancel: () => void;
  onConfirm: (reassignTo: number | null) => void;
}) {
  const [target, setTarget] = useState<number | null>(null);

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px' }}>
          <div style={{
            ...labelStyle,
            color: 'var(--danger)',
            marginBottom: 8,
          }}>
            Delete group
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            color: 'var(--ink)',
            marginBottom: 8,
          }}>
            Delete &ldquo;{group.name}&rdquo;?
          </div>
          {count > 0 ? (
            <>
              <div style={{
                fontSize: 13,
                color: 'var(--muted)',
                marginBottom: 14,
              }}>
                {count} {count === 1 ? 'task is' : 'tasks are'} in this group. Move them to:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <RadioRow
                  selected={target === null}
                  onClick={() => setTarget(null)}
                  swatch={null}
                  label="No group"
                />
                {others.map((g) => (
                  <RadioRow
                    key={g.id}
                    selected={target === g.id}
                    onClick={() => setTarget(g.id)}
                    swatch={g.color}
                    label={g.name}
                  />
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Nothing depends on this group.
            </div>
          )}
        </div>
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 5,
              color: 'var(--ink)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(target)}
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
        </div>
      </div>
    </div>
  );
}

function RadioRow({
  selected,
  onClick,
  swatch,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  swatch: string | null;
  label: string;
}) {
  return (
    <label
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 5,
        border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--line)'),
        background: selected ? 'var(--accent-soft)' : 'transparent',
        fontSize: 12.5,
        color: 'var(--ink)',
        cursor: 'pointer',
      }}
    >
      <input
        type="radio"
        checked={selected}
        onChange={() => {}}
        style={{ accentColor: 'var(--accent)' }}
      />
      <span style={{
        width: 10,
        height: 10,
        borderRadius: 2,
        background: swatch ?? 'transparent',
        border: swatch ? 'none' : '1px dashed var(--line)',
      }} />
      <span>{label}</span>
    </label>
  );
}

interface PlanModalProps {
  task: Task;
  groups: TaskGroup[];
  onClose: () => void;
  onError: (msg: string) => void;
  onAfterPlan: () => void;
}

export function PlanModal({
  task,
  groups,
  onClose,
  onError,
  onAfterPlan,
}: PlanModalProps) {
  const [draft, setDraft] = useState<Task>(task);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (patch: Partial<Task>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updates: TaskUpdate = {};
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
      if (draft.groupId !== task.groupId) updates.groupId = draft.groupId;
      if (Object.keys(updates).length > 0) {
        await api.updateTask(task.id, updates);
      }
      await api.rebuildSchedule();
      onAfterPlan();
      onClose();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const inp: CSSProperties = {
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
        zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540,
          maxHeight: '88vh',
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: 4 }}>Add to plan</div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 19,
              color: 'var(--ink)',
              letterSpacing: '-0.012em',
            }}>
              {task.name}
            </div>
          </div>
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

        <div style={{
          padding: '16px 20px',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>Group</div>
              <select
                value={draft.groupId ?? ''}
                onChange={(e) =>
                  set({
                    groupId: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                style={inp}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>Priority</div>
              <select
                value={draft.priority}
                onChange={(e) => set({ priority: Number(e.target.value) })}
                style={inp}
              >
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    P{p} {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>Estimate (min)</div>
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
                style={inp}
              />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 5 }}>Deadline</div>
              <input
                type="date"
                value={
                  draft.deadline
                    ? new Date(draft.deadline).toISOString().substring(0, 10)
                    : ''
                }
                onChange={(e) => {
                  if (!e.target.value) {
                    set({ deadline: null });
                  } else {
                    set({
                      deadline: new Date(e.target.value + 'T18:00:00').getTime(),
                    });
                  }
                }}
                style={inp}
              />
            </div>
          </div>

          <div>
            <div style={{ ...labelStyle, marginBottom: 5 }}>Profile</div>
            <select
              value={draft.enforcementProfile ?? 'work'}
              onChange={(e) => set({ enforcementProfile: e.target.value })}
              style={inp}
            >
              <option value="rest">Rest</option>
              <option value="work">Work</option>
              <option value="deep_work">Deep Work</option>
            </select>
          </div>

          <details style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <summary style={{
              ...labelStyle,
              cursor: 'pointer',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <Icons.chevronD size={11} /> Planner knobs
            </summary>
            <div style={{
              marginTop: 10,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 10,
            }}>
              <NumField
                label="Max chunk"
                value={draft.maxChunkMinutes}
                onChange={(v) => set({ maxChunkMinutes: v })}
              />
              <NumField
                label="Min chunk"
                value={draft.minChunkMinutes}
                onChange={(v) => set({ minChunkMinutes: v })}
              />
              <NumField
                label="Min rest"
                value={draft.minimumRestMinutes}
                onChange={(v) => set({ minimumRestMinutes: v })}
              />
              <NumField
                label="Work ratio"
                value={draft.workRatio}
                onChange={(v) => set({ workRatio: v })}
              />
              <NumField
                label="Rest ratio"
                value={draft.restRatio}
                onChange={(v) => set({ restRatio: v })}
              />
            </div>
            <label style={{
              marginTop: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--ink)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={draft.protectGeneratedBlocks}
                onChange={(e) => set({ protectGeneratedBlocks: e.target.checked })}
                style={{ accentColor: 'var(--accent)' }}
              />
              Lock blocks once placed
            </label>
          </details>
        </div>

        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 5,
              color: 'var(--ink)',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <span style={{ flex: 1 }} />
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '7px 14px',
              background: 'var(--accent)',
              color: 'oklch(0.18 0.04 60)',
              border: '1px solid var(--accent)',
              borderRadius: 5,
              fontSize: 12.5,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Planning…' : 'Plan it'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 5 }}>{label}</div>
      <input
        type="number"
        min={0}
        step={5}
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: 5,
          padding: '6px 9px',
          fontSize: 13,
          color: 'var(--ink)',
          outline: 'none',
          fontFamily: 'var(--font-mono)',
        }}
      />
    </div>
  );
}

interface RemoveModalProps {
  task: Task;
  onClose: () => void;
  onError: (msg: string) => void;
  onAfterRemove: () => void;
}

export function RemoveFromPlanModal({
  task,
  onClose,
  onError,
  onAfterRemove,
}: RemoveModalProps) {
  const [busy, setBusy] = useState(false);
  const [taskBlocks, setTaskBlocks] = useState<
    Array<{ id: number; startTime: number; endTime: number; title: string }>
  >([]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const horizon = Date.now() + 30 * 86_400_000;
        const blocks = await api.getScheduleRange(Date.now(), horizon);
        if (cancelled) return;
        setTaskBlocks(
          blocks
            .filter(
              (b) =>
                b.taskId === task.id &&
                (b.status === 'scheduled' ||
                  b.status === 'active' ||
                  b.status === 'paused'),
            )
            .map((b) => ({
              id: b.id,
              startTime: b.startTime,
              endTime: b.endTime,
              title: b.title,
            })),
        );
      } catch {
        if (!cancelled) setTaskBlocks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (const b of taskBlocks) {
        await api.deleteTimeBlock(b.id);
      }
      await api.rebuildSchedule();
      onAfterRemove();
      onClose();
    } catch (err) {
      onError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const totalMin = taskBlocks.reduce(
    (acc, b) => acc + Math.round((b.endTime - b.startTime) / 60_000),
    0,
  );
  const fmtMins = (mins: number) => {
    if (mins < 60) return mins + 'm';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div style={{
            ...labelStyle,
            color: 'var(--danger)',
            marginBottom: 4,
          }}>
            Remove from plan
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 19,
            color: 'var(--ink)',
            letterSpacing: '-0.012em',
          }}>
            {task.name}
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>
            {taskBlocks.length}{' '}
            {taskBlocks.length === 1 ? 'block' : 'blocks'} · {fmtMins(totalMin)}
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            maxHeight: 240,
            overflow: 'auto',
          }}>
            {taskBlocks.map((b) => {
              const start = new Date(b.startTime);
              const end = new Date(b.endTime);
              const day = start.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              const t1 = start.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: false,
              });
              const t2 = end.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: false,
              });
              const mins = Math.round(
                (b.endTime - b.startTime) / 60_000,
              );
              return (
                <div
                  key={b.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '130px 130px 70px minmax(0, 1fr)',
                    alignItems: 'center',
                    gap: 12,
                    padding: '6px 10px',
                    background: 'var(--bg-raise)',
                    borderRadius: 5,
                    border: '1px solid var(--line)',
                    fontSize: 12,
                    color: 'var(--muted)',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                  }}>
                    {day}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: 'var(--ink)',
                  }}>
                    {t1} – {t2}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--faint)',
                  }}>
                    {fmtMins(mins)}
                  </span>
                  <span style={{
                    fontSize: 11.5,
                    color: 'var(--muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {b.title}
                  </span>
                </div>
              );
            })}
            {taskBlocks.length === 0 && (
              <div style={{
                fontSize: 12.5,
                color: 'var(--muted)',
                padding: '12px 0',
              }}>
                No scheduled blocks to remove.
              </div>
            )}
          </div>
        </div>
        <div style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 5,
              color: 'var(--ink)',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <span style={{ flex: 1 }} />
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '7px 14px',
              background: 'transparent',
              border: '1px solid color-mix(in oklch, var(--danger) 50%, var(--line))',
              borderRadius: 5,
              color: 'var(--danger)',
              fontSize: 12.5,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
