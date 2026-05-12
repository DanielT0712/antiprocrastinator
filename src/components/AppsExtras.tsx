import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../api';
import type {
  AppCategory,
  EnforcementDecision,
  EnforcementProfile,
  EnforcementProfileOverride,
  KnownApp,
  KnownBrowserTarget,
} from '../api/types';
import { Icons } from './Icons';

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

// Custom styled dropdown (matches the design's StyledSelect — no native
// <select>, hover states, animated open/close).
export function StyledSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 11px',
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          color: 'var(--ink)',
          fontSize: 13,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ color: current ? 'var(--ink)' : 'var(--muted)' }}>
          {current?.label || placeholder || '—'}
        </span>
        <span style={{ color: 'var(--muted)' }}>
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--bg-raise)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
            overflow: 'hidden',
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {options.map((o) => {
            const sel = o.value === value;
            return (
              <div
                key={o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{
                  padding: '9px 12px',
                  fontSize: 13,
                  color: sel ? 'var(--accent-ink)' : 'var(--ink)',
                  background: sel ? 'var(--accent-soft)' : 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!sel)
                    e.currentTarget.style.background =
                      'color-mix(in oklch, var(--ink) 6%, transparent)';
                }}
                onMouseLeave={(e) => {
                  if (!sel) e.currentTarget.style.background = 'transparent';
                }}
              >
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type DrawerPreset =
  | 'inherit'
  | 'always-allow'
  | 'block-work'
  | 'always-block'
  | 'custom';

interface AppDrawerProps {
  app: KnownApp;
  profiles: EnforcementProfile[];
  overrides: EnforcementProfileOverride[];
  emergencyBlockedCategories: string[];
  initialPreset?: DrawerPreset;
  onClose: () => void;
  onSetOverride: (
    profileName: string,
    decision: EnforcementDecision | null,
  ) => Promise<void>;
  onApplyPreset: (
    preset: 'always-allow' | 'block-work' | 'always-block' | 'inherit',
  ) => Promise<void>;
  onUpdateApp: (
    appKey: string,
    patch: { categoryOverride?: string | null },
  ) => Promise<void>;
  categories: AppCategory[];
}

function decisionForApp(
  app: KnownApp,
  profileName: string,
  overrides: EnforcementProfileOverride[],
): EnforcementDecision | null {
  const direct = overrides.find(
    (o) =>
      o.profileName === profileName &&
      o.subjectType === 'app' &&
      o.subjectKey === app.appKey,
  );
  if (direct) return direct.decision;
  if (app.effectiveCategory) {
    const cat = overrides.find(
      (o) =>
        o.profileName === profileName &&
        o.subjectType === 'category' &&
        o.subjectKey === app.effectiveCategory,
    );
    if (cat) return cat.decision;
  }
  return null;
}

function detectDrawerPreset(
  app: KnownApp,
  profiles: EnforcementProfile[],
  overrides: EnforcementProfileOverride[],
): DrawerPreset {
  const direct = profiles
    .map((p) =>
      overrides.find(
        (o) =>
          o.profileName === p.name &&
          o.subjectType === 'app' &&
          o.subjectKey === app.appKey,
      ),
    )
    .filter(Boolean);
  if (direct.length === 0) return 'inherit';
  const all: Record<string, EnforcementDecision | null> = {};
  profiles.forEach(
    (p) =>
      (all[p.name] =
        overrides.find(
          (o) =>
            o.profileName === p.name &&
            o.subjectType === 'app' &&
            o.subjectKey === app.appKey,
        )?.decision ?? null),
  );
  const vals = profiles.map((p) => all[p.name]);
  if (vals.every((v) => v === 'allow')) return 'always-allow';
  if (vals.every((v) => v === 'block')) return 'always-block';
  if (
    profiles.every((p) => {
      const d = all[p.name];
      if (p.name === 'rest' || p.name === 'emergency') return d === 'allow';
      return d === 'block';
    })
  )
    return 'block-work';
  return 'custom';
}


function AllowBlockToggle({
  value,
  onChange,
  blocked,
  blockedReason,
}: {
  value: EnforcementDecision;
  onChange: (next: EnforcementDecision) => void;
  blocked?: boolean;
  blockedReason?: string;
}) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--line)',
      borderRadius: 6,
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      <button
        onClick={() => {
          if (blocked) return;
          onChange('allow');
        }}
        disabled={blocked}
        title={blocked ? blockedReason : undefined}
        style={{
          padding: '6px 12px',
          fontSize: 11.5,
          background:
            value === 'allow' ? 'var(--accent-soft)' : 'transparent',
          color:
            value === 'allow' ? 'var(--accent-ink)' : 'var(--muted)',
          border: 'none',
          cursor: blocked ? 'not-allowed' : 'pointer',
          opacity: blocked ? 0.4 : 1,
          fontFamily: 'var(--font-sans)',
        }}
      >
        Allow
      </button>
      <button
        onClick={() => onChange('block')}
        style={{
          padding: '6px 12px',
          fontSize: 11.5,
          background:
            value === 'block'
              ? 'color-mix(in oklch, var(--danger) 16%, transparent)'
              : 'transparent',
          color: value === 'block' ? 'var(--danger)' : 'var(--muted)',
          border: 'none',
          borderLeft: '1px solid var(--line)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Block
      </button>
    </div>
  );
}

function AppGlyph({ name, size = 26 }: { name: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const letter = name.replace(/^www\./, '').charAt(0).toUpperCase();
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 6,
      background: `oklch(0.45 0.06 ${h})`,
      color: `oklch(0.94 0.04 ${h})`,
      display: 'grid',
      placeItems: 'center',
      fontSize: size * 0.48,
      fontWeight: 600,
      fontFamily: 'var(--font-sans)',
      flexShrink: 0,
    }}>
      {letter}
    </div>
  );
}

