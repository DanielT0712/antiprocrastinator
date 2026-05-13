import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api } from '../api';
import type { GuardStatus, UserPreferences } from '../api/types';
import { THEMES, applyTheme } from '../lib/themes';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'enforcement', label: 'Enforcement' },
  { id: 'guard', label: 'Guard & Relaunch' },
  { id: 'data', label: 'Data & Privacy' },
  { id: 'about', label: 'About' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const sLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  color: 'var(--faint)',
};

const statusValue: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'var(--ink)',
};

const btnSecondary: CSSProperties = {
  padding: '7px 14px',
  background: 'transparent',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 12.5,
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
};

const btnDanger: CSSProperties = {
  padding: '7px 14px',
  background: 'transparent',
  color: 'var(--danger)',
  border: '1px solid var(--danger)',
  borderRadius: 6,
  fontSize: 12.5,
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
};

let activeHoverPopId: symbol | null = null;
let closeActiveHoverPop: (() => void) | null = null;

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function HoverPop({
  title,
  body,
  children,
}: {
  title: string;
  body: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(Symbol('hp'));

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (activeHoverPopId && activeHoverPopId !== idRef.current) {
      closeActiveHoverPop?.();
      if (openTimer.current) clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => {
        activeHoverPopId = idRef.current;
        closeActiveHoverPop = () => setOpen(false);
        setOpen(true);
      }, 140);
    } else {
      activeHoverPopId = idRef.current;
      closeActiveHoverPop = () => setOpen(false);
      setOpen(true);
    }
  };
  const hide = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      if (activeHoverPopId === idRef.current) {
        activeHoverPopId = null;
        closeActiveHoverPop = null;
      }
    }, 120);
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            minWidth: 280,
            maxWidth: 360,
            padding: '12px 14px',
            background: 'var(--bg-raise)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow:
              '0 12px 28px -10px rgba(0,0,0,0.45), 0 4px 10px -4px rgba(0,0,0,0.3)',
            zIndex: 50,
            pointerEvents: 'auto',
          }}
        >
          {title && (
            <div style={{
              fontSize: 12.5,
              color: 'var(--ink)',
              fontWeight: 500,
              marginBottom: 6,
              letterSpacing: '-0.005em',
            }}>
              {title}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
            {body}
          </div>
        </div>
      )}
    </span>
  );
}

function InfoDot() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: '1px solid var(--line)',
        color: 'var(--faint)',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 600,
        cursor: 'help',
        userSelect: 'none',
        transition: 'color 100ms, border-color 100ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--ink)';
        e.currentTarget.style.borderColor = 'var(--muted)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--faint)';
        e.currentTarget.style.borderColor = 'var(--line)';
      }}
    >
      ?
    </span>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        border: '1px solid ' + (on ? 'var(--accent)' : 'var(--line)'),
        background: on ? 'var(--accent-soft)' : 'transparent',
        cursor: 'pointer',
        padding: 0,
        position: 'relative',
        transition: 'all 140ms ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 17 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: on ? 'var(--accent)' : 'var(--muted)',
          transition: 'left 140ms ease, background 140ms ease',
        }}
      />
    </button>
  );
}

function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  unit,
  width = 130,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  width?: number;
}) {
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 10) / 10));
  const inc = () => onChange(Math.min(max, Math.round((value + step) * 10) / 10));
  const stepperBtn: CSSProperties = {
    width: 30,
    background: 'transparent',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'var(--font-mono)',
  };
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'stretch',
      border: '1px solid var(--line)',
      borderRadius: 6,
      background: 'var(--bg)',
      width,
      overflow: 'hidden',
    }}>
      <button onClick={dec} style={stepperBtn}>
        −
      </button>
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        color: 'var(--ink)',
        fontVariantNumeric: 'tabular-nums',
        borderLeft: '1px solid var(--line)',
        borderRight: '1px solid var(--line)',
      }}>
        <span>{value}</span>
        {unit && (
          <span style={{
            fontSize: 10.5,
            color: 'var(--faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {unit}
          </span>
        )}
      </div>
      <button onClick={inc} style={stepperBtn}>
        +
      </button>
    </div>
  );
}

