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
          maxHeight: '88vh',
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
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const appsByCategory = useMemo(() => {
    const map = new Map<string, KnownApp[]>();
    for (const c of categories) map.set(c.name, []);
    map.set('Uncategorized', []);
    for (const a of apps) {
      const bucket = a.effectiveCategory ?? 'Uncategorized';
      const list = map.get(bucket) ?? [];
      list.push(a);
      map.set(bucket, list);
    }
    return map;
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

  const create = async () => {
    const name = draftName.trim();
    if (!name) return;
    try {
      await api.upsertAppCategory({ name });
      setDraftName('');
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const remove = async (name: string) => {
    try {
      await api.deleteAppCategory(name);
      onRefresh();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        background: 'var(--bg-rail)',
        borderLeft: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'ap-drawer-in 200ms ease-out',
      }}
    >
        <div style={{
          padding: '18px 18px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}>
              Categories
            </div>
            <div style={{
              fontSize: 11.5,
              color: 'var(--muted)',
              marginTop: 4,
              fontFamily: 'var(--font-mono)',
            }}>
              Drag apps between categories.
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
          padding: '6px 18px 10px',
          fontSize: 12,
          color: 'var(--muted)',
          lineHeight: 1.55,
        }}>
          Drag app chips between categories to re-classify. Drop on
          <em style={{ color: 'var(--ink)', fontStyle: 'normal' }}> Uncategorized </em>
          to clear an override.
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 18px 14px' }}>
          {[
            ...categories,
            { name: 'Uncategorized', builtin: true, createdAt: 0, updatedAt: 0 } as AppCategory,
          ].map((c) => {
            const items = appsByCategory.get(c.name) ?? [];
            const isDropTarget = dragOverCategory === c.name;
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
                  reassign(
                    appKey,
                    c.name === 'Uncategorized' ? null : c.name,
                  );
                }}
                style={{
                  padding: '11px 14px',
                  border:
                    '1px solid ' +
                    (isDropTarget ? 'var(--accent)' : 'var(--line)'),
                  borderRadius: 8,
                  marginBottom: 8,
                  background: isDropTarget
                    ? 'color-mix(in oklch, var(--accent) 8%, var(--bg))'
                    : 'var(--bg)',
                  transition: 'background 80ms ease, border-color 80ms ease',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: items.length > 0 ? 10 : 0,
                }}>
                  <div style={{
                    color: 'var(--ink)',
                    fontSize: 13.5,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    {c.name}
                    {c.builtin && c.name !== 'Uncategorized' && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--faint)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        padding: '1px 5px',
                        border: '1px solid var(--line)',
                        borderRadius: 3,
                      }}>
                        builtin
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {items.length} {items.length === 1 ? 'app' : 'apps'}
                  </div>
                  <div style={{ flex: 1 }} />
                  {!c.builtin && (
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Delete category "${c.name}"? Apps will become uncategorized.`,
                          )
                        ) {
                          remove(c.name);
                        }
                      }}
                      style={{
                        padding: '5px 10px',
                        background: 'transparent',
                        border:
                          '1px solid color-mix(in oklch, var(--danger) 50%, var(--line))',
                        borderRadius: 5,
                        color: 'var(--danger)',
                        fontSize: 11.5,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icons.trash size={11} /> Delete
                    </button>
                  )}
                </div>
                {items.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}>
                    {items.map((a) => (
                      <div
                        key={a.appKey}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/app-key', a.appKey);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        title={`Drag to move ${a.displayName} to another category`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '5px 10px 5px 6px',
                          background: 'var(--bg-raise)',
                          border: '1px solid var(--line)',
                          borderRadius: 20,
                          fontSize: 11.5,
                          color: 'var(--ink)',
                          cursor: 'grab',
                          userSelect: 'none',
                        }}
                      >
                        <span style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background:
                            'color-mix(in oklch, var(--ink) 8%, transparent)',
                          color: 'var(--muted)',
                          display: 'inline-grid',
                          placeItems: 'center',
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {(a.displayName || a.appKey).charAt(0).toUpperCase()}
                        </span>
                        {a.displayName}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{
            border: '1px dashed var(--line)',
            borderRadius: 8,
            padding: 14,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="New category name…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') create();
              }}
              style={{
                ...inputStyle,
                flex: 1,
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={create}
              disabled={!draftName.trim()}
              style={{
                padding: '7px 14px',
                background: draftName.trim() ? 'var(--accent)' : 'var(--line)',
                color: draftName.trim()
                  ? 'oklch(0.18 0.04 60)'
                  : 'var(--muted)',
                border: '1px solid var(--accent)',
                borderRadius: 5,
                fontSize: 12.5,
                cursor: draftName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Add
            </button>
          </div>
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
    if (!confirm(`Delete profile "${profile.name}"?`)) return;
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
          maxHeight: '88vh',
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
