interface Section {
  t: string;
  d: string;
}

interface Props {
  title: string;
  blurb: string;
  sections: Section[];
}

export function StubScreen({ title, blurb, sections }: Props) {
  return (
    <div style={{ flex: 1, padding: '32px 36px', overflow: 'auto' }}>
      <div style={{ maxWidth: 780 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--muted)',
          marginBottom: 8,
        }}>Preview</div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34,
          color: 'var(--ink)',
          letterSpacing: '-0.02em',
          marginBottom: 10,
        }}>{title}</div>
        <div style={{
          fontSize: 14,
          color: 'var(--muted)',
          lineHeight: 1.6,
          marginBottom: 24,
          maxWidth: 620,
        }}>{blurb}</div>
        <div style={{ display: 'grid', gap: 12 }}>
          {sections.map((s, i) => (
            <div key={i} style={{
              border: '1px solid var(--line)',
              borderRadius: 9,
              padding: '14px 16px',
              background: 'var(--bg-raise)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
              }}>
                <div style={{
                  width: 4,
                  height: 14,
                  background: 'var(--accent)',
                  borderRadius: 2,
                }} />
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
                  {s.t}
                </div>
              </div>
              <div style={{
                fontSize: 12.5,
                color: 'var(--muted)',
                lineHeight: 1.55,
                paddingLeft: 12,
              }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const ScheduleScreen = () => (
  <StubScreen
    title="Schedule"
    blurb="Timeline of today and the days ahead. Drag blocks to move, resize to fit, pin to protect. Rebuild at any time."
    sections={[
      { t: 'Timeline canvas', d: 'Vertical day columns · time axis · color-coded block types · fixed-boundary markers · deadline markers.' },
      { t: 'Block inspector', d: 'Title · linked task · start/end · type · profile · protected toggle · source · mutation history.' },
      { t: 'Rebuild summary', d: 'Human-readable: "3 blocks moved later, 1 rest shortened, projected finish 16:40".' },
      { t: 'Weekly templates', d: 'Apply a recurring shape to the week: standing meetings, fixed gym blocks, deep-work windows.' },
    ]}
  />
);

export const TasksScreen = () => (
  <StubScreen
    title="Tasks"
    blurb="The library of work. Define things clearly enough for the scheduler without turning task creation into paperwork."
    sections={[
      { t: 'Task table', d: 'Name · group · priority · deadline · remaining · profile · status. Filter by group or state.' },
      { t: 'Task detail panel', d: 'Notes · estimate · max/min chunk · work/rest ratio · minimum rest · protect generated blocks · enforcement profile.' },
      { t: 'Create task', d: 'Name, group, priority, deadline, estimate — everything else is optional.' },
    ]}
  />
);

export const AppsScreen = () => (
  <StubScreen
    title="App Management"
    blurb="Apps, sites, and the profiles that decide what is blocked when. Categories are the primary container — set rules at the category level or expand to override a single app."
    sections={[
      { t: 'Category accordions', d: 'Games · Social · Communication · Browsers · Entertainment · Utilities. Bulk-edit at the category level.' },
      { t: 'Per-app overrides', d: 'Expand a category to see its apps with classification, last-seen, running-now, and a custom-profile badge if rules differ.' },
      { t: 'Profiles integrated', d: 'Rest · Work · Deep Work · Emergency · custom. Inheritance vs clone is explicit. Full resolved state is always shown.' },
      { t: 'Browser targets', d: 'youtube · twitter · reddit · and custom keywords, classified alongside apps with the same rules model.' },
      { t: 'Pending Review inbox', d: 'Newly seen apps and low-confidence guesses, waiting for a category and classification.' },
    ]}
  />
);

export const SettingsScreen = () => (
  <StubScreen
    title="Settings"
    blurb="General · Scheduling · Enforcement · Guard & Relaunch · Notifications · Advanced."
    sections={[
      { t: 'Guard & Relaunch', d: 'Minimize to tray · launch at login · strong guard · helper status · what happens on close, quit, suspend, or crash.' },
      { t: 'Scheduling defaults', d: 'Work duration · break duration · minimum rest · scheduling style.' },
      { t: 'Notifications', d: 'Block-end prompt style · warning cadence · focus summaries.' },
    ]}
  />
);