function RatioInput({
  work,
  rest,
  onChange,
}: {
  work: number;
  rest: number;
  onChange: (work: number, rest: number) => void;
}) {
  const box: CSSProperties = {
    width: 48,
    background: 'transparent',
    border: 'none',
    color: 'var(--ink)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12.5,
    textAlign: 'center',
    outline: 'none',
  };
  const setPart = (which: 'work' | 'rest', value: string) => {
    const parsed = Math.max(which === 'work' ? 1 : 0, Number(value) || 0);
    onChange(which === 'work' ? parsed : work, which === 'rest' ? parsed : rest);
  };
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      border: '1px solid var(--line)',
      borderRadius: 6,
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      <input type="number" min={1} step={1} value={work} onChange={(e) => setPart('work', e.target.value)} style={box} />
      <span style={{ color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>:</span>
      <input type="number" min={0} step={1} value={rest} onChange={(e) => setPart('rest', e.target.value)} style={box} />
    </div>
  );
}

function SegBtn<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; explain?: string }[];
}) {
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--line)',
      borderRadius: 6,
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {options.map((o) => {
        const active = o.value === value;
        const btn = (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              lineHeight: 1.2,
              background: active ? 'var(--ink-soft)' : 'transparent',
              color: active ? 'var(--ink)' : 'var(--muted)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontWeight: active ? 500 : 400,
            }}
          >
            {o.label}
          </button>
        );
        if (!o.explain) return btn;
        return (
          <HoverPop key={String(o.value)} title={o.label} body={o.explain}>
            {btn}
          </HoverPop>
        );
      })}
    </div>
  );
}

function SettingsRow({
  title,
  help,
  control,
  children,
  last,
}: {
  title: string;
  help?: string;
  control?: ReactNode;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <div style={{
      // Flex+wrap rather than grid so the control can drop below the
      // title block when the row is too narrow to fit both side by
      // side. Title block flexes 1 1 200px; control sits at the right
      // with marginLeft: auto.
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 24,
      rowGap: 8,
      padding: '12px 0',
      borderBottom: last ? 'none' : '1px solid var(--line)',
      minWidth: 0,
    }}>
      <div style={{ minWidth: 0, flex: '1 1 200px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
            {title}
          </span>
          {help && (
            <HoverPop title={title} body={help}>
              <InfoDot />
            </HoverPop>
          )}
        </div>
        {children && <div style={{ marginTop: 10 }}>{children}</div>}
      </div>
      {control && (
        <div style={{ flexShrink: 0, marginLeft: 'auto', minWidth: 0 }}>
          {control}
        </div>
      )}
    </div>
  );
}

function SettingsCard({
  title,
  status,
  children,
}: {
  title: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28, minWidth: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 12,
        flexWrap: 'wrap',
        minWidth: 0,
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          color: 'var(--ink)',
          letterSpacing: '-0.015em',
          minWidth: 0,
        }}>
          {title}
        </div>
        {status}
      </div>
      <div style={{
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: '0 clamp(12px, 3vw, 20px)',
        background: 'var(--bg-raise)',
        minWidth: 0,
      }}>
        {children}
      </div>
    </section>
  );
}

