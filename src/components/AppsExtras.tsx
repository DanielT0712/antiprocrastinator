import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
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

interface AppDrawerProps {
  app: KnownApp;
  profiles: EnforcementProfile[];
  overrides: EnforcementProfileOverride[];
  emergencyBlockedCategories: string[];
  onClose: () => void;
  onSetOverride: (
    profileName: string,
    decision: EnforcementDecision | null,
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

export function AppDrawer({
  app,
  profiles,
  overrides,
  emergencyBlockedCategories,
  onClose,
  onSetOverride,
  onUpdateApp,
  categories,
}: AppDrawerProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

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
        <div style={{
          padding: '20px 22px 16px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <span style={labelStyle}>App detail</span>
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
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            color: 'var(--ink)',
            letterSpacing: '-0.015em',
          }}>
            {app.displayName}
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            marginTop: 4,
          }}>
            {app.executableName ?? app.appKey} · {app.classificationStatus}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Category</div>
            <select
              value={app.categoryOverride ?? app.effectiveCategory ?? ''}
              onChange={(e) =>
                onUpdateApp(app.appKey, {
                  categoryOverride: e.target.value === '' ? null : e.target.value,
                })
              }
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {app.effectiveCategory && (
              <div style={{
                fontSize: 11,
                color: 'var(--faint)',
                fontFamily: 'var(--font-mono)',
                marginTop: 4,
              }}>
                Effective category: {app.effectiveCategory}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Per-profile rules</div>
            <div style={{
              border: '1px solid var(--line)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--bg-raise)',
            }}>
              {profiles.map((p, i) => {
                const direct = overrides.find(
                  (o) =>
                    o.profileName === p.name &&
                    o.subjectType === 'app' &&
                    o.subjectKey === app.appKey,
                );
                const inherited = direct == null
                  ? decisionForApp(app, p.name, overrides)
                  : null;
                const blocked =
                  p.name === 'emergency' &&
                  app.effectiveCategory != null &&
                  emergencyBlockedCategories.some(
                    (c) =>
                      c.toLowerCase() === app.effectiveCategory!.toLowerCase(),
                  );
                return (
                  <div
                    key={p.name}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, auto)',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                    }}
                  >
                    <div>
                      <div style={{
                        color: 'var(--ink)',
                        fontSize: 13,
                        fontWeight: 500,
                      }}>
                        {p.name === 'deep_work'
                          ? 'Deep Work'
                          : p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                        {p.parentName && (
                          <span style={{
                            color: 'var(--faint)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 11,
                            marginLeft: 6,
                          }}>
                            ← {p.parentName}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: 'var(--faint)',
                        fontFamily: 'var(--font-mono)',
                        marginTop: 2,
                      }}>
                        {direct
                          ? `Override: ${direct.decision}`
                          : inherited
                            ? `Inherits: ${inherited}`
                            : 'No rule (allow by default)'}
                      </div>
                    </div>
                    <DecisionToggle
                      current={direct?.decision ?? null}
                      hardLock={
                        blocked
                          ? `${app.effectiveCategory} apps cannot be allowed during emergency.`
                          : null
                      }
                      onChange={(next) => onSetOverride(p.name, next)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{
            marginTop: 18,
            fontSize: 12,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.55,
          }}>
            Last seen running:{' '}
            <span style={{ color: 'var(--ink)' }}>
              {app.lastSeenRunningAt
                ? new Date(app.lastSeenRunningAt).toLocaleString()
                : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionToggle({
  current,
  hardLock,
  onChange,
}: {
  current: EnforcementDecision | null;
  hardLock: string | null;
  onChange: (next: EnforcementDecision | null) => void;
}) {
  const opts: { v: EnforcementDecision | null; l: string }[] = [
    { v: null, l: 'Inherit' },
    { v: 'allow', l: 'Allow' },
    { v: 'block', l: 'Block' },
  ];
  return (
    <div style={{
      display: 'inline-flex',
      gap: 0,
      border: '1px solid var(--line)',
      borderRadius: 5,
      overflow: 'hidden',
      justifySelf: 'end',
    }}>
      {opts.map((o) => {
        const sel = o.v === current;
        const blocked = hardLock != null && o.v === 'allow';
        return (
          <button
            key={String(o.v)}
            onClick={() => {
              if (blocked) return;
              onChange(o.v);
            }}
            disabled={blocked}
            title={blocked ? hardLock! : undefined}
            style={{
              padding: '5px 10px',
              fontSize: 11.5,
              background: sel ? 'var(--ink-soft)' : 'transparent',
              color: sel ? 'var(--ink)' : blocked ? 'var(--faint)' : 'var(--muted)',
              border: 'none',
              borderRight: '1px solid var(--line)',
              cursor: blocked ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)',
              opacity: blocked ? 0.5 : 1,
            }}
          >
            {o.l}
          </button>
        );
      })}
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

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cat of categories) c[cat.name] = 0;
    for (const a of apps) {
      const cat = a.effectiveCategory;
      if (cat) c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [categories, apps]);

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
          width: 540,
          maxHeight: '80vh',
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '20px 22px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              color: 'var(--ink)',
              letterSpacing: '-0.015em',
            }}>
              Manage categories
            </div>
            <div style={{
              fontSize: 12.5,
              color: 'var(--muted)',
              marginTop: 4,
            }}>
              Built-in categories cannot be deleted. New categories show up immediately
              in the rule editor.
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

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
          {categories.map((c) => (
            <div
              key={c.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                border: '1px solid var(--line)',
                borderRadius: 8,
                marginBottom: 8,
                background: 'var(--bg)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{
                  color: 'var(--ink)',
                  fontSize: 13.5,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  {c.name}
                  {c.builtin && (
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
                  marginTop: 3,
                }}>
                  {counts[c.name] ?? 0}{' '}
                  {(counts[c.name] ?? 0) === 1 ? 'app' : 'apps'}
                </div>
              </div>
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
          ))}

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
    </div>
  );
}

interface PendingBannerProps {
  apps: KnownApp[];
  browserTargets: KnownBrowserTarget[];
  onOpenApp: (app: KnownApp) => void;
  onOpenBrowserTab: () => void;
}

export function PendingBanner({
  apps,
  browserTargets,
  onOpenApp,
  onOpenBrowserTab,
}: PendingBannerProps) {
  const total = apps.length + browserTargets.length;
  if (total === 0) return null;
  const sample: ReactNode[] = [];
  for (const app of apps.slice(0, 3)) {
    sample.push(
      <button
        key={`a-${app.appKey}`}
        onClick={() => onOpenApp(app)}
        style={chipStyle}
      >
        {app.displayName}
      </button>,
    );
  }
  for (const target of browserTargets.slice(0, 3)) {
    sample.push(
      <button
        key={`b-${target.targetKey}`}
        onClick={onOpenBrowserTab}
        style={chipStyle}
      >
        {target.displayName}
      </button>,
    );
  }
  return (
    <div style={{
      padding: '12px 14px',
      border: '1px solid color-mix(in oklch, var(--warn) 60%, var(--line))',
      borderRadius: 8,
      marginBottom: 16,
      background: 'color-mix(in oklch, var(--warn) 8%, var(--bg-raise))',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--warn)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Pending review
        </span>
        <span style={{
          fontSize: 13,
          color: 'var(--ink)',
        }}>
          {total} {total === 1 ? 'item' : 'items'} need a category and rule
        </span>
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
      }}>
        {sample}
        {total > sample.length && (
          <span style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            alignSelf: 'center',
            marginLeft: 4,
          }}>
            +{total - sample.length} more
          </span>
        )}
      </div>
    </div>
  );
}

const chipStyle: CSSProperties = {
  padding: '4px 9px',
  fontSize: 11.5,
  background: 'var(--bg)',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 5,
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