export function AppDrawer({
  app,
  profiles,
  overrides,
  emergencyBlockedCategories,
  initialPreset,
  onClose,
  onSetOverride,
  onApplyPreset,
  onUpdateApp,
  categories,
}: AppDrawerProps) {
  // Detection retained for callers that still pass initialPreset; the
  // popup itself no longer exposes preset chips — it's purely a
  // per-profile editor. The remaining helpers from older revisions are
  // suppressed to keep the TS surface tidy.
  void detectDrawerPreset;
  void initialPreset;
  void onApplyPreset;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Description text per profile (matches design copy).
  const profileDesc = (name: string): string => {
    switch (name) {
      case 'rest':
        return 'No work enforcement.';
      case 'work':
        return 'Standard work blocking.';
      case 'deep_work':
        return 'Inherits from Work, plus stricter rules.';
      case 'emergency':
        return 'Emergency mode — most apps blocked.';
      default:
        return '';
    }
  };

  const isRunning =
    app.lastSeenRunningAt != null &&
    Date.now() - app.lastSeenRunningAt < 60_000;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        animation: 'ap-fade 150ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 48px)',
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <AppGlyph name={app.displayName} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}>
              {app.displayName}
            </div>
            <div style={{
              fontSize: 11.5,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              marginTop: 2,
            }}>
              {isRunning ? (
                <span style={{ color: 'var(--accent-ink)' }}>● Running now</span>
              ) : (
                'Not running'
              )}
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
            aria-label="Close"
          >
            <Icons.x size={16} />
          </button>
        </div>

        {/* body */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}>
          {/* category */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 7, display: 'block' }}>
              Category
            </label>
            <StyledSelect
              value={app.categoryOverride ?? app.effectiveCategory ?? ''}
              onChange={(v) =>
                onUpdateApp(app.appKey, {
                  categoryOverride: v === '' ? null : v,
                })
              }
              placeholder="Uncategorized"
              options={[
                { value: '', label: 'Uncategorized' },
                ...categories.map((c) => ({ value: c.name, label: c.name })),
              ]}
            />
          </div>

          {/* per-profile matrix — this is what Custom is for */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 7, display: 'block' }}>
              Per-profile rules
            </label>
            <div style={{
              border: '1px solid var(--accent)',
              borderRadius: 8,
              background: 'var(--bg)',
              overflow: 'hidden',
            }}>
              {profiles.map((p, i) => {
                const direct = overrides.find(
                  (o) =>
                    o.profileName === p.name &&
                    o.subjectType === 'app' &&
                    o.subjectKey === app.appKey,
                );
                const resolved =
                  direct?.decision ??
                  decisionForApp(app, p.name, overrides) ??
                  'allow';
                const blocked =
                  p.name === 'emergency' &&
                  app.effectiveCategory != null &&
                  emergencyBlockedCategories.some(
                    (c) =>
                      c.toLowerCase() ===
                      app.effectiveCategory!.toLowerCase(),
                  );
                return (
                  <div
                    key={p.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '11px 13px',
                      borderBottom:
                        i < profiles.length - 1
                          ? '1px solid var(--line)'
                          : 'none',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        color: 'var(--ink)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                      }}>
                        {p.name === 'deep_work'
                          ? 'Deep Work'
                          : p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                        {p.parentName && (
                          <span style={{
                            fontSize: 10.5,
                            color: 'var(--faint)',
                            fontFamily: 'var(--font-mono)',
                          }}>
                            ← {p.parentName}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 2,
                      }}>
                        {profileDesc(p.name)}
                      </div>
                    </div>
                    <AllowBlockToggle
                      value={resolved}
                      onChange={(v) => onSetOverride(p.name, v)}
                      blocked={blocked}
                      blockedReason={
                        blocked
                          ? `${app.effectiveCategory} apps cannot be allowed during emergency.`
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div style={{
              marginTop: 6,
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.55,
            }}>
              Enforcement (close vs warn-then-close) is set globally in
              Settings → Enforcement.
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              fontSize: 12.5,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: 'var(--ink)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

interface CategoryManagerProps {
  categories: AppCategory[];
  apps: KnownApp[];
  onClose: () => void;
  onRefresh: () => void;
}

export function CategoryManagerModal({
  categories,
  apps,
  onClose,
  onRefresh,
}: CategoryManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);
  const [newInput, setNewInput] = useState(false);
  const [newName, setNewName] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cat of categories) c[cat.name] = 0;
    c['Uncategorized'] = 0;
    for (const a of apps) {
      const bucket = a.effectiveCategory ?? 'Uncategorized';
      c[bucket] = (c[bucket] ?? 0) + 1;
    }
    return c;
  }, [apps, categories]);

  const reassign = async (appKey: string, targetCategory: string | null) => {
    try {
      await api.updateKnownApp(appKey, {
        categoryOverride: { value: targetCategory },
      });
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const startRename = (name: string) => {
    setRenamingName(name);
    setRenameVal(name);
  };
  const commitRename = async (oldName: string) => {
    const next = renameVal.trim();
    setRenamingName(null);
    if (!next || next === oldName) return;
    try {
      await api.upsertAppCategory({ name: next });
      // The backend doesn't have a rename op yet; the new category is
      // added and the old one stays. Leave deletion to the user via the
      // trash button so they don't lose data accidentally.
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const addCat = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.upsertAppCategory({ name });
      setNewName('');
      setNewInput(false);
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const remove = async (name: string) => {
    try {
      await api.deleteAppCategory(name);
      setConfirmDeleteName(null);
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };

  type Row = AppCategory & { permanent?: boolean };
  const rows: Row[] = [
    ...categories,
    {
      name: 'Uncategorized',
      builtin: true,
      createdAt: 0,
      updatedAt: 0,
      permanent: true,
    } as Row,
  ];

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: 'var(--bg-rail)',
        borderLeft: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'ap-drawer-in 200ms ease-out',
      }}
    >
        {/* header */}
        <div style={{
          padding: '18px 18px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}>
            Categories
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

        {/* category list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
          {rows.map((c) => {
            const isDropTarget = dragOverCategory === c.name;
            const isPermanent = !!c.permanent;
            const isConfirmDelete = confirmDeleteName === c.name;
            const count = counts[c.name] ?? 0;
            return (
              <div
                key={c.name}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverCategory !== c.name) setDragOverCategory(c.name);
                }}
                onDragLeave={() => {
                  if (dragOverCategory === c.name) setDragOverCategory(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const appKey = e.dataTransfer.getData('text/app-key');
                  setDragOverCategory(null);
                  if (!appKey) return;
                  reassign(appKey, isPermanent ? null : c.name);
                }}
                style={{
                  borderRadius: 7,
                  border:
                    '1px solid ' +
                    (isDropTarget
                      ? 'var(--accent)'
                      : 'var(--line)'),
                  background: isDropTarget
                    ? 'color-mix(in oklch, var(--accent) 14%, var(--bg-raise))'
                    : 'var(--bg-raise)',
                  marginBottom: 6,
                  overflow: 'hidden',
                  transition: 'border-color 80ms, background 80ms',
                  opacity: isPermanent ? 0.75 : 1,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '10px 11px',
                }}>
                  {!isPermanent && (
                    <span
                      title="Drag to reorder"
                      style={{
                        color: 'var(--faint)',
                        cursor: 'grab',
                        fontSize: 13,
                        lineHeight: 1,
                        flexShrink: 0,
                        userSelect: 'none',
                      }}
                    >
                      ⠿
                    </span>
                  )}

                  {renamingName === c.name ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onBlur={() => commitRename(c.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(c.name);
                        if (e.key === 'Escape') setRenamingName(null);
                      }}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--accent)',
                        color: 'var(--ink)',
                        fontSize: 13,
                        outline: 'none',
                        padding: '0 0 2px',
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => !isPermanent && startRename(c.name)}
                      title={
                        isPermanent
                          ? 'Built-in — cannot rename'
                          : 'Click to rename'
                      }
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: isPermanent ? 'var(--muted)' : 'var(--ink)',
                        cursor: isPermanent ? 'default' : 'text',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textDecoration: isPermanent
                          ? 'none'
                          : 'underline dotted color-mix(in oklch, var(--ink) 25%, transparent)',
                        textUnderlineOffset: '3px',
                      }}
                    >
                      {c.name}
                    </div>
                  )}

                  <span style={{
                    fontSize: 10.5,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                  }}>
                    {count}
                  </span>

                  {!isPermanent && !c.builtin && (
                    isConfirmDelete ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{
                          fontSize: 11,
                          color: 'var(--danger)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                        }}>
                          Delete?
                        </span>
                        <button
                          onClick={() => remove(c.name)}
                          style={{
                            padding: '2px 7px',
                            fontSize: 11,
                            background: 'var(--danger)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteName(null)}
                          style={{
                            padding: '2px 7px',
                            fontSize: 11,
                            background: 'transparent',
                            color: 'var(--muted)',
                            border: '1px solid var(--line)',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteName(c.name)}
                        title="Delete category"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--faint)',
                          cursor: 'pointer',
                          padding: '0 2px',
                          fontSize: 13,
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--danger)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--faint)';
                        }}
                      >
                        <Icons.trash size={13} />
                      </button>
                    )
                  )}
                </div>

                {isDropTarget && (
                  <div style={{
                    padding: '4px 11px 10px',
                    fontSize: 11,
                    color: 'var(--accent-ink)',
                    fontFamily: 'var(--font-mono)',
                    fontStyle: 'italic',
                  }}>
                    drop here
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* new category */}
        <div style={{
          padding: '10px 10px 16px',
          borderTop: '1px solid var(--line)',
        }}>
          {newInput ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCat();
                  if (e.key === 'Escape') setNewInput(false);
                }}
                placeholder="Category name…"
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  background: 'var(--bg-raise)',
                  border: '1px solid var(--accent)',
                  borderRadius: 6,
                  color: 'var(--ink)',
                  fontSize: 12.5,
                  outline: 'none',
                }}
              />
              <button
                onClick={addCat}
                style={{
                  padding: '7px 12px',
                  background: 'var(--ink)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                }}
              >
                Add
              </button>
              <button
                onClick={() => setNewInput(false)}
                style={{
                  padding: '7px 10px',
                  background: 'transparent',
                  color: 'var(--muted)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setNewInput(true)}
              style={{
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '7px 11px',
                background: 'transparent',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                fontSize: 12.5,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <Icons.plus size={13} /> New category
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
  );
}

interface PendingBannerProps {
  apps: KnownApp[];
  browserTargets: KnownBrowserTarget[];
  isBrowserTab: boolean;
  onOpenApp: (app: KnownApp) => void;
  onAcceptApp: (app: KnownApp) => void | Promise<void>;
  onAcceptBrowserTarget: (target: KnownBrowserTarget) => void | Promise<void>;
}

const PRESET_LABEL_FOR_ACTION: Record<string, string> = {
  always_ban: 'Always block',
  ban_during_work: 'Block for work',
  never_ban: 'Always allow',
  unclassified: 'Unclassified',
};

export function PendingBanner({
  apps,
  browserTargets,
  isBrowserTab,
  onOpenApp,
  onAcceptApp,
  onAcceptBrowserTarget,
}: PendingBannerProps) {
  const [open, setOpen] = useState(false);
  const items = isBrowserTab ? browserTargets : apps;
  if (items.length === 0) return null;

  const label = isBrowserTab ? 'site' : 'app';
  const labelPlural = items.length === 1 ? label : `${label}s`;

  return (
    <div style={{
      border: '1px solid color-mix(in oklch, var(--accent) 40%, var(--line))',
      borderRadius: 9,
      background: 'color-mix(in oklch, var(--accent) 10%, var(--bg-raise))',
      padding: open ? '14px 16px 4px' : '11px 14px',
      marginBottom: 16,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minWidth: 0,
        }}>
          <Icons.alert size={16} />
          <div style={{ fontSize: 13, color: 'var(--ink)' }}>
            <strong style={{ fontWeight: 500 }}>
              {items.length} newly-seen {labelPlural}
            </strong>
            <span style={{ color: 'var(--muted)' }}>
              {' '}· auto-classified, waiting for review
            </span>
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 11px',
            background: 'transparent',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            fontSize: 12.5,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {open ? 'Hide' : 'Review'}
          <Icons.chevronD size={12} />
        </button>
      </div>
      {open && (
        <div style={{
          marginTop: 12,
          display: 'grid',
          gap: 8,
          paddingBottom: 10,
        }}>
          {!isBrowserTab &&
            apps.map((a) => (
              <div
                key={a.appKey}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: 7,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 0,
                }}>
                  <AppGlyph name={a.displayName} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                      {a.displayName}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      marginTop: 2,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      Guessed: {a.effectiveCategory ?? 'Uncategorized'} ·{' '}
                      {PRESET_LABEL_FOR_ACTION[a.classificationAction] ??
                        a.classificationAction}
                      {a.confidence != null && (
                        <> · {Math.round(a.confidence * 100)}% confidence</>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => onOpenApp(a)}
                    style={ghostBtnStyle}
                  >
                    Change…
                  </button>
                  <button
                    onClick={() => onAcceptApp(a)}
                    style={primaryBtnStyle}
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
          {isBrowserTab &&
            browserTargets.map((t) => (
              <div
                key={t.targetKey}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: 7,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 0,
                }}>
                  <AppGlyph name={t.displayName} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                      {t.displayName}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      marginTop: 2,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      Guessed: {t.categoryName ?? 'Uncategorized'} ·{' '}
                      {PRESET_LABEL_FOR_ACTION[t.classificationAction] ??
                        t.classificationAction}
                      {t.confidence != null && (
                        <> · {Math.round(t.confidence * 100)}% confidence</>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => onAcceptBrowserTarget(t)}
                    style={primaryBtnStyle}
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const ghostBtnStyle: CSSProperties = {
  padding: '6px 11px',
  background: 'transparent',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 12.5,
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
};

const primaryBtnStyle: CSSProperties = {
  padding: '6px 12px',
  background: 'var(--ink)',
  color: 'var(--bg)',
  border: 'none',
  borderRadius: 6,
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
};

interface ProfileMenuProps {
  profile: EnforcementProfile;
  profiles: EnforcementProfile[];
  onClose: () => void;
  onRefresh: () => void;
  onError: (msg: string) => void;
}

export function ProfileMenu({
  profile,
  profiles,
  onClose,
  onRefresh,
  onError,
}: ProfileMenuProps) {
  const [name, setName] = useState(profile.name);
  const [parentName, setParentName] = useState<string | null>(profile.parentName);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const save = async () => {
    try {
      await api.upsertEnforcementProfile({
        name: name.trim(),
        parentName,
      });
      onRefresh();
      onClose();
    } catch (err) {
      onError(String(err));
    }
  };
  const clone = async () => {
    try {
      await api.upsertEnforcementProfile({
        name: name.trim() + '_copy',
        parentName: profile.name,
      });
      onRefresh();
      onClose();
    } catch (err) {
      onError(String(err));
    }
  };
  const remove = async () => {
    if (profile.builtin) {
      onError('Built-in profiles cannot be deleted.');
      return;
    }
    // Inline Yes/No instead of window.confirm — Tauri's webview returns
    // false from confirm() silently in some configs, which was eating
    // the delete intent.
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.deleteEnforcementProfile(profile.name);
      onRefresh();
      onClose();
    } catch (err) {
      onError(String(err));
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
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: '22px 24px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          color: 'var(--ink)',
          letterSpacing: '-0.015em',
          marginBottom: 14,
        }}>
          Profile · {profile.name}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={profile.builtin}
              style={{
                ...inputStyle,
                width: '100%',
                boxSizing: 'border-box',
                opacity: profile.builtin ? 0.7 : 1,
                cursor: profile.builtin ? 'not-allowed' : 'text',
              }}
            />
            {profile.builtin && (
              <div style={{
                fontSize: 11,
                color: 'var(--faint)',
                marginTop: 4,
                fontFamily: 'var(--font-mono)',
              }}>
                Built-in profiles cannot be renamed.
              </div>
            )}
          </div>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Inherits from</div>
            <select
              value={parentName ?? ''}
              onChange={(e) =>
                setParentName(e.target.value === '' ? null : e.target.value)
              }
              disabled={profile.builtin}
              style={{
                ...inputStyle,
                width: '100%',
                boxSizing: 'border-box',
                opacity: profile.builtin ? 0.7 : 1,
                cursor: profile.builtin ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="">No parent</option>
              {profiles
                .filter((p) => p.name !== profile.name)
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
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
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{
                fontSize: 12,
                color: 'var(--danger)',
                fontFamily: 'var(--font-mono)',
              }}>
                Delete "{profile.name}"?
              </span>
              <button
                onClick={remove}
                style={{
                  padding: '6px 12px',
                  background: 'var(--danger)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 5,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  color: 'var(--muted)',
                  border: '1px solid var(--line)',
                  borderRadius: 5,
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={remove}
              disabled={profile.builtin}
              style={{
                padding: '7px 12px',
                background: 'transparent',
                border:
                  '1px solid color-mix(in oklch, var(--danger) 50%, var(--line))',
                borderRadius: 5,
                color: 'var(--danger)',
                fontSize: 12.5,
                cursor: profile.builtin ? 'not-allowed' : 'pointer',
                opacity: profile.builtin ? 0.5 : 1,
              }}
            >
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button
            onClick={clone}
            style={{
              padding: '7px 14px',
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 5,
              color: 'var(--ink)',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Clone
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              background: 'var(--bg)',
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
            disabled={profile.builtin}
            style={{
              padding: '7px 14px',
              background: profile.builtin ? 'var(--line)' : 'var(--accent)',
              color: profile.builtin
                ? 'var(--muted)'
                : 'oklch(0.18 0.04 60)',
              border: '1px solid var(--accent)',
              borderRadius: 5,
              fontSize: 12.5,
              cursor: profile.builtin ? 'not-allowed' : 'pointer',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface CategoryDrawerProps {
  category: AppCategory;
  profiles: EnforcementProfile[];
  overrides: EnforcementProfileOverride[];
  emergencyBlockedCategories: string[];
  initialPreset?: DrawerPreset;
  onClose: () => void;
  onSetOverride: (
    profileName: string,
    decision: EnforcementDecision | null,
  ) => Promise<void>;
  onApplyPreset: (
    preset: 'always-allow' | 'block-work' | 'always-block',
  ) => Promise<void>;
  onClearAllOverrides: () => Promise<void>;
}

function detectCategoryDrawerPreset(
  category: AppCategory,
  profiles: EnforcementProfile[],
  overrides: EnforcementProfileOverride[],
): DrawerPreset {
  const direct = profiles
    .map((p) =>
      overrides.find(
        (o) =>
          o.profileName === p.name &&
          o.subjectType === 'category' &&
          o.subjectKey === category.name,
      ),
    )
    .filter(Boolean) as EnforcementProfileOverride[];
  if (direct.length === 0) return 'inherit';
  const map: Record<string, EnforcementDecision | null> = {};
  profiles.forEach((p) => {
    map[p.name] =
      overrides.find(
        (o) =>
          o.profileName === p.name &&
          o.subjectType === 'category' &&
          o.subjectKey === category.name,
      )?.decision ?? null;
  });
  const vals = profiles.map((p) => map[p.name]);
  if (vals.every((v) => v === 'allow')) return 'always-allow';
  if (vals.every((v) => v === 'block')) return 'always-block';
  if (
    profiles.every((p) => {
      const d = map[p.name];
      if (p.name === 'rest' || p.name === 'emergency') return d === 'allow';
      return d === 'block';
    })
  )
    return 'block-work';
  return 'custom';
}

export function CategoryDrawer({
  category,
  profiles,
  overrides,
  emergencyBlockedCategories,
  initialPreset,
  onClose,
  onSetOverride,
  onApplyPreset,
  onClearAllOverrides,
}: CategoryDrawerProps) {
  // Older revisions exposed preset chips inside the drawer; the modal is
  // now a per-profile editor only. Silence unused-prop warnings.
  void detectCategoryDrawerPreset;
  void initialPreset;
  void onApplyPreset;
  void onClearAllOverrides;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const hardLocked = emergencyBlockedCategories.some(
    (c) => c.toLowerCase() === category.name.toLowerCase(),
  );

  function resolved(profileName: string): EnforcementDecision {
    if (hardLocked && profileName === 'emergency') return 'block';
    const o = overrides.find(
      (x) =>
        x.profileName === profileName &&
        x.subjectType === 'category' &&
        x.subjectKey === category.name,
    );
    return o?.decision ?? 'allow';
  }

  const profileDesc = (name: string): string => {
    switch (name) {
      case 'rest':
        return 'No work enforcement.';
      case 'work':
        return 'Standard work blocking.';
      case 'deep_work':
        return 'Inherits from Work, plus stricter rules.';
      case 'emergency':
        return 'Emergency mode — most apps blocked.';
      default:
        return '';
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        animation: 'ap-fade 150ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 48px)',
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}>
              {category.name}
            </div>
            <div style={{
              fontSize: 11.5,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              marginTop: 2,
            }}>
              Applies to every app in this category.
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
            aria-label="Close"
          >
            <Icons.x size={16} />
          </button>
        </div>

        {/* body */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}>
          <div>
            <label style={{ ...labelStyle, marginBottom: 7, display: 'block' }}>
              Per-profile rules
            </label>
            <div style={{
              border: '1px solid var(--accent)',
              borderRadius: 8,
              background: 'var(--bg)',
              overflow: 'hidden',
            }}>
              {profiles.map((p, i) => {
                const blocked = hardLocked && p.name === 'emergency';
                const value = resolved(p.name);
                const labelDisplay =
                  p.name === 'deep_work'
                    ? 'Deep Work'
                    : p.name.charAt(0).toUpperCase() + p.name.slice(1);
                return (
                  <div
                    key={p.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '11px 13px',
                      borderBottom:
                        i < profiles.length - 1
                          ? '1px solid var(--line)'
                          : 'none',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        color: 'var(--ink)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                      }}>
                        {labelDisplay}
                        {p.parentName && (
                          <span style={{
                            fontSize: 10.5,
                            color: 'var(--faint)',
                            fontFamily: 'var(--font-mono)',
                          }}>
                            ← {p.parentName}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 2,
                      }}>
                        {profileDesc(p.name)}
                      </div>
                    </div>
                    <AllowBlockToggle
                      value={value}
                      onChange={(v) => onSetOverride(p.name, v)}
                      blocked={blocked}
                      blockedReason={
                        blocked
                          ? `${category.name} stays blocked during emergency.`
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div style={{
              marginTop: 6,
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.55,
            }}>
              Enforcement (close vs warn-then-close) is set globally in
              Settings → Enforcement.
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              fontSize: 12.5,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: 'var(--ink)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