function ThemeTile({
  theme,
  active,
  onPick,
}: {
  theme: (typeof THEMES)[number];
  active: boolean;
  onPick: (id: string) => void;
}) {
  const t = theme.tokens;
  const accent = t.accentBase ?? 'oklch(0.68 0.08 45)';
  return (
    <button
      onClick={() => onPick(theme.id)}
      style={{
        textAlign: 'left',
        padding: 0,
        background: 'transparent',
        border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
        borderRadius: 10,
        cursor: 'pointer',
        overflow: 'hidden',
        boxShadow: active ? '0 0 0 3px var(--accent-soft)' : 'none',
        transition: 'border-color 100ms, box-shadow 100ms',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        background: t.bg,
        padding: 10,
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{
          display: 'flex',
          gap: 6,
          background: t.bgRaise,
          border: '1px solid ' + t.line,
          borderRadius: 6,
          padding: 8,
          height: 88,
        }}>
          <div style={{
            width: 28,
            background: t.bgRail,
            borderRadius: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 4,
          }}>
            <div style={{ width: 14, height: 3, background: accent, borderRadius: 1 }} />
            <div style={{ width: 18, height: 2, background: t.muted, opacity: 0.5, borderRadius: 1 }} />
            <div style={{ width: 16, height: 2, background: t.muted, opacity: 0.5, borderRadius: 1 }} />
            <div style={{ width: 18, height: 2, background: t.muted, opacity: 0.5, borderRadius: 1 }} />
          </div>
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            paddingLeft: 2,
          }}>
            <div style={{
              width: '70%',
              height: 5,
              background: t.ink,
              borderRadius: 1,
              opacity: 0.9,
            }} />
            <div style={{
              width: '40%',
              height: 3,
              background: t.muted,
              borderRadius: 1,
              opacity: 0.6,
            }} />
            <div style={{
              marginTop: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              color: t.ink,
              fontWeight: 500,
              letterSpacing: '-0.02em',
            }}>
              24:13
            </div>
            <div style={{
              marginTop: 'auto',
              height: 2,
              background: t.line,
              borderRadius: 1,
              position: 'relative',
            }}>
              <div style={{ width: '46%', height: '100%', background: accent }} />
            </div>
          </div>
        </div>
      </div>
      <div style={{
        padding: '10px 12px',
        background: 'var(--bg-raise)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}>
          <span style={{
            fontSize: 13,
            color: 'var(--ink)',
            fontWeight: 500,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {theme.name}
          </span>
          {active && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--accent-ink)',
              background: 'var(--accent-soft)',
              padding: '1px 5px',
              borderRadius: 3,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              flexShrink: 0,
            }}>
              Active
            </span>
          )}
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            <div style={{
              width: 5,
              height: 14,
              background: t.bg,
              border: '1px solid var(--line)',
              borderRadius: 2,
            }} />
            <div style={{
              width: 5,
              height: 14,
              background: t.ink,
              borderRadius: 2,
            }} />
            <div style={{
              width: 5,
              height: 14,
              background: accent,
              borderRadius: 2,
            }} />
          </div>
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {theme.desc}
        </div>
      </div>
    </button>
  );
}

