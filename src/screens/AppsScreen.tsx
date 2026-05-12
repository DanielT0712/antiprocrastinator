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
import type {
  AppCategory,
  ClassificationAction,
  EnforcementDecision,
  EnforcementProfile,
  EnforcementProfileOverride,
  KnownApp,
  KnownBrowserTarget,
} from '../api/types';
import { Icons } from '../components/Icons';
import {
  AppDrawer,
  CategoryDrawer,
  CategoryManagerModal,
  PendingBanner,
  ProfileMenu,
} from '../components/AppsExtras';

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  color: 'var(--faint)',
};

const PROFILE_DISPLAY: Record<string, string> = {
  rest: 'Rest',
  work: 'Work',
  deep_work: 'Deep Work',
  emergency: 'Emergency',
};

interface OverrideKey {
  profile: string;
  subjectType: 'app' | 'category' | 'browser_target';
  subjectKey: string;
}

function overrideMapKey(k: OverrideKey): string {
  return `${k.profile}::${k.subjectType}::${k.subjectKey}`;
}

type PresetId = 'always-allow' | 'block-work' | 'always-block' | 'custom';

const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'always-allow', label: 'Always allow', hint: 'Never blocked.' },
  {
    id: 'block-work',
    label: 'Block for work',
    hint: 'Allowed during rest, blocked during work and deep work.',
  },
  { id: 'always-block', label: 'Always block', hint: 'Blocked in every profile.' },
  { id: 'custom', label: 'Custom', hint: 'Different per profile.' },
];

function presetColor(p: PresetId): string {
  switch (p) {
    case 'always-allow':
      return 'var(--ok)';
    case 'always-block':
      return 'var(--danger)';
    case 'block-work':
      return 'var(--accent)';
    case 'custom':
      return 'var(--muted)';
  }
}

// Build the per-profile decision a preset implies. `null` means inherit / no override.
function presetDecisions(
  preset: PresetId,
  profileNames: string[],
): Record<string, EnforcementDecision | null> {
  const out: Record<string, EnforcementDecision | null> = {};
  for (const name of profileNames) {
    if (preset === 'always-allow') out[name] = 'allow';
    else if (preset === 'always-block') out[name] = 'block';
    else if (preset === 'block-work') {
      out[name] = name === 'rest' || name === 'emergency' ? 'allow' : 'block';
    } else {
      // custom — leave whatever's there alone, signalled by null
      out[name] = null;
    }
  }
  return out;
}

// Detect which preset most closely matches the current per-profile override map.
function detectPreset(
  decisionsByProfile: Record<string, EnforcementDecision | null>,
  profileNames: string[],
): PresetId | null {
  if (profileNames.length === 0) return null;
  const values = profileNames.map((n) => decisionsByProfile[n] ?? null);
  if (values.every((v) => v == null)) return null;
  if (values.every((v) => v === 'allow')) return 'always-allow';
  if (values.every((v) => v === 'block')) return 'always-block';
  const blockWork = profileNames.every((n) => {
    const d = decisionsByProfile[n] ?? null;
    if (n === 'rest' || n === 'emergency') return d === 'allow';
    return d === 'block';
  });
  if (blockWork) return 'block-work';
  return 'custom';
}

