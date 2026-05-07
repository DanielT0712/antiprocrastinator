import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
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
          <div
            key={p.name}
            style={{
              display: 'inline-flex',
              alignItems: 'stretch',
              borderRadius: 999,
              border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--line)'),
              background: sel ? 'var(--accent-soft)' : 'transparent',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => onChange(p.name)}
              style={{
                padding: '7px 14px',
                background: 'transparent',
                color: sel ? 'var(--accent-ink)' : 'var(--muted)',
                fontSize: 12.5,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                fontWeight: sel ? 500 : 400,
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {PROFILE_DISPLAY[p.name] ?? p.name}
              {p.parentName && (
                <span style={{
                  fontSize: 10,
                  color: 'var(--faint)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  ← {PROFILE_DISPLAY[p.parentName] ?? p.parentName}
                </span>
              )}
            </button>
            <button
              onClick={() => onMenu(p)}
              title="Profile options"
              style={{
                padding: '0 10px',
                background: 'transparent',
                color: 'var(--muted)',
                border: 'none',
                borderLeft: '1px solid var(--line)',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ⋯
            </button>
          </div>
        );
      })}
      <button
        onClick={onAddProfile}
        style={{
          padding: '7px 12px',
          borderRadius: 999,
          border: '1px dashed var(--line)',
          background: 'transparent',
          color: 'var(--muted)',
          fontSize: 12.5,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        + New profile
      </button>
    </div>
  );
}

function decisionPill(decision: EnforcementDecision | null) {
  if (decision === 'allow') {
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: 4,
        background: 'color-mix(in oklch, var(--ok) 16%, transparent)',
        color: 'var(--ok)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        Allow
      </span>
    );
  }
  if (decision === 'block') {
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: 4,
        background: 'color-mix(in oklch, var(--danger) 16%, transparent)',
        color: 'var(--danger)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        Block
      </span>
    );
  }
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 4,
      border: '1px solid var(--line)',
      color: 'var(--muted)',
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}>
      Inherit
    </span>
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

interface CategorySectionProps {
  category: AppCategory;
  apps: KnownApp[];
  activeProfile: string;
  isEmergency: boolean;
  emergencyBlockedCategories: string[];
  overrides: Map<string, EnforcementProfileOverride>;
  onSetOverride: (key: OverrideKey, decision: EnforcementDecision | null) => void;
  onOpenApp: (app: KnownApp) => void;
}

