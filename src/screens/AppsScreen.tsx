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
  EnforcementDecision,
  EnforcementProfile,
  EnforcementProfileOverride,
  KnownApp,
} from '../api/types';
import { Icons } from '../components/Icons';

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
}: {
  profiles: EnforcementProfile[];
  active: string;
  onChange: (name: string) => void;
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
              padding: '7px 14px',
              borderRadius: 999,
              border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--line)'),
              background: sel ? 'var(--accent-soft)' : 'transparent',
              color: sel ? 'var(--accent-ink)' : 'var(--muted)',
              fontSize: 12.5,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              fontWeight: sel ? 500 : 400,
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
        );
      })}
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
}

function CategorySection({
  category,
  apps,
  activeProfile,
  isEmergency,
  emergencyBlockedCategories,
  overrides,
  onSetOverride,
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px 10px 40px',
                    borderTop: '1px solid var(--line)',
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
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function AppsScreen() {
  const [profiles, setProfiles] = useState<EnforcementProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>('work');
  const [apps, setApps] = useState<KnownApp[]>([]);
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const [overrides, setOverrides] = useState<EnforcementProfileOverride[]>([]);
  const [emergencyBlockedCategories, setEmergencyBlocked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, a, c, o, eb] = await Promise.all([
        api.getEnforcementProfiles(),
        api.getKnownApps(),
        api.getAppCategories(),
        api.getEnforcementProfileOverrides(),
        api.getEmergencyBlockedCategories(),
      ]);
      setProfiles(p);
      setApps(a);
      setCategories(c);
      setOverrides(o);
      setEmergencyBlocked(eb);
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        padding: '16px 36px 14px',
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
          Choose a profile, then set rules per category or per app. Children profiles inherit
          from their parent unless overridden. Emergency profile blocks Games and Entertainment
          unconditionally — those toggles are locked here.
        </div>
        <ProfileTabs
          profiles={profiles}
          active={activeProfile}
          onChange={setActiveProfile}
        />
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
              Emergency mode opens the rest of the system temporarily. Categories that pull you
              away from work — Games and Entertainment — stay blocked even if you try to flip
              them. Use this for messaging, banking, urgent comms.
            </div>
          )}
          {[...categories, { name: 'Uncategorized', builtin: false, createdAt: 0, updatedAt: 0 }].map(
            (cat) => (
              <CategorySection
                key={cat.name}
                category={cat as AppCategory}
                apps={appsByCategory.get(cat.name) ?? []}
                activeProfile={activeProfile}
                isEmergency={isEmergency}
                emergencyBlockedCategories={emergencyBlockedCategories}
                overrides={overrideMap}
                onSetOverride={setOverride}
              />
            ),
          )}

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
        </div>
      </div>

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
