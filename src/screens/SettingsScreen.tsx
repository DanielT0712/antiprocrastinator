import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '../api';
import type { GuardStatus, UserPreferences } from '../api/types';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'enforcement', label: 'Enforcement' },
  { id: 'guard', label: 'Guard & Relaunch' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'advanced', label: 'Advanced' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  color: 'var(--muted)',
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
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
};

const cardStyle: CSSProperties = {
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '18px 20px',
  background: 'var(--bg-raise)',
  marginBottom: 16,
};

function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: 14,
    }}>
      {children}
    </div>
  );
}

function NumField({
  label,
  value,
  unit,
  hint,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    let n = parseFloat(draft);
    if (!Number.isFinite(n)) return;
    if (max != null && n > max) n = max;
    if (min != null && n < min) n = min;
    onChange(n);
    setDraft(String(n));
  };
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          min={min}
          max={max}
          step={step ?? 1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          style={inputStyle}
        />
        {unit && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
          }}>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div style={{
          fontSize: 11.5,
          color: 'var(--faint)',
          marginTop: 4,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.45,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
        color: 'var(--ink)',
        cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
        />
        {label}
      </label>
      {hint && (
        <div style={{
          fontSize: 11.5,
          color: 'var(--faint)',
          marginTop: 4,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.45,
          paddingLeft: 24,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; l: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{ ...inputStyle, fontFamily: 'var(--font-sans)' }}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}

function SectionTitle({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 26,
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
      }}>
        {blurb}
      </div>
    </div>
  );
}

function CardHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{title}</div>
      {hint && (
        <div style={{
          fontSize: 11.5,
          color: 'var(--faint)',
          marginTop: 3,
          fontFamily: 'var(--font-mono)',
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function SettingsScreen() {
  const [section, setSection] = useState<SectionId>('general');
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [guard, setGuard] = useState<GuardStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
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
        <div style={{ ...labelStyle, padding: '6px 10px 8px' }}>Sections</div>
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

      <div style={{ flex: 1, overflow: 'auto', padding: '28px 36px 60px' }}>
        <div style={{ maxWidth: 760 }}>
          {section === 'general' && (
            <>
              <SectionTitle
                title="General"
                blurb="Top-level switches for the app's window and tray behaviour."
              />
              <div style={cardStyle}>
                <CardHead title="App lifecycle" />
                <FieldGrid>
                  <ToggleField
                    label="Minimize to tray on close"
                    hint="Closing the window keeps the app running in the menu bar."
                    value={prefs.minimizeToTray}
                    onChange={(v) => update({ minimizeToTray: v })}
                  />
                  <ToggleField
                    label="Launch at login"
                    hint="Start AntiProcrastinator automatically when you sign in."
                    value={prefs.launchAtLogin}
                    onChange={(v) => update({ launchAtLogin: v })}
                  />
                </FieldGrid>
              </div>
            </>
          )}

          {section === 'scheduling' && (
            <>
              <SectionTitle
                title="Scheduling"
                blurb="Defaults the planner falls back on when a task does not specify its own."
              />
              <div style={cardStyle}>
                <CardHead title="Block durations" />
                <FieldGrid>
                  <NumField
                    label="Default work duration"
                    value={prefs.workDurationMinutes}
                    unit="min"
                    min={5}
                    max={480}
                    step={5}
                    onChange={(v) => update({ workDurationMinutes: v })}
                  />
                  <NumField
                    label="Default break duration"
                    value={prefs.breakDurationMinutes}
                    unit="min"
                    min={1}
                    max={240}
                    step={1}
                    onChange={(v) => update({ breakDurationMinutes: v })}
                  />
                  <NumField
                    label="Minimum rest between work blocks"
                    value={prefs.minimumRestMinutes}
                    unit="min"
                    min={0}
                    max={120}
                    step={1}
                    onChange={(v) => update({ minimumRestMinutes: v })}
                  />
                  <NumField
                    label="Maximum rest multiplier"
                    value={prefs.maximumRestMultiplier}
                    unit="× work"
                    min={1}
                    max={4}
                    step={0.1}
                    hint="Caps how long a generated rest block can grow before the planner cuts the next one."
                    onChange={(v) => update({ maximumRestMultiplier: v })}
                  />
                </FieldGrid>
              </div>
              <div style={cardStyle}>
                <CardHead title="Clustering" hint="How the planner orders tasks within free windows." />
                <FieldGrid>
                  <SelectField
                    label="Group clustering"
                    value={prefs.taskGroupClustering}
                    options={[
                      { v: 'priority', l: 'Priority first' },
                      { v: 'group_same_group_tasks', l: 'Group by task group' },
                      { v: 'separate_same_group_tasks', l: 'Separate same-group tasks' },
                    ]}
                    onChange={(v) => update({ taskGroupClustering: v })}
                  />
                  <SelectField
                    label="Chunk clustering"
                    value={prefs.taskChunkClustering}
                    options={[
                      { v: 'group_same_task_chunks', l: 'Stack chunks of the same task' },
                      { v: 'separate_same_task_chunks', l: 'Spread chunks across the day' },
                    ]}
                    onChange={(v) => update({ taskChunkClustering: v })}
                  />
                  <ToggleField
                    label="Allow priority inversions while clustering"
                    value={prefs.clusteringAllowsPriorityInversions}
                    onChange={(v) => update({ clusteringAllowsPriorityInversions: v })}
                  />
                  <ToggleField
                    label="Fill dead gaps with rest"
                    value={prefs.fillDeadGaps}
                    onChange={(v) => update({ fillDeadGaps: v })}
                  />
                </FieldGrid>
              </div>
            </>
          )}

          {section === 'enforcement' && (
            <>
              <SectionTitle
                title="Enforcement"
                blurb="Process monitor and emergency block bounds."
              />
              <div style={cardStyle}>
                <CardHead title="Process monitor" />
                <FieldGrid>
                  <NumField
                    label="Warning before kill"
                    value={prefs.processWarningSeconds}
                    unit="seconds"
                    min={0}
                    max={300}
                    onChange={(v) => update({ processWarningSeconds: v })}
                  />
                  <NumField
                    label="Countdown after warning"
                    value={prefs.processCountdownSeconds}
                    unit="seconds"
                    min={0}
                    max={300}
                    onChange={(v) => update({ processCountdownSeconds: v })}
                  />
                  <NumField
                    label="Scan interval"
                    value={prefs.processScanIntervalSeconds}
                    unit="seconds"
                    min={1}
                    max={60}
                    onChange={(v) => update({ processScanIntervalSeconds: v })}
                  />
                </FieldGrid>
              </div>
              <div style={cardStyle}>
                <CardHead
                  title="Emergency block"
                  hint="Cap on how long an emergency block can run, and which apps stay reachable."
                />
                <FieldGrid>
                  <NumField
                    label="Maximum duration"
                    value={prefs.emergencyBlockMaxMinutes}
                    unit="minutes"
                    min={1}
                    max={1440}
                    onChange={(v) => update({ emergencyBlockMaxMinutes: v })}
                    hint="Values typed into the emergency dialog above this cap are clamped down to this number."
                  />
                </FieldGrid>
              </div>
            </>
          )}

          {section === 'guard' && (
            <>
              <SectionTitle
                title="Guard & Relaunch"
                blurb="Strong guard makes quitting expensive. The helper restarts the main app if it dies during enforcement."
              />
              <div style={cardStyle}>
                <CardHead title="Guard" />
                <FieldGrid>
                  <ToggleField
                    label="Strong guard"
                    hint="Quitting requires the challenge phrase. Closing the window minimizes to tray instead."
                    value={prefs.strongGuardEnabled}
                    onChange={(v) => update({ strongGuardEnabled: v })}
                  />
                </FieldGrid>
                {guard && (
                  <div style={{
                    marginTop: 14,
                    padding: '10px 12px',
                    border: '1px solid var(--line)',
                    borderRadius: 7,
                    background: 'var(--bg)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    rowGap: 6,
                    columnGap: 16,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--muted)' }}>Active</span>
                    <span style={{ color: 'var(--ink)', textAlign: 'right' }}>
                      {guard.active ? 'yes' : 'no'}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>Helper running</span>
                    <span style={{ color: 'var(--ink)', textAlign: 'right' }}>
                      {guard.helperRunning ? 'yes' : 'no'}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>Supervisor mode</span>
                    <span style={{ color: 'var(--ink)', textAlign: 'right' }}>
                      {guard.supervisorMode}
                    </span>
                    {guard.suspendedUntilEpochSecs && (
                      <>
                        <span style={{ color: 'var(--muted)' }}>Suspended until</span>
                        <span style={{ color: 'var(--ink)', textAlign: 'right' }}>
                          {new Date(guard.suspendedUntilEpochSecs * 1000).toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {section === 'notifications' && (
            <>
              <SectionTitle
                title="Notifications"
                blurb="Surface block transitions and process warnings via the OS notification center."
              />
              <div style={cardStyle}>
                <FieldGrid>
                  <ToggleField
                    label="Enable notifications"
                    value={prefs.notificationsEnabled}
                    onChange={(v) => update({ notificationsEnabled: v })}
                  />
                  <ToggleField
                    label="Show classification popups for new apps"
                    value={prefs.classificationPopupsEnabled}
                    onChange={(v) => update({ classificationPopupsEnabled: v })}
                  />
                </FieldGrid>
              </div>
            </>
          )}

          {section === 'advanced' && (
            <>
              <SectionTitle
                title="Advanced"
                blurb="Browser title heuristics and the live theme value (read-only here)."
              />
              <div style={cardStyle}>
                <CardHead title="Theme" hint="Adjustable controls land in a later pass." />
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--muted)',
                }}>
                  Active theme: <span style={{ color: 'var(--ink)' }}>{prefs.theme}</span>
                </div>
              </div>
              <div style={cardStyle}>
                <CardHead
                  title="Browser title keywords"
                  hint="Comma-separated. Allow keywords let a tab through; block keywords kill it on sight."
                />
                <KeywordList
                  label="Allow"
                  values={prefs.browserTitleAllowKeywords}
                  onChange={(values) => update({ browserTitleAllowKeywords: values })}
                />
                <div style={{ height: 12 }} />
                <KeywordList
                  label="Block"
                  values={prefs.browserTitleBlockKeywords}
                  onChange={(values) => update({ browserTitleBlockKeywords: values })}
                />
              </div>
              <div style={cardStyle}>
                <CardHead
                  title="Emergency allow-listed apps"
                  hint="Apps in this list always remain available during an emergency block."
                />
                <KeywordList
                  label="Apps"
                  values={prefs.emergencyAllowedApps}
                  onChange={(values) => update({ emergencyAllowedApps: values })}
                />
              </div>
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

function KeywordList({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState(values.join(', '));
  useEffect(() => setDraft(values.join(', ')), [values]);
  const commit = () => {
    const parsed = draft
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    onChange(parsed);
  };
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        placeholder="comma, separated, keywords"
        style={inputStyle}
      />
    </div>
  );
}