function CategorySection({
  category,
  apps,
  activeProfile,
  isEmergency,
  emergencyBlockedCategories,
  overrides,
  onSetOverride,
  onOpenApp,
}: CategorySectionProps) {
  const [open, setOpen] = useState(false);
  const categoryHardLocked =
    isEmergency &&
    emergencyBlockedCategories.some((c) => c.toLowerCase() === category.name.toLowerCase());
  const categoryOverrideKey: OverrideKey = {
    profile: activeProfile,
    subjectType: 'category',
    subjectKey: category.name,
  };
  const categoryDecision =
    overrides.get(overrideMapKey(categoryOverrideKey))?.decision ?? null;
  const effectiveCategoryDecision = categoryHardLocked ? 'block' : categoryDecision;

  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 9,
      marginBottom: 10,
      overflow: 'hidden',
      background: 'var(--bg-raise)',
    }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none' }}>
          <Icons.chevronD size={13} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 13.5,
            color: 'var(--ink)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {category.name}
            {category.builtin && (
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
            fontSize: 11.5,
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            marginTop: 2,
          }}>
            {apps.length} {apps.length === 1 ? 'app' : 'apps'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {decisionPill(effectiveCategoryDecision)}
          <div onClick={(e) => e.stopPropagation()}>
            <DecisionToggle
              current={categoryDecision}
              hardLock={
                categoryHardLocked
                  ? {
                      lockedTo: 'block',
                      reason: `${category.name} apps cannot be allowed during emergency.`,
                    }
                  : undefined
              }
              onChange={(next) => onSetOverride(categoryOverrideKey, next)}
            />
          </div>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--line)' }}>
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
            apps.map((app) => {
              const appKey: OverrideKey = {
                profile: activeProfile,
                subjectType: 'app',
                subjectKey: app.appKey,
              };
              const appDecision = overrides.get(overrideMapKey(appKey))?.decision ?? null;
              return (
                <div
                  key={app.appKey}
                  onClick={() => onOpenApp(app)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px 10px 40px',
                    borderTop: '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                      {app.executableName ?? app.appKey} ·{' '}
                      {app.classificationStatus}
                    </div>
                  </div>
                  {decisionPill(
                    categoryHardLocked ? 'block' : appDecision ?? effectiveCategoryDecision,
                  )}
                  <div onClick={(e) => e.stopPropagation()}>
                    <DecisionToggle
                      current={appDecision}
                      hardLock={
                        categoryHardLocked
                          ? {
                              lockedTo: 'block',
                              reason: `${category.name} apps cannot be allowed during emergency.`,
                            }
                          : undefined
                      }
                      onChange={(next) => onSetOverride(appKey, next)}
                    />
                  </div>
                </div>
              );
            })
          )}
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
  const [drawerAppKey, setDrawerAppKey] = useState<string | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [profileMenuName, setProfileMenuName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setPendingApps(pending.apps ?? []);
      setPendingTargets(pending.browserTargets ?? []);
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

  const appsByCategory = useMemo(() => {
    const map = new Map<string, KnownApp[]>();
    for (const c of categories) map.set(c.name, []);
    map.set('Uncategorized', []);
    for (const app of apps) {
      const cat = app.effectiveCategory ?? 'Uncategorized';
      const list = map.get(cat) ?? [];
      list.push(app);
      map.set(cat, list);
    }
    return map;
  }, [apps, categories]);

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
        padding: '16px 36px 0',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          color: 'var(--ink)',
          letterSpacing: '-0.02em',
          marginBottom: 4,
        }}>
          App Management
        </div>
        <div style={{
          fontSize: 13,
          color: 'var(--muted)',
          marginBottom: 14,
          maxWidth: 720,
          lineHeight: 1.55,
        }}>
          Choose a profile, then set rules per category, per app, or per browser target.
          Children profiles inherit from their parent unless overridden. Emergency profile
          blocks Games and Entertainment unconditionally — those toggles are locked here.
        </div>
        <ProfileTabs
          profiles={profiles}
          active={activeProfile}
          onChange={setActiveProfile}
          onMenu={(p) => setProfileMenuName(p.name)}
          onAddProfile={async () => {
            const name = prompt('Name the new profile (lowercase, snake_case):');
            if (!name) return;
            try {
              await api.upsertEnforcementProfile({
                name: name.trim(),
                parentName: 'work',
              });
              refresh();
            } catch (err) {
              setError(String(err));
            }
          }}
        />
        <div style={{ height: 14 }} />
        <div style={{
          display: 'flex',
          gap: 4,
          alignItems: 'center',
          borderBottom: '1px solid var(--line)',
          marginLeft: -36,
          marginRight: -36,
          paddingLeft: 36,
          paddingRight: 36,
        }}>
          {(['apps', 'browser_targets'] as AppsTab[]).map((id) => {
            const sel = tab === id;
            const count = id === 'apps' ? apps.length : browserTargets.length;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: '10px 14px',
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
              >
                {id === 'apps' ? 'Apps' : 'Browser Targets'}
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
        </div>
      </div>

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
                onOpenApp={(app) => setDrawerAppKey(app.appKey)}
                onOpenBrowserTab={() => setTab('browser_targets')}
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
                  isEmergency={isEmergency}
                  emergencyBlockedCategories={emergencyBlockedCategories}
                  overrides={overrideMap}
                  onSetOverride={setOverride}
                  onOpenApp={(app) => setDrawerAppKey(app.appKey)}
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
                    {browserTargets.map((target) => {
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

      {adding && (
        <AddBrowserTargetModal
          categories={categories}
          onClose={() => setAdding(false)}
          onCreate={createBrowserTarget}
        />
      )}

      {drawerAppKey && (
        <AppDrawer
          app={apps.find((a) => a.appKey === drawerAppKey)!}
          profiles={profiles}
          overrides={overrides}
          emergencyBlockedCategories={emergencyBlockedCategories}
          categories={categories}
          onClose={() => setDrawerAppKey(null)}
          onSetOverride={async (profileName, decision) => {
            try {
              if (decision == null) {
                await api.deleteEnforcementProfileOverride(
                  profileName,
                  'app',
                  drawerAppKey,
                );
              } else {
                await api.setEnforcementProfileOverride({
                  profileName,
                  subjectType: 'app',
                  subjectKey: drawerAppKey,
                  decision,
                });
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

      {categoryManagerOpen && (
        <CategoryManagerModal
          categories={categories}
          apps={apps}
          onClose={() => setCategoryManagerOpen(false)}
          onRefresh={refresh}
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
