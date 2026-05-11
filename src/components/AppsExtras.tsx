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

type DrawerPreset =
  | 'inherit'
  | 'always-allow'
  | 'block-work'
  | 'always-block'
  | 'custom';

const DRAWER_PRESETS: { id: DrawerPreset; label: string; hint: string }[] = [
  {
    id: 'inherit',
    label: 'Follow category',
    hint: 'Use the rule set on this category.',
  },
  { id: 'always-allow', label: 'Always allow', hint: 'Never blocked.' },
  {
    id: 'block-work',
    label: 'Block for work',
    hint: 'Allowed during rest, blocked during work and deep work.',
  },
  { id: 'always-block', label: 'Always block', hint: 'Blocked in every profile.' },
  {
    id: 'custom',
    label: 'Custom per profile',
    hint: 'Pick allow or block for every profile individually.',
  },
];

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

function PresetOption({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '11px 13px',
        background: selected ? 'var(--accent-soft)' : 'transparent',
        border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--line)'),
        borderRadius: 7,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        color: 'var(--ink)',
      }}
    >
      <span style={{
        marginTop: 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        border:
          '1.5px solid ' + (selected ? 'var(--accent)' : 'var(--line)'),
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}>
        {selected && (
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
          }} />
        )}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          color: 'var(--ink)',
          fontWeight: selected ? 500 : 400,
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 11.5,
          color: 'var(--muted)',
          marginTop: 2,
        }}>
          {hint}
        </div>
      </div>
    </button>
  );
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
  onClose,
  onSetOverride,
  onApplyPreset,
  onUpdateApp,
  categories,
}: AppDrawerProps) {
  const detected = detectDrawerPreset(app, profiles, overrides);
  const [preset, setPreset] = useState<DrawerPreset>(detected);
  useEffect(() => setPreset(detected), [detected]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const choosePreset = async (p: DrawerPreset) => {
    setPreset(p);
    if (p === 'custom') return;
    if (p === 'inherit') {
      await onApplyPreset('inherit');
      return;
    }
    await onApplyPreset(p);
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
          width: 520,
          height: '100%',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '22px 24px 18px',
          borderBottom: '1px solid var(--line)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}>
            <div style={labelStyle}>
              {app.effectiveCategory ?? 'Uncategorized'}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <AppGlyph name={app.displayName} size={44} />
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                color: 'var(--ink)',
                letterSpacing: '-0.01em',
              }}>
                {app.displayName}
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--muted)',
                marginTop: 3,
                fontFamily: 'var(--font-mono)',
              }}>
                {app.executableName ?? app.appKey} · {app.classificationStatus}
                {app.lastSeenRunningAt && (
                  <>
                    {' '}· last seen{' '}
                    {new Date(app.lastSeenRunningAt).toLocaleDateString()}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 80px' }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Category</div>
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
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>
              Rule for this app
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {DRAWER_PRESETS.map((p) => (
                <PresetOption
                  key={p.id}
                  label={p.label}
                  hint={p.hint}
                  selected={preset === p.id}
                  onClick={() => choosePreset(p.id)}
                />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>
              Per-profile behavior
            </div>
            <div style={{
              border: '1px solid var(--line)',
              borderRadius: 8,
              background: 'var(--bg-raise)',
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
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      alignItems: 'center',
                      padding: '13px 14px',
                      borderBottom:
                        i < profiles.length - 1
                          ? '1px solid var(--line)'
                          : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                        {p.name === 'deep_work'
                          ? 'Deep Work'
                          : p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        marginTop: 2,
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {p.parentName && (
                          <span>inherits from {p.parentName} · </span>
                        )}
                        {direct
                          ? `override: ${direct.decision}`
                          : 'follows category'}
                      </div>
                    </div>
                    {preset === 'custom' ? (
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
                    ) : (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 9px',
                        borderRadius: 5,
                        border:
                          '1px solid ' +
                          (resolved === 'block'
                            ? 'var(--danger)'
                            : 'var(--ok)'),
                        background:
                          resolved === 'block'
                            ? 'color-mix(in oklch, var(--danger) 16%, transparent)'
                            : 'color-mix(in oklch, var(--ok) 16%, transparent)',
                        color:
                          resolved === 'block' ? 'var(--danger)' : 'var(--ok)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}>
                        {resolved === 'block' ? '✕ Blocked' : '✓ Allowed'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