function NewProfileDialog({
  profiles,
  onClose,
  onCreate,
}: {
  profiles: EnforcementProfile[];
  onClose: () => void;
  onCreate: (name: string, parentName: string | null) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState<string | null>('work');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate(name.trim(), parent);
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
          width: 420,
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
          New profile
        </div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Name</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="e.g. focus_morning"
          style={inp}
        />
        <div style={{ ...labelStyle, marginTop: 14, marginBottom: 6 }}>
          Inherits from
        </div>
        <select
          value={parent ?? ''}
          onChange={(e) =>
            setParent(e.target.value === '' ? null : e.target.value)
          }
          style={inp}
        >
          <option value="">No parent</option>
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <div style={{
          marginTop: 18,
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
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
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            style={{
              padding: '7px 14px',
              background: busy || !name.trim() ? 'var(--line)' : 'var(--accent)',
              color:
                busy || !name.trim() ? 'var(--muted)' : 'oklch(0.18 0.04 60)',
              border: '1px solid var(--accent)',
              borderRadius: 5,
              fontSize: 12.5,
              cursor: busy || !name.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileTabs({
  profiles,
  active,
  onChange,
  onMenu,
  onAddProfile,
}: {
  profiles: EnforcementProfile[];
  active: string;
  onChange: (name: string) => void;
  onMenu: (profile: EnforcementProfile) => void;
  onAddProfile: () => void;
}) {
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      {profiles.map((p) => {
        const sel = p.name === active;
        return (
          <button
            key={p.name}
            onClick={() => onChange(p.name)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 11px',
              borderRadius: 6,
              border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--line)'),
              background: sel ? 'var(--accent-soft)' : 'transparent',
              color: sel ? 'var(--accent-ink)' : 'var(--ink)',
              fontSize: 12.5,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              fontWeight: sel ? 500 : 400,
            }}
          >
            {sel && (
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--accent)',
              }} />
            )}
            {PROFILE_DISPLAY[p.name] ?? p.name}
            {p.parentName && (
              <span style={{
                color: 'var(--faint)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}>
                ← {PROFILE_DISPLAY[p.parentName] ?? p.parentName}
              </span>
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                onMenu(p);
              }}
              title="Edit profile"
              style={{
                marginLeft: 2,
                padding: '0 2px',
                color: 'var(--faint)',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ⋯
            </span>
          </button>
        );
      })}
      <button
        onClick={onAddProfile}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '7px 10px',
          borderRadius: 6,
          background: 'transparent',
          border: '1px dashed var(--line)',
          color: 'var(--muted)',
          fontSize: 12.5,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
        }}
      >
        <Icons.plus size={13} /> New profile
      </button>
    </div>
  );
}

function DecisionToggle({
  current,
  onChange,
  hardLock,
}: {
  current: EnforcementDecision | null;
  onChange: (next: EnforcementDecision | null) => void;
  hardLock?: { lockedTo: EnforcementDecision; reason: string };
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
            title={blocked ? hardLock!.reason : undefined}
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

function presetChip(active: boolean, color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 9px',
    borderRadius: 5,
    border: '1px solid ' + (active ? color : 'var(--line)'),
    background: active
      ? `color-mix(in oklch, ${color} 16%, transparent)`
      : 'transparent',
    color: active ? color : 'var(--muted)',
    fontSize: 11.5,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    whiteSpace: 'nowrap',
  };
}

function appmgmtChip(active: boolean, color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 9px',
    borderRadius: 4,
    border: '1px solid ' + color,
    background: `color-mix(in oklch, ${color} 18%, transparent)`,
    color,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    pointerEvents: active ? 'auto' : 'none',
    opacity: active ? 1 : 0.5,
  };
}

interface CategorySectionProps {
  category: AppCategory;
  apps: KnownApp[];
  activeProfile: string;
  profileNames: string[];
  isEmergency: boolean;
  emergencyBlockedCategories: string[];
  overrides: Map<string, EnforcementProfileOverride>;
  onApplyPreset: (
    subjectType: 'app' | 'category',
    subjectKey: string,
    preset: PresetId,
  ) => void;
  onClearAppOverrides: (appKey: string) => void;
  onOpenCategoryManager: () => void;
  onOpenCategoryDrawer: (category: AppCategory) => void;
  onDragStartApp: () => void;
  onOpenApp: (appKey: string, mode: AppRowMode) => void;
}

function decisionsFor(
  subjectType: 'app' | 'category' | 'browser_target',
  subjectKey: string,
  profileNames: string[],
  overrides: Map<string, EnforcementProfileOverride>,
): Record<string, EnforcementDecision | null> {
  const out: Record<string, EnforcementDecision | null> = {};
  for (const name of profileNames) {
    out[name] =
      overrides.get(
        overrideMapKey({ profile: name, subjectType, subjectKey }),
      )?.decision ?? null;
  }
  return out;
}

function CategorySection({
  category,
  apps,
  activeProfile,
  profileNames,
  isEmergency,
  emergencyBlockedCategories,
  overrides,
  onApplyPreset,
  onClearAppOverrides,
  onOpenCategoryManager,
  onOpenCategoryDrawer,
  onDragStartApp,
  onOpenApp,
}: CategorySectionProps) {
  const [open, setOpen] = useState(false);
  const hardLocked =
    isEmergency &&
    emergencyBlockedCategories.some(
      (c) => c.toLowerCase() === category.name.toLowerCase(),
    );

  const categoryDecisions = decisionsFor(
    'category',
    category.name,
    profileNames,
    overrides,
  );
  const categoryPreset = hardLocked
    ? 'always-block'
    : detectPreset(categoryDecisions, profileNames) ?? 'custom';
  const overriddenCount = apps.filter((app) => {
    return profileNames.some(
      (n) =>
        overrides.get(
          overrideMapKey({
            profile: n,
            subjectType: 'app',
            subjectKey: app.appKey,
          }),
        ) != null,
    );
  }).length;

  const verdictForActive: EnforcementDecision = hardLocked
    ? 'block'
    : categoryDecisions[activeProfile] ??
      (categoryPreset === 'always-allow' ||
      (categoryPreset === 'block-work' &&
        (activeProfile === 'rest' || activeProfile === 'emergency'))
        ? 'allow'
        : 'block');

  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 9,
      background: 'var(--bg-raise)',
      overflow: 'hidden',
      marginBottom: 10,
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: 14,
          color: 'var(--ink)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{
          color: 'var(--muted)',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 120ms ease',
        }}>
          <Icons.chevron size={14} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14,
            color: 'var(--ink)',
            fontWeight: 500,
            marginBottom: 3,
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
          }}>
            {category.name}
            <span style={{
              fontSize: 11,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              {apps.length} {apps.length === 1 ? 'item' : 'items'}
              {overriddenCount > 0 && (
                <span style={{ marginLeft: 8 }}>
                  · {overriddenCount} overridden
                </span>
              )}
            </span>
          </div>
          {!open && apps.length > 0 && (
            <div style={{
              fontSize: 11.5,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {apps.slice(0, 4).map((a) => a.displayName).join(' · ')}
              {apps.length > 4 && ' · +' + (apps.length - 4) + ' more'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...labelStyle, fontSize: 10 }}>
            {PROFILE_DISPLAY[activeProfile] ?? activeProfile}
          </div>
          <div style={appmgmtChip(
            true,
            verdictForActive === 'block' ? 'var(--danger)' : 'var(--ok)',
          )}>
            {verdictForActive === 'block' ? '✕ Blocked' : '✓ Allowed'}
          </div>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--line)' }}>
          <div style={{
            padding: '12px 16px',
            background: 'color-mix(in oklch, var(--ink) 3%, transparent)',
            borderBottom: '1px solid var(--line)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}>
              <div style={{ ...labelStyle, color: 'var(--muted)' }}>Category rule</div>
              {PRESETS.map((p) => {
                const active = categoryPreset === p.id;
                const blockedByEmergency =
                  hardLocked && p.id !== 'always-block';
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (blockedByEmergency) return;
                      if (p.id === 'custom') {
                        onOpenCategoryDrawer(category);
                        return;
                      }
                      onApplyPreset('category', category.name, p.id);
                    }}
                    title={
                      blockedByEmergency
                        ? `${category.name} apps must stay blocked during emergency.`
                        : p.hint
                    }
                    disabled={blockedByEmergency}
                    style={{
                      ...presetChip(active, presetColor(p.id)),
                      opacity: blockedByEmergency ? 0.4 : 1,
                      cursor: blockedByEmergency ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              <button
                onClick={onOpenCategoryManager}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
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
                title="Open category manager"
              >
                <Icons.tweak size={13} /> Manage…
              </button>
            </div>
            <div style={{
              marginTop: 8,
              fontSize: 11.5,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
            }}>
              <span>Resolved:</span>
              {profileNames.map((n) => {
                const d = hardLocked
                  ? 'block'
                  : categoryDecisions[n] ??
                    (categoryPreset === 'always-allow' ||
                    (categoryPreset === 'block-work' &&
                      (n === 'rest' || n === 'emergency'))
                      ? 'allow'
                      : 'block');
                return (
                  <span key={n}>
                    {(PROFILE_DISPLAY[n] ?? n).toLowerCase()} →{' '}
                    <span style={{
                      color: d === 'block' ? 'var(--danger)' : 'var(--ok)',
                    }}>
                      {d}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
          {apps.length === 0 ? (
            <div style={{
              padding: '14px 18px',
              fontSize: 12,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              No apps tagged in this category yet.
            </div>
          ) : (
            apps.map((app) => (
              <AppRow
                key={app.appKey}
                app={app}
                profileNames={profileNames}
                activeProfile={activeProfile}
                hardLocked={hardLocked}
                overrides={overrides}
                categoryPreset={categoryPreset}
                onApplyAppPreset={(p) =>
                  onApplyPreset('app', app.appKey, p)
                }
                onClearAppOverrides={() => onClearAppOverrides(app.appKey)}
                onDragStartApp={onDragStartApp}
                onOpenApp={(mode) => onOpenApp(app.appKey, mode)}
              />
            ))
          )}
          <button
            onClick={() =>
              alert(
                'Use Refresh installed apps below to import apps into ' +
                  category.name +
                  ', or open an app drawer to retag it.',
              )
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              width: '100%',
              padding: '11px 16px',
              background: 'transparent',
              border: 'none',
              borderTop: '1px dashed var(--line)',
              color: 'var(--muted)',
              fontSize: 12.5,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Icons.plus size={13} /> Add to this category
          </button>
        </div>
      )}
    </div>
  );
}

type AppRowMode = 'edit' | 'edit-custom';

function AppRow({
  app,
  profileNames,
  activeProfile,
  hardLocked,
  overrides,
  categoryPreset,
  onApplyAppPreset,
  onClearAppOverrides,
  onDragStartApp,
  onOpenApp,
}: {
  app: KnownApp;
  profileNames: string[];
  activeProfile: string;
  hardLocked: boolean;
  overrides: Map<string, EnforcementProfileOverride>;
  categoryPreset: PresetId;
  onApplyAppPreset: (preset: PresetId) => void;
  onClearAppOverrides: () => void;
  onDragStartApp: () => void;
  onOpenApp: (mode: AppRowMode) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const appDecisions = decisionsFor(
    'app',
    app.appKey,
    profileNames,
    overrides,
  );
  const appPreset = detectPreset(appDecisions, profileNames);
  const inherited = appPreset == null;
  const effectivePreset: PresetId = appPreset ?? categoryPreset;
  const presetText = inherited
    ? 'Follows category'
    : PRESETS.find((p) => p.id === effectivePreset)?.label ?? effectivePreset;
  const verdict: EnforcementDecision = hardLocked
    ? 'block'
    : appDecisions[activeProfile] ??
      (effectivePreset === 'always-allow' ||
      (effectivePreset === 'block-work' &&
        (activeProfile === 'rest' || activeProfile === 'emergency'))
        ? 'allow'
        : 'block');

  const [iconData, setIconData] = useState<string | null>(null);
  const [shouldFetchIcon, setShouldFetchIcon] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const looksLikeBundle = !!app.appPath && app.appPath.endsWith('.app');

  // Only fetch the icon once the row scrolls into view, otherwise opening a
  // long list would fan out hundreds of subprocess spawns on the backend.
  useEffect(() => {
    if (!looksLikeBundle || shouldFetchIcon) return;
    const node = rowRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldFetchIcon(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '64px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [looksLikeBundle, shouldFetchIcon]);

  useEffect(() => {
    if (!shouldFetchIcon) return;
    let cancelled = false;
    api
      .getAppIcon(app.appKey)
      .then((data) => {
        if (!cancelled) setIconData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [app.appKey, shouldFetchIcon]);

  const quickPresets: { id: PresetId | 'inherit'; label: string; hint: string }[] = [
    {
      id: 'inherit',
      label: 'Follow category',
      hint: `Inherits "${PRESETS.find((x) => x.id === categoryPreset)?.label ?? categoryPreset}" from the category`,
    },
    { id: 'always-allow', label: 'Always allow', hint: 'Never blocked, any profile' },
    { id: 'block-work', label: 'Block for work', hint: 'Blocked during Work and Deep Work' },
    { id: 'always-block', label: 'Always block', hint: 'Blocked in every profile' },
  ];

  return (
    <div
      ref={rowRef}
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      {/* main row */}
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/app-key', app.appKey);
          e.dataTransfer.effectAllowed = 'move';
          onDragStartApp();
        }}
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr auto auto 16px',
          alignItems: 'center',
          gap: 12,
          padding: '11px 16px',
          cursor: 'pointer',
          background: expanded
            ? 'color-mix(in oklch, var(--ink) 3%, transparent)'
            : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!expanded)
            e.currentTarget.style.background =
              'color-mix(in oklch, var(--ink) 3%, transparent)';
        }}
        onMouseLeave={(e) => {
          if (!expanded) e.currentTarget.style.background = 'transparent';
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            background: iconData
              ? 'transparent'
              : 'color-mix(in oklch, var(--ink) 6%, transparent)',
            color: 'var(--muted)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {iconData ? (
            <img
              src={iconData}
              alt=""
              style={{ width: 28, height: 28, objectFit: 'contain' }}
            />
          ) : (
            (app.displayName || app.appKey).charAt(0).toUpperCase()
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {app.displayName}
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            marginTop: 2,
          }}>
            {app.executableName ?? app.appKey} · {app.classificationStatus}
          </div>
        </div>
        <div style={{
          fontSize: 11.5,
          color: inherited ? 'var(--muted)' : presetColor(effectivePreset),
          fontFamily: 'var(--font-mono)',
          fontStyle: inherited ? 'italic' : 'normal',
        }}>
          {presetText}
        </div>
        <div style={appmgmtChip(
          true,
          verdict === 'block' ? 'var(--danger)' : 'var(--ok)',
        )}>
          {verdict === 'block' ? 'Blocked' : 'Allowed'}
        </div>
        <span style={{
          color: 'var(--faint)',
          display: 'inline-block',
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 140ms ease',
        }}>
          <Icons.chevron size={13} />
        </span>
      </div>

      {/* expanded panel */}
      {expanded && (
        <div style={{
          padding: '12px 16px 14px 54px',
          background: 'color-mix(in oklch, var(--ink) 4%, transparent)',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          <span style={{ ...labelStyle, marginRight: 2 }}>Rule</span>
          {quickPresets.map((p) => {
            const isActive =
              p.id === 'inherit' ? inherited : appPreset === p.id;
            const color =
              p.id === 'inherit'
                ? 'var(--muted)'
                : p.id === 'always-allow'
                ? 'var(--ok)'
                : p.id === 'block-work'
                ? 'var(--accent)'
                : 'var(--danger)';
            return (
              <button
                key={p.id}
                title={p.hint}
                onClick={(e) => {
                  e.stopPropagation();
                  if (p.id === 'inherit') {
                    onClearAppOverrides();
                    return;
                  }
                  onApplyAppPreset(p.id);
                }}
                style={presetChip(isActive, color)}
              >
                {p.label}
              </button>
            );
          })}
          <button
            title="Set different rules per profile"
            onClick={(e) => {
              e.stopPropagation();
              onOpenApp('edit-custom');
            }}
            style={{
              ...presetChip(appPreset === 'custom', 'var(--muted)'),
              borderStyle: 'dashed',
            }}
          >
            Custom…
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenApp('edit');
            }}
            style={{
              padding: '5px 10px',
              borderRadius: 5,
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--muted)',
              fontSize: 11.5,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Edit settings →
          </button>
        </div>
      )}
    </div>
  );
}

type AppsTab = 'apps' | 'browser_targets';

const CLASSIFICATION_OPTIONS: { v: ClassificationAction; l: string }[] = [
  { v: 'unclassified', l: 'Unclassified' },
  { v: 'always_ban', l: 'Always block' },
  { v: 'ban_during_work', l: 'Block during work' },
  { v: 'never_ban', l: 'Never block' },
];

function BrowserTargetRow({
  target,
  categories,
  activeProfile,
  isEmergency,
  emergencyBlockedCategories,
  override,
  onUpdate,
  onSetOverride,
}: {
  target: KnownBrowserTarget;
  categories: AppCategory[];
  activeProfile: string;
  isEmergency: boolean;
  emergencyBlockedCategories: string[];
  override: EnforcementProfileOverride | undefined;
  onUpdate: (
    key: string,
    patch: { categoryName?: string | null; classificationAction?: ClassificationAction },
  ) => void;
  onSetOverride: (
    key: { profile: string; subjectType: 'browser_target'; subjectKey: string },
    decision: EnforcementDecision | null,
  ) => void;
}) {
  const overrideKey = {
    profile: activeProfile,
    subjectType: 'browser_target' as const,
    subjectKey: target.targetKey,
  };
  const decision = override?.decision ?? null;
  const hardLocked =
    isEmergency &&
    target.categoryName != null &&
    emergencyBlockedCategories.some(
      (c) => c.toLowerCase() === target.categoryName!.toLowerCase(),
    );

  return (
    <tr style={{ borderBottom: '1px solid var(--line)' }}>
      <td style={td}>
        <div style={{
          color: 'var(--ink)',
          fontWeight: 500,
          fontSize: 13,
        }}>
          {target.displayName}
        </div>
        <div style={{
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          marginTop: 2,
        }}>
          {target.targetKey}
          {target.builtin && (
            <span style={{
              marginLeft: 8,
              padding: '0 5px',
              border: '1px solid var(--line)',
              borderRadius: 3,
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--faint)',
            }}>
              builtin
            </span>
          )}
        </div>
      </td>
      <td style={td}>
        <input
          defaultValue={target.keyword}
          onBlur={(e) => {
            const val = e.target.value.trim();
            if (val !== target.keyword)
              onUpdate(target.targetKey, { categoryName: target.categoryName });
            // keyword update wired via separate updateKnownBrowserTarget if needed
          }}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 5,
            padding: '6px 8px',
            fontSize: 12,
            color: 'var(--ink)',
            outline: 'none',
            fontFamily: 'var(--font-mono)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
      </td>
      <td style={td}>
        <select
          value={target.categoryName ?? ''}
          onChange={(e) =>
            onUpdate(target.targetKey, {
              categoryName: e.target.value === '' ? null : e.target.value,
            })
          }
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 5,
            padding: '6px 8px',
            fontSize: 12,
            color: 'var(--ink)',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td style={td}>
        <select
          value={target.classificationAction}
          onChange={(e) =>
            onUpdate(target.targetKey, {
              classificationAction: e.target.value as ClassificationAction,
            })
          }
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 5,
            padding: '6px 8px',
            fontSize: 12,
            color: 'var(--ink)',
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {CLASSIFICATION_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      </td>
      <td style={td}>
        <DecisionToggle
          current={decision}
          hardLock={
            hardLocked
              ? {
                  lockedTo: 'block',
                  reason: `${target.categoryName} targets cannot be allowed during emergency.`,
                }
              : undefined
          }
          onChange={(next) => onSetOverride(overrideKey, next)}
        />
      </td>
    </tr>
  );
}

interface AddTargetModalProps {
  categories: AppCategory[];
  onClose: () => void;
  onCreate: (target: {
    displayName: string;
    keyword: string;
    categoryName: string | null;
    classificationAction: ClassificationAction;
  }) => Promise<void>;
}

interface AddAppModalProps {
  categories: AppCategory[];
  profiles: EnforcementProfile[];
  emergencyBlockedCategories: string[];
  onClose: () => void;
  onCreate: (input: {
    displayName: string;
    executableName: string | null;
    categoryNames: string[];
    rule: PresetId;
    customRules: Record<string, EnforcementDecision>;
  }) => Promise<void>;
}

function AddAppModal({
  categories,
  profiles,
  emergencyBlockedCategories,
  onClose,
  onCreate,
}: AddAppModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [executableName, setExecutableName] = useState('');
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => !c.builtin)?.name ?? categories[0]?.name ?? '',
  );
  const [rule, setRule] = useState<PresetId>('block-work');
  const [customRules, setCustomRules] = useState<
    Record<string, EnforcementDecision>
  >({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const canSubmit = displayName.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await onCreate({
        displayName: displayName.trim(),
        executableName: executableName.trim() || null,
        categoryNames: categoryName ? [categoryName] : [],
        rule,
        customRules,
      });
      onClose();
    } catch (err) {
      setBusy(false);
    }
  };

  const RULES: { id: PresetId; label: string; hint: string }[] = [
    { id: 'always-allow', label: 'Always allow', hint: 'Never blocked.' },
    { id: 'block-work', label: 'Block for work', hint: 'Blocked during Work and Deep Work.' },
    { id: 'always-block', label: 'Always block', hint: 'Blocked in every profile.' },
    { id: 'custom', label: 'Custom', hint: 'Set per-profile below.' },
  ];

  const fLabel: CSSProperties = {
    display: 'block',
    fontSize: 10.5,
    color: 'var(--muted)',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: 7,
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
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
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
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--muted)',
            marginBottom: 6,
          }}>
            Apps
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            color: 'var(--ink)',
            letterSpacing: '-0.015em',
          }}>
            Add app
          </div>
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
            <label style={fLabel}>App name</label>
            <input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Slack"
              style={{
                width: '100%',
                padding: '9px 11px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                color: 'var(--ink)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={fLabel}>Executable name (optional)</label>
            <input
              value={executableName}
              onChange={(e) => setExecutableName(e.target.value)}
              placeholder="e.g. Slack.app (helps with detection)"
              style={{
                width: '100%',
                padding: '9px 11px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                color: 'var(--ink)',
                fontSize: 13,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={fLabel}>Category</label>
            <select
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 11px',
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 6,
                color: 'var(--ink)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={fLabel}>Rule</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {RULES.map((r) => {
                const isActive = rule === r.id;
                const color =
                  r.id === 'always-allow'
                    ? 'var(--ok)'
                    : r.id === 'block-work'
                    ? 'var(--accent)'
                    : r.id === 'always-block'
                    ? 'var(--danger)'
                    : 'var(--muted)';
                return (
                  <button
                    key={r.id}
                    type="button"
                    title={r.hint}
                    onClick={() => setRule(r.id)}
                    style={{
                      flex: 1,
                      padding: '9px 6px',
                      borderRadius: 7,
                      textAlign: 'center',
                      border:
                        '1px solid ' + (isActive ? color : 'var(--line)'),
                      background: isActive
                        ? `color-mix(in oklch, ${color} 14%, transparent)`
                        : 'var(--bg)',
                      color: isActive ? color : 'var(--muted)',
                      fontSize: 12.5,
                      fontFamily: 'var(--font-sans)',
                      fontWeight: isActive ? 500 : 400,
                      cursor: 'pointer',
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {rule === 'custom' && (
            <div>
              <label style={fLabel}>Per-profile rules</label>
              <div style={{
                border: '1px solid var(--accent)',
                borderRadius: 8,
                background: 'var(--bg)',
                overflow: 'hidden',
              }}>
                {profiles.map((p, i) => {
                  const blocked =
                    p.name === 'emergency' &&
                    categoryName != null &&
                    emergencyBlockedCategories.some(
                      (c) => c.toLowerCase() === categoryName.toLowerCase(),
                    );
                  const v = customRules[p.name] ?? 'allow';
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
                          {PROFILE_DISPLAY[p.name] ?? p.name}
                          {p.parentName && (
                            <span style={{
                              fontSize: 10.5,
                              color: 'var(--faint)',
                              fontFamily: 'var(--font-mono)',
                            }}>
                              ← {PROFILE_DISPLAY[p.parentName] ?? p.parentName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        border: '1px solid var(--line)',
                        borderRadius: 6,
                        overflow: 'hidden',
                        background: 'var(--bg)',
                      }}>
                        {(['allow', 'block'] as EnforcementDecision[]).map(
                          (d) => {
                            const sel = v === d;
                            const disabled = blocked && d !== 'block';
                            return (
                              <button
                                key={d}
                                disabled={disabled}
                                onClick={() => {
                                  if (disabled) return;
                                  setCustomRules((prev) => ({
                                    ...prev,
                                    [p.name]: d,
                                  }));
                                }}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: 11.5,
                                  background: sel
                                    ? d === 'allow'
                                      ? 'var(--accent-soft)'
                                      : 'color-mix(in oklch, var(--danger) 16%, transparent)'
                                    : 'transparent',
                                  color: sel
                                    ? d === 'allow'
                                      ? 'var(--accent-ink)'
                                      : 'var(--danger)'
                                    : 'var(--muted)',
                                  border: 'none',
                                  borderLeft:
                                    d === 'block'
                                      ? '1px solid var(--line)'
                                      : 'none',
                                  cursor: disabled ? 'not-allowed' : 'pointer',
                                  opacity: disabled ? 0.4 : 1,
                                  fontFamily: 'var(--font-sans)',
                                }}
                              >
                                {d === 'allow' ? 'Allow' : 'Block'}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
            disabled={!canSubmit || busy}
            onClick={submit}
            style={{
              padding: '8px 14px',
              background: canSubmit ? 'var(--ink)' : 'var(--line)',
              color: canSubmit ? 'var(--bg)' : 'var(--muted)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 500,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {busy ? 'Adding…' : 'Add app'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddBrowserTargetModal({ categories, onClose, onCreate }: AddTargetModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [action, setAction] = useState<ClassificationAction>('unclassified');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const submit = async () => {
    if (busy || !displayName.trim() || !keyword.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        displayName: displayName.trim(),
        keyword: keyword.trim(),
        categoryName: categoryName === '' ? null : categoryName,
        classificationAction: action,
      });
      onClose();
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
          Add browser target
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Display name</div>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Hacker News"
              style={inp}
            />
          </div>
          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Keyword</div>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="match against window title"
              style={{ ...inp, fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Category</div>
              <select
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                style={inp}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Classification</div>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as ClassificationAction)}
                style={inp}
              >
                {CLASSIFICATION_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
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
            disabled={busy || !displayName.trim() || !keyword.trim()}
            style={{
              padding: '8px 14px',
              background:
                busy || !displayName.trim() || !keyword.trim()
                  ? 'var(--line)'
                  : 'var(--accent)',
              color:
                busy || !displayName.trim() || !keyword.trim()
                  ? 'var(--muted)'
                  : 'oklch(0.18 0.04 60)',
              border: '1px solid var(--accent)',
              borderRadius: 5,
              fontSize: 13,
              cursor:
                busy || !displayName.trim() || !keyword.trim()
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            Add target
          </button>
        </div>
      </div>
    </div>
  );
}

const td: CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
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
  background: 'var(--bg)',
};

export function AppsScreen() {
  const [tab, setTab] = useState<AppsTab>('apps');
  const [profiles, setProfiles] = useState<EnforcementProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>('work');
  const [apps, setApps] = useState<KnownApp[]>([]);
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const [overrides, setOverrides] = useState<EnforcementProfileOverride[]>([]);
  const [emergencyBlockedCategories, setEmergencyBlocked] = useState<string[]>([]);
  const [browserTargets, setBrowserTargets] = useState<KnownBrowserTarget[]>([]);
  const [pendingApps, setPendingApps] = useState<KnownApp[]>([]);
  const [pendingTargets, setPendingTargets] = useState<KnownBrowserTarget[]>([]);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [openApp, setOpenApp] = useState<{
    appKey: string;
    mode: AppRowMode;
  } | null>(null);
  const [drawerCategory, setDrawerCategory] = useState<{
    category: AppCategory;
    presetIntent?: 'custom';
  } | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [profileMenuName, setProfileMenuName] = useState<string | null>(null);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same dynamic-min-size dance as the Today rail on Home: when the
  // category side panel opens we widen the minimum and pull the window
  // out if it's too narrow, so the panel never gets clipped.
  useEffect(() => {
    (async () => {
      try {
        const { getCurrentWebviewWindow } = await import(
          '@tauri-apps/api/webviewWindow'
        );
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWebviewWindow();
        const closedMin = 1000;
        const panelWidth = 280;
        const targetMin = categoryManagerOpen
          ? closedMin + panelWidth
          : closedMin;
        await win.setMinSize(new LogicalSize(targetMin, 680));
        const currentSize = await win.innerSize();
        const factor = await win.scaleFactor();
        const logicalWidth = currentSize.width / factor;
        if (categoryManagerOpen && logicalWidth < targetMin) {
          await win.setSize(
            new LogicalSize(
              targetMin,
              Math.max(680, currentSize.height / factor),
            ),
          );
        }
      } catch (err) {
        console.warn('[apps] dynamic window resize failed:', err);
      }
    })();
  }, [categoryManagerOpen]);

  const refresh = useCallback(async () => {
    try {
      const [p, a, c, o, eb, bt, pending] = await Promise.all([
        api.getEnforcementProfiles(),
        api.getKnownApps(),
        api.getAppCategories(),
        api.getEnforcementProfileOverrides(),
        api.getEmergencyBlockedCategories(),
        api.getKnownBrowserTargets(),
        api.getPendingClassifications(),
      ]);
      setProfiles(p);
      setApps(a);
      setCategories(c);
      setOverrides(o);
      setEmergencyBlocked(eb);
      setBrowserTargets(bt);
      // Pending banner should only surface apps detected AFTER the
      // first inventory sweep. On the very first launch we initialise
      // the marker to now so the user isn't greeted by a banner full of
      // apps they already knew were installed; later sweeps add new
      // arrivals (first_seen_at > marker) to the banner.
      const FIRST_SWEEP_KEY = 'ap-first-sweep-ms';
      let firstSweepAt = Number(localStorage.getItem(FIRST_SWEEP_KEY));
      if (!firstSweepAt || Number.isNaN(firstSweepAt)) {
        firstSweepAt = Date.now();
        localStorage.setItem(FIRST_SWEEP_KEY, String(firstSweepAt));
      }
      setPendingApps(
        (pending.apps ?? []).filter(
          (app) => (app.firstSeenAt ?? 0) > firstSweepAt,
        ),
      );
      setPendingTargets(
        (pending.browserTargets ?? []).filter(
          (t) => (t.firstSeenAt ?? 0) > firstSweepAt,
        ),
      );
      if (!p.find((profile) => profile.name === activeProfile) && p.length > 0) {
        setActiveProfile(p[0].name);
      }
    } catch (err) {
      setError(String(err));
    }
  }, [activeProfile]);

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const overrideMap = useMemo(() => {
    const map = new Map<string, EnforcementProfileOverride>();
    for (const o of overrides) {
      map.set(
        overrideMapKey({
          profile: o.profileName,
          subjectType: o.subjectType,
          subjectKey: o.subjectKey,
        }),
        o,
      );
    }
    return map;
  }, [overrides]);

  const filteredApps = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return apps;
    return apps.filter((a) => {
      if (a.displayName.toLowerCase().includes(qq)) return true;
      if (a.executableName?.toLowerCase().includes(qq)) return true;
      if (a.effectiveCategory?.toLowerCase().includes(qq)) return true;
      return false;
    });
  }, [apps, q]);

  const filteredBrowserTargets = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return browserTargets;
    return browserTargets.filter((t) => {
      if (t.displayName.toLowerCase().includes(qq)) return true;
      if (t.keyword.toLowerCase().includes(qq)) return true;
      return false;
    });
  }, [browserTargets, q]);

  const appsByCategory = useMemo(() => {
    const map = new Map<string, KnownApp[]>();
    for (const c of categories) map.set(c.name, []);
    map.set('Uncategorized', []);
    for (const app of filteredApps) {
      const cat = app.effectiveCategory ?? 'Uncategorized';
      const list = map.get(cat) ?? [];
      list.push(app);
      map.set(cat, list);
    }
    return map;
  }, [filteredApps, categories]);

  const setOverride = async (
    key: OverrideKey,
    decision: EnforcementDecision | null,
  ) => {
    try {
      if (decision == null) {
        await api.deleteEnforcementProfileOverride(
          key.profile,
          key.subjectType,
          key.subjectKey,
        );
      } else {
        await api.setEnforcementProfileOverride({ ...key, profileName: key.profile, decision });
      }
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const profileNames = useMemo(() => profiles.map((p) => p.name), [profiles]);

  const applyPreset = async (
    subjectType: 'app' | 'category' | 'browser_target',
    subjectKey: string,
    preset: PresetId,
  ) => {
    try {
      if (preset === 'custom') {
        // Custom = preserve existing per-profile decisions; no-op.
        // User edits per profile via the AppDrawer or per-profile toggles.
        return;
      }
      const decisions = presetDecisions(preset, profileNames);
      for (const profile of profileNames) {
        const dec = decisions[profile];
        if (dec == null) {
          await api.deleteEnforcementProfileOverride(
            profile,
            subjectType,
            subjectKey,
          );
        } else {
          await api.setEnforcementProfileOverride({
            profileName: profile,
            subjectType,
            subjectKey,
            decision: dec,
          });
        }
      }
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const clearAppOverrides = async (appKey: string) => {
    try {
      for (const profile of profileNames) {
        await api.deleteEnforcementProfileOverride(profile, 'app', appKey);
      }
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const isEmergency = activeProfile === 'emergency';

  const updateBrowserTarget = async (
    key: string,
    patch: { categoryName?: string | null; classificationAction?: ClassificationAction },
  ) => {
    try {
      await api.updateKnownBrowserTarget(key, patch);
      refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  const createBrowserTarget = async (target: {
    displayName: string;
    keyword: string;
    categoryName: string | null;
    classificationAction: ClassificationAction;
  }) => {
    try {
      await api.createKnownBrowserTarget(target);
      refresh();
    } catch (err) {
      setError(String(err));
      throw err;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        padding: '24px 36px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        borderBottom: '1px solid var(--line)',
      }}>
        {/* tabs + toolbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'flex',
            gap: 2,
            position: 'relative',
            marginBottom: -17,
            paddingBottom: 16,
          }}>
            {(['apps', 'browser_targets'] as AppsTab[]).map((id) => {
              const sel = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '10px 2px',
                    marginRight: 20,
                    color: sel ? 'var(--ink)' : 'var(--muted)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    fontWeight: sel ? 500 : 400,
                    cursor: 'pointer',
                    position: 'relative',
                    borderBottom:
                      '2px solid ' + (sel ? 'var(--accent)' : 'transparent'),
                  }}
                >
                  {id === 'apps' ? 'Apps' : 'Browser Targets'}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 11px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: 'var(--bg-raise)',
              width: 240,
            }}>
              <span style={{ color: 'var(--faint)' }}>
                <Icons.search size={13} />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  tab === 'apps' ? 'Search apps…' : 'Search sites…'
                }
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--ink)',
                  fontSize: 12.5,
                }}
              />
            </div>
            <button
              onClick={() => setCategoryManagerOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
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
              <Icons.tweak size={13} /> Manage categories
            </button>
            <button
              onClick={() => setAdding(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 12px',
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
              <Icons.plus size={13} /> Add {tab === 'apps' ? 'app' : 'site'}
            </button>
          </div>
        </div>

        {/* profile selector + rules-shown-for */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--muted)',
            }}>
              Active profile
            </div>
            <ProfileTabs
              profiles={profiles}
              active={activeProfile}
              onChange={setActiveProfile}
              onMenu={(p) => setProfileMenuName(p.name)}
              onAddProfile={() => setCreatingProfile(true)}
            />
          </div>
          <div style={{
            fontSize: 11.5,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            Rules shown for{' '}
            <span style={{ color: 'var(--accent-ink)' }}>
              {PROFILE_DISPLAY[activeProfile] ?? activeProfile}
            </span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 36px 60px' }}>
        <div style={{ maxWidth: 1080 }}>
          {isEmergency && (
            <div style={{
              padding: '12px 14px',
              border: '1px solid color-mix(in oklch, var(--danger) 50%, var(--line))',
              borderRadius: 8,
              marginBottom: 16,
              background: 'color-mix(in oklch, var(--danger) 10%, var(--bg-raise))',
              fontSize: 12.5,
              color: 'var(--ink)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.55,
            }}>
              Emergency mode opens the rest of the system temporarily. Categories that pull
              you away from work — Games and Entertainment — stay blocked even if you try to
              flip them. Use this for messaging, banking, urgent comms.
            </div>
          )}

          {tab === 'apps' && (
            <>
              <PendingBanner
                apps={pendingApps}
                browserTargets={pendingTargets}
                isBrowserTab={false}
                onOpenApp={(app) =>
                  setOpenApp({ appKey: app.appKey, mode: 'edit' })
                }
                onAcceptApp={async (app) => {
                  try {
                    await api.updateKnownApp(app.appKey, {
                      classificationStatus: 'confirmed',
                    });
                    refresh();
                  } catch (err) {
                    setError(String(err));
                  }
                }}
                onAcceptBrowserTarget={async (target) => {
                  // Browser targets don't have a confirmed status in the
                  // backend yet; for now just re-affirm the classification
                  // and refresh.
                  try {
                    await api.updateKnownBrowserTarget(target.targetKey, {
                      classificationAction: target.classificationAction,
                    });
                    refresh();
                  } catch (err) {
                    setError(String(err));
                  }
                }}
              />
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  Categories
                </span>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => setCategoryManagerOpen(true)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--bg-raise)',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    color: 'var(--ink)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Manage categories
                </button>
              </div>
              {[
                ...categories,
                { name: 'Uncategorized', builtin: false, createdAt: 0, updatedAt: 0 },
              ].map((cat) => (
                <CategorySection
                  key={cat.name}
                  category={cat as AppCategory}
                  apps={appsByCategory.get(cat.name) ?? []}
                  activeProfile={activeProfile}
                  profileNames={profileNames}
                  isEmergency={isEmergency}
                  emergencyBlockedCategories={emergencyBlockedCategories}
                  overrides={overrideMap}
                  onApplyPreset={(t, k, p) => applyPreset(t, k, p)}
                  onClearAppOverrides={(appKey) => clearAppOverrides(appKey)}
                  onOpenCategoryManager={() => setCategoryManagerOpen(true)}
                  onOpenCategoryDrawer={(c) =>
                    setDrawerCategory({ category: c })
                  }
                  onDragStartApp={() => setCategoryManagerOpen(true)}
                  onOpenApp={(appKey, mode) =>
                    setOpenApp({ appKey, mode })
                  }
                />
              ))}

              {apps.length === 0 && (
                <div style={{
                  padding: '60px 20px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: 13,
                }}>
                  <div>No known apps yet.</div>
                  <button
                    onClick={() => {
                      api
                        .refreshKnownAppsInventory()
                        .then(() => refresh())
                        .catch((err) => setError(String(err)));
                    }}
                    style={{
                      marginTop: 14,
                      padding: '8px 16px',
                      background: 'var(--accent)',
                      color: 'oklch(0.18 0.04 60)',
                      border: '1px solid var(--accent)',
                      borderRadius: 6,
                      fontSize: 12.5,
                      cursor: 'pointer',
                    }}
                  >
                    Scan installed apps
                  </button>
                </div>
              )}

              {/* legend */}
              <div style={{
                marginTop: 24,
                padding: '12px 16px',
                border: '1px solid var(--line)',
                borderRadius: 8,
                background: 'var(--bg-raise)',
                fontSize: 11.5,
                color: 'var(--muted)',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
              }}>
                <span style={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--faint)',
                }}>
                  Legend
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: 'var(--accent)',
                  }} />
                  Block for work
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: 'var(--danger)',
                  }} />
                  Always block
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: 'var(--ok)',
                  }} />
                  Always allow
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: 'var(--muted)',
                  }} />
                  Custom
                </span>
                <span>· click any row to edit per-profile.</span>
              </div>

              <div style={{
                marginTop: 24,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}>
                <button
                  onClick={() => {
                    api
                      .refreshKnownAppsInventory()
                      .then(() => refresh())
                      .catch((err) => setError(String(err)));
                  }}
                  style={{
                    padding: '7px 14px',
                    background: 'var(--bg-raise)',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    color: 'var(--ink)',
                    fontSize: 12.5,
                    cursor: 'pointer',
                  }}
                >
                  Refresh installed apps
                </button>
              </div>
            </>
          )}

          {tab === 'browser_targets' && (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  Match against active browser tab titles
                </div>
                <span style={{ flex: 1 }} />
                <button
                  onClick={() => setAdding(true)}
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
                  <Icons.plus size={12} /> Add target
                </button>
              </div>
              <div style={{
                border: '1px solid var(--line)',
                borderRadius: 9,
                overflow: 'hidden',
                background: 'var(--bg-raise)',
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  fontSize: 13,
                }}>
                  <thead>
                    <tr>
                      <th style={th}>Target</th>
                      <th style={th}>Keyword</th>
                      <th style={{ ...th, width: 160 }}>Category</th>
                      <th style={{ ...th, width: 160 }}>Classification</th>
                      <th style={{ ...th, width: 220 }}>Profile decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBrowserTargets.map((target) => {
                      const o = overrideMap.get(
                        overrideMapKey({
                          profile: activeProfile,
                          subjectType: 'browser_target',
                          subjectKey: target.targetKey,
                        }),
                      );
                      return (
                        <BrowserTargetRow
                          key={target.targetKey}
                          target={target}
                          categories={categories}
                          activeProfile={activeProfile}
                          isEmergency={isEmergency}
                          emergencyBlockedCategories={emergencyBlockedCategories}
                          override={o}
                          onUpdate={updateBrowserTarget}
                          onSetOverride={setOverride}
                        />
                      );
                    })}
                  </tbody>
                </table>
                {browserTargets.length === 0 && (
                  <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--muted)',
                    fontSize: 13,
                  }}>
                    No browser targets yet — add one to start matching tab titles.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        </div>

        {categoryManagerOpen && (
          <CategoryManagerModal
            categories={categories}
            apps={apps}
            onClose={() => setCategoryManagerOpen(false)}
            onRefresh={refresh}
          />
        )}
      </div>

      {adding && tab === 'browser_targets' && (
        <AddBrowserTargetModal
          categories={categories}
          onClose={() => setAdding(false)}
          onCreate={createBrowserTarget}
        />
      )}

      {adding && tab === 'apps' && (
        <AddAppModal
          categories={categories}
          profiles={profiles}
          emergencyBlockedCategories={emergencyBlockedCategories}
          onClose={() => setAdding(false)}
          onCreate={async ({
            displayName,
            executableName,
            categoryNames,
            rule,
            customRules,
          }) => {
            const action: ClassificationAction =
              rule === 'always-allow'
                ? 'never_ban'
                : rule === 'always-block'
                ? 'always_ban'
                : rule === 'block-work'
                ? 'ban_during_work'
                : 'unclassified';
            const created = await api.createKnownApp({
              displayName,
              executableName: executableName ?? undefined,
              categoryNames,
              classificationAction: action,
            });
            if (rule === 'custom') {
              for (const profile of profileNames) {
                const v = customRules[profile];
                if (v) {
                  await api.setEnforcementProfileOverride({
                    profileName: profile,
                    subjectType: 'app',
                    subjectKey: created.appKey,
                    decision: v,
                  });
                }
              }
            }
            refresh();
          }}
        />
      )}

      {openApp && (
        <AppDrawer
          app={apps.find((a) => a.appKey === openApp.appKey)!}
          profiles={profiles}
          overrides={overrides}
          emergencyBlockedCategories={emergencyBlockedCategories}
          categories={categories}
          initialPreset={openApp.mode === 'edit-custom' ? 'custom' : undefined}
          onClose={() => setOpenApp(null)}
          onSetOverride={async (profileName, decision) => {
            try {
              if (decision == null) {
                await api.deleteEnforcementProfileOverride(
                  profileName,
                  'app',
                  openApp.appKey,
                );
              } else {
                await api.setEnforcementProfileOverride({
                  profileName,
                  subjectType: 'app',
                  subjectKey: openApp.appKey,
                  decision,
                });
              }
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
          onApplyPreset={async (preset) => {
            try {
              if (preset === 'inherit') {
                for (const profileName of profileNames) {
                  await api.deleteEnforcementProfileOverride(
                    profileName,
                    'app',
                    openApp.appKey,
                  );
                }
              } else {
                await applyPreset('app', openApp.appKey, preset);
                return;
              }
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
          onUpdateApp={async (appKey, patch) => {
            try {
              await api.updateKnownApp(appKey, {
                categoryOverride:
                  patch.categoryOverride === undefined
                    ? undefined
                    : { value: patch.categoryOverride },
              });
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
        />
      )}

      {drawerCategory && (
        <CategoryDrawer
          category={drawerCategory.category}
          profiles={profiles}
          overrides={overrides}
          emergencyBlockedCategories={emergencyBlockedCategories}
          initialPreset={drawerCategory.presetIntent}
          onClose={() => setDrawerCategory(null)}
          onSetOverride={async (profileName, decision) => {
            try {
              if (decision == null) {
                await api.deleteEnforcementProfileOverride(
                  profileName,
                  'category',
                  drawerCategory.category.name,
                );
              } else {
                await api.setEnforcementProfileOverride({
                  profileName,
                  subjectType: 'category',
                  subjectKey: drawerCategory.category.name,
                  decision,
                });
              }
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
          onApplyPreset={async (preset) => {
            try {
              await applyPreset('category', drawerCategory.category.name, preset);
            } catch (err) {
              setError(String(err));
            }
          }}
          onClearAllOverrides={async () => {
            try {
              for (const profileName of profileNames) {
                await api.deleteEnforcementProfileOverride(
                  profileName,
                  'category',
                  drawerCategory.category.name,
                );
              }
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
        />
      )}

      {profileMenuName && (
        <ProfileMenu
          profile={profiles.find((p) => p.name === profileMenuName)!}
          profiles={profiles}
          onClose={() => setProfileMenuName(null)}
          onRefresh={refresh}
          onError={(msg) => setError(msg)}
        />
      )}

      {creatingProfile && (
        <NewProfileDialog
          profiles={profiles}
          onClose={() => setCreatingProfile(false)}
          onCreate={async (name, parent) => {
            try {
              await api.upsertEnforcementProfile({
                name: name.trim(),
                parentName: parent,
              });
              setActiveProfile(name.trim().toLowerCase().replace(/\s+/g, '_'));
              setCreatingProfile(false);
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
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

// referenced but unused export to keep `labelStyle` from being dropped if reorg later
export const __APM_LABEL = labelStyle as ReactNode;