function SectionTitle({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 28,
        color: 'var(--ink)',
        letterSpacing: '-0.02em',
      }}>
        {title}
      </div>
      <div style={{
        fontSize: 13,
        color: 'var(--muted)',
        marginTop: 4,
        lineHeight: 1.5,
        maxWidth: 720,
      }}>
        {blurb}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const [section, setSection] = useState<SectionId>('general');
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [guard, setGuard] = useState<GuardStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // At narrow widths the 200px section aside eats too much room;
  // collapse it to a horizontal scrolling tab strip above content.
  // Callback ref pattern because the main container is rendered
  // conditionally (after prefs load), so a plain useRef + useEffect
  // wouldn't catch the mount.
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!rootEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(rootEl);
    return () => ro.disconnect();
  }, [rootEl]);
  const narrowLayout = w > 0 && w < 760;

  useEffect(() => {
    api.getPreferences().then(setPrefs).catch((e) => setError(String(e)));
    api.getGuardStatus().then(setGuard).catch(() => {});
  }, []);

  const update = (patch: Partial<UserPreferences>) => {
    if (!prefs) return;
    const optimistic = { ...prefs, ...patch };
    setPrefs(optimistic);
    api
      .updatePreferences(patch)
      .then(setPrefs)
      .catch((err) => {
        setError(String(err));
        setPrefs(prefs);
      });
  };

  if (!prefs) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
      }}>
        Loading preferences…
      </div>
    );
  }

  return (
    <div
      ref={setRootEl}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: narrowLayout ? 'column' : 'row',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {!narrowLayout && (
        <aside style={{
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid var(--line)',
          padding: '18px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          background: 'var(--bg-rail)',
        }}>
          <div style={{ ...sLabel, padding: '6px 10px 8px' }}>Sections</div>
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  background: active ? 'var(--ink-soft)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--muted)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: active ? 500 : 400,
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </aside>
      )}

      {narrowLayout && (
        <div style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--line)',
          padding: '8px 16px',
          background: 'var(--bg-rail)',
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
        }}>
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                style={{
                  padding: '6px 12px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  background: active ? 'var(--ink-soft)' : 'transparent',
                  color: active ? 'var(--ink)' : 'var(--muted)',
                  border: '1px solid ' + (active ? 'var(--line)' : 'transparent'),
                  borderRadius: 6,
                  fontSize: 12.5,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: active ? 500 : 400,
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: narrowLayout ? '20px 18px 60px' : '32px 36px 60px', minWidth: 0 }}>
        <div style={{ maxWidth: 760, minWidth: 0 }}>
          {section === 'general' && (
            <>
              <SectionTitle
                title="General"
                blurb="Top-level switches for the app's window, tray, and notifications."
              />
              <SettingsCard title="Startup">
                <SettingsRow
                  title="Launch at login"
                  help="Start AntiProcrastinator automatically when you sign in."
                  control={
                    <Toggle
                      on={prefs.launchAtLogin}
                      onChange={(v) => update({ launchAtLogin: v })}
                    />
                  }
                />
                <SettingsRow
                  last
                  title="Minimize to tray on close"
                  help="Closing the window keeps the app running in the menu bar."
                  control={
                    <Toggle
                      on={prefs.minimizeToTray}
                      onChange={(v) => update({ minimizeToTray: v })}
                    />
                  }
                />
              </SettingsCard>
              <SettingsCard title="Notifications">
                <SettingsRow
                  title="Enable notifications"
                  help="System notifications for warnings, block ends, and reminders."
                  control={
                    <Toggle
                      on={prefs.notificationsEnabled}
                      onChange={(v) => update({ notificationsEnabled: v })}
                    />
                  }
                />
                <SettingsRow
                  last
                  title="Classification popups"
                  help="Prompt you to classify newly seen apps and browser tabs."
                  control={
                    <Toggle
                      on={prefs.classificationPopupsEnabled}
                      onChange={(v) =>
                        update({ classificationPopupsEnabled: v })
                      }
                    />
                  }
                />
              </SettingsCard>
            </>
          )}

          {section === 'appearance' && (
            <>
              <SectionTitle
                title="Appearance"
                blurb="Pick a theme. Selecting one rebinds the colour tokens across the whole app immediately."
              />
              <SettingsCard title="Theme">
                <div style={{ padding: '20px 0' }}>
                  {(['Default', 'Light', 'Dark', 'IDE'] as const).map(
                    (family) => {
                      const items = THEMES.filter((t) => t.family === family);
                      if (items.length === 0) return null;
                      return (
                        <div key={family} style={{ marginBottom: 24 }}>
                          <div style={{ ...sLabel, marginBottom: 12 }}>
                            {family}
                          </div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns:
                              'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
                            gap: 12,
                          }}>
                            {items.map((theme) => (
                              <ThemeTile
                                key={theme.id}
                                theme={theme}
                                active={theme.id === prefs.theme}
                                onPick={(id) => {
                                  applyTheme(id);
                                  update({ theme: id });
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </SettingsCard>
            </>
          )}

          {section === 'scheduling' && (
            <>
              <SectionTitle
                title="Scheduling"
                blurb="Defaults the planner falls back on when a task does not specify its own."
              />
              <SettingsCard title="Block defaults">
                <SettingsRow
                  title="Default focus block"
                  help="Length of a generated work block when a task has no opinion."
                  control={
                    <Stepper
                      value={prefs.workDurationMinutes}
                      onChange={(v) => update({ workDurationMinutes: v })}
                      min={5}
                      max={240}
                      step={5}
                      unit="min"
                      width={140}
                    />
                  }
                />
                <SettingsRow
                  title="Work:rest ratio"
                  help="Ratio used to derive rest after a generated work block. Default is 3:1."
                  control={
                    <RatioInput
                      work={Math.max(1, Math.round(
                        prefs.workDurationMinutes / Math.max(1, gcd(prefs.workDurationMinutes, prefs.breakDurationMinutes)),
                      ))}
                      rest={Math.max(0, Math.round(
                        prefs.breakDurationMinutes / Math.max(1, gcd(prefs.workDurationMinutes, prefs.breakDurationMinutes)),
                      ))}
                      onChange={(work, rest) =>
                        update({
                          breakDurationMinutes: Math.max(
                            0,
                            Math.round((prefs.workDurationMinutes * rest) / Math.max(1, work)),
                          ),
                        })
                      }
                    />
                  }
                />
                <SettingsRow
                  title="Minimum rest between focus blocks"
                  help="Floor for the rest block following a work block."
                  control={
                    <Stepper
                      value={prefs.minimumRestMinutes}
                      onChange={(v) => update({ minimumRestMinutes: v })}
                      min={0}
                      max={60}
                      step={1}
                      unit="min"
                      width={140}
                    />
                  }
                />
                <SettingsRow
                  last
                  title="Maximum rest multiplier"
                  help="How long a rest block may grow relative to the surrounding work block."
                  control={
                    <Stepper
                      value={prefs.maximumRestMultiplier}
                      onChange={(v) => update({ maximumRestMultiplier: v })}
                      min={1}
                      max={4}
                      step={0.1}
                      unit="× work"
                      width={150}
                    />
                  }
                />
              </SettingsCard>

              <SettingsCard title="Planner behaviour">
                <SettingsRow
                  title="Group clustering"
                  help="How the planner orders tasks within free windows."
                  control={
                    <SegBtn
                      value={prefs.taskGroupClustering}
                      onChange={(v) => update({ taskGroupClustering: v })}
                      options={[
                        {
                          value: 'priority',
                          label: 'Priority',
                          explain: 'Highest priority first regardless of group.',
                        },
                        {
                          value: 'group_same_group_tasks',
                          label: 'Group',
                          explain: 'Run tasks of the same group back-to-back.',
                        },
                        {
                          value: 'separate_same_group_tasks',
                          label: 'Spread',
                          explain: 'Avoid stacking same-group tasks.',
                        },
                      ]}
                    />
                  }
                />
                <SettingsRow
                  title="Chunk clustering"
                  help="Group all chunks of one task or spread them across the day."
                  control={
                    <SegBtn
                      value={prefs.taskChunkClustering}
                      onChange={(v) => update({ taskChunkClustering: v })}
                      options={[
                        {
                          value: 'group_same_task_chunks',
                          label: 'Stack',
                          explain: 'Place chunks of the same task adjacent.',
                        },
                        {
                          value: 'separate_same_task_chunks',
                          label: 'Spread',
                          explain:
                            'Distribute chunks of the same task across the day.',
                        },
                      ]}
                    />
                  }
                />
                <SettingsRow
                  title="Allow priority inversions"
                  help="Permit clustering to break strict priority order."
                  control={
                    <Toggle
                      on={prefs.clusteringAllowsPriorityInversions}
                      onChange={(v) =>
                        update({ clusteringAllowsPriorityInversions: v })
                      }
                    />
                  }
                />
                <SettingsRow
                  last
                  title="Fill dead gaps with rest"
                  help="Insert rest into any gap the planner can't fill with work."
                  control={
                    <Toggle
                      on={prefs.fillDeadGaps}
                      onChange={(v) => update({ fillDeadGaps: v })}
                    />
                  }
                />
              </SettingsCard>
            </>
          )}

          {section === 'enforcement' && (
            <>
              <SectionTitle
                title="Enforcement"
                blurb="How the process monitor reacts when something it should block is running."
              />
              <SettingsCard title="Warnings">
                <SettingsRow
                  title="When blocked"
                  help="Close the app/site immediately, or show a countdown first so the user can save work."
                  control={
                    <div style={{
                      display: 'inline-flex',
                      border: '1px solid var(--line)',
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: 'var(--bg)',
                    }}>
                      {(
                        [
                          { v: 'kill', l: 'Close immediately' },
                          { v: 'warn', l: 'Warn, then close' },
                        ] as const
                      ).map((o, i) => {
                        const sel =
                          o.v === 'kill'
                            ? (prefs.processWarningSeconds ?? 0) === 0
                            : (prefs.processWarningSeconds ?? 0) > 0;
                        return (
                          <button
                            key={o.v}
                            onClick={() => {
                              if (o.v === 'kill') {
                                update({ processWarningSeconds: 0 });
                              } else if (
                                (prefs.processWarningSeconds ?? 0) === 0
                              ) {
                                update({ processWarningSeconds: 30 });
                              }
                            }}
                            style={{
                              padding: '7px 12px',
                              fontSize: 12.5,
                              background: sel
                                ? 'var(--accent-soft)'
                                : 'transparent',
                              color: sel ? 'var(--accent-ink)' : 'var(--muted)',
                              border: 'none',
                              borderLeft:
                                i === 0 ? 'none' : '1px solid var(--line)',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-sans)',
                              fontWeight: sel ? 500 : 400,
                            }}
                          >
                            {o.l}
                          </button>
                        );
                      })}
                    </div>
                  }
                />
                {(prefs.processWarningSeconds ?? 0) > 0 && (
                  <>
                    <SettingsRow
                      title="Warn for"
                      help="Time before the countdown starts."
                      control={
                        <Stepper
                          value={prefs.processWarningSeconds}
                          onChange={(v) => update({ processWarningSeconds: v })}
                          min={1}
                          max={600}
                          step={10}
                          unit="s"
                          width={140}
                        />
                      }
                    />
                    <SettingsRow
                      title="Countdown to kill"
                      help="Time after the warning before the process is closed."
                      control={
                        <Stepper
                          value={prefs.processCountdownSeconds}
                          onChange={(v) =>
                            update({ processCountdownSeconds: v })
                          }
                          min={0}
                          max={120}
                          step={5}
                          unit="s"
                          width={140}
                        />
                      }
                    />
                  </>
                )}
                <SettingsRow
                  last
                  title="Scan interval"
                  help="How often running processes are checked. Lower = faster reaction, more CPU."
                  control={
                    <Stepper
                      value={prefs.processScanIntervalSeconds}
                      onChange={(v) =>
                        update({ processScanIntervalSeconds: v })
                      }
                      min={1}
                      max={60}
                      step={1}
                      unit="s"
                      width={140}
                    />
                  }
                />
              </SettingsCard>
              <SettingsCard title="Emergency block">
                <SettingsRow
                  last
                  title="Maximum duration"
                  help="Cap on emergency-block length. Values above this typed in the dialog are clamped down."
                  control={
                    <Stepper
                      value={prefs.emergencyBlockMaxMinutes}
                      onChange={(v) =>
                        update({ emergencyBlockMaxMinutes: v })
                      }
                      min={1}
                      max={1440}
                      step={5}
                      unit="min"
                      width={150}
                    />
                  }
                />
              </SettingsCard>
            </>
          )}

          {section === 'guard' && (
            <>
              <SectionTitle
                title="Guard & Relaunch"
                blurb="Strong guard makes quitting expensive. The helper restarts the main app if it dies during enforcement."
              />
              <SettingsCard
                title="Guard"
                status={
                  guard ? (
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: guard.helperRunning ? 'var(--ok)' : 'var(--warn)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}>
                      Helper {guard.helperRunning ? 'active' : 'down'} ·{' '}
                      {guard.supervisorMode}
                    </span>
                  ) : null
                }
              >
                <SettingsRow
                  title="Strong guard"
                  help="Quitting requires the challenge phrase. Closing the window minimizes to tray instead."
                  control={
                    <Toggle
                      on={prefs.strongGuardEnabled}
                      onChange={(v) => update({ strongGuardEnabled: v })}
                    />
                  }
                />
                <SettingsRow
                  last
                  title="Restart delay"
                  help="Time before the app restarts after a force-quit."
                  control={
                    <Stepper
                      value={prefs.guardRestartDelaySeconds}
                      onChange={(v) =>
                        update({ guardRestartDelaySeconds: v })
                      }
                      min={1}
                      max={60}
                      step={1}
                      unit="s"
                      width={140}
                    />
                  }
                />
              </SettingsCard>
              <SettingsCard title="Suspend lockout">
                <SettingsRow
                  title="Confirmation phrase"
                  help="Type this phrase to confirm a suspend. Default: suspend."
                  control={
                    <input
                      type="text"
                      defaultValue={prefs.suspendPhrase}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v) update({ suspendPhrase: v });
                      }}
                      style={{
                        width: 200,
                        padding: '7px 10px',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        border: '1px solid var(--line)',
                        borderRadius: 6,
                        fontSize: 12.5,
                        fontFamily: 'var(--font-mono)',
                        outline: 'none',
                      }}
                    />
                  }
                />
                <SettingsRow
                  last
                  title="Cooldown after suspend"
                  help="Minimum gap between suspends."
                  control={
                    <Stepper
                      value={prefs.suspendCooldownMinutes}
                      onChange={(v) =>
                        update({ suspendCooldownMinutes: v })
                      }
                      min={0}
                      max={1440}
                      step={15}
                      unit="min"
                      width={140}
                    />
                  }
                />
              </SettingsCard>
              {guard && (
                <SettingsCard title="Helper status">
                  <SettingsRow
                    title="Active"
                    control={
                      <span style={statusValue}>
                        {guard.active ? 'yes' : 'no'}
                      </span>
                    }
                  />
                  <SettingsRow
                    title="Helper running"
                    control={
                      <span style={statusValue}>
                        {guard.helperRunning ? 'yes' : 'no'}
                      </span>
                    }
                  />
                  <SettingsRow
                    title="Supervisor mode"
                    control={
                      <span style={statusValue}>{guard.supervisorMode}</span>
                    }
                  />
                  <SettingsRow
                    last
                    title="Suspended until"
                    control={
                      <span style={statusValue}>
                        {guard.suspendedUntilEpochSecs
                          ? new Date(
                              guard.suspendedUntilEpochSecs * 1000,
                            ).toLocaleString()
                          : '—'}
                      </span>
                    }
                  />
                </SettingsCard>
              )}
            </>
          )}

          {section === 'data' && (
            <>
              <SectionTitle
                title="Data & Privacy"
                blurb="What stays on disk and what gets reset."
              />
              <SettingsCard title="Logs & analytics">
                <SettingsRow
                  last
                  title="Anonymous usage stats"
                  help="Anonymous performance metrics. No tasks, app names, or schedule data."
                  control={
                    <Toggle
                      on={false}
                      onChange={() => {
                        /* not wired — privacy default off */
                      }}
                    />
                  }
                />
              </SettingsCard>
              <SettingsCard title="Backup">
                <SettingsRow
                  title="Export database"
                  help="Save a .db snapshot you can re-import elsewhere."
                  control={
                    <button
                      onClick={() =>
                        alert('Export will land in a follow-up release.')
                      }
                      style={btnSecondary}
                    >
                      Export…
                    </button>
                  }
                />
                <SettingsRow
                  title="Import database"
                  help="Replace the current database with a .db file. Cannot be undone."
                  control={
                    <button
                      onClick={() =>
                        alert('Import will land in a follow-up release.')
                      }
                      style={btnSecondary}
                    >
                      Choose file…
                    </button>
                  }
                />
                <SettingsRow
                  last
                  title="Reset to defaults"
                  help="Clears preferences. Keeps tasks and history."
                  control={
                    <button
                      onClick={() =>
                        alert('Reset will land in a follow-up release.')
                      }
                      style={btnDanger}
                    >
                      Reset…
                    </button>
                  }
                />
              </SettingsCard>
              <SettingsCard title="Danger zone">
                <SettingsRow
                  last
                  title="Delete all data"
                  help="Removes tasks, schedule, rules, and logs. Cannot be undone."
                  control={
                    <button
                      onClick={() =>
                        alert('Wipe will land in a follow-up release.')
                      }
                      style={btnDanger}
                    >
                      Delete everything…
                    </button>
                  }
                />
              </SettingsCard>
            </>
          )}

          {section === 'about' && (
            <>
              <SectionTitle title="About" blurb="The relevant facts." />
              <SettingsCard title="About">
                <div style={{
                  padding: '24px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  borderBottom: '1px solid var(--line)',
                }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: 'var(--ink)',
                    color: 'var(--bg)',
                    display: 'grid',
                    placeItems: 'center',
                    fontFamily: 'var(--font-display)',
                    fontSize: 28,
                    fontWeight: 500,
                    fontStyle: 'italic',
                  }}>
                    A
                  </div>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 22,
                      color: 'var(--ink)',
                      letterSpacing: '-0.01em',
                    }}>
                      Anti<span style={{ fontStyle: 'italic' }}>procrastinator</span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11.5,
                      color: 'var(--muted)',
                      marginTop: 4,
                    }}>
                      Version 0.4.2 · dev build · schema v2
                    </div>
                  </div>
                </div>
                <SettingsRow
                  last
                  title="Check for updates"
                  control={
                    <button
                      onClick={() => alert('Update check not wired yet.')}
                      style={btnSecondary}
                    >
                      Check now
                    </button>
                  }
                />
              </SettingsCard>
            </>
          )}
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
