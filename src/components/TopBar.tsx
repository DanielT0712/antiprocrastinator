import { type ReactNode, useEffect, useState } from 'react';
import type { Route } from './Sidebar';

const ROUTE_TITLES: Record<Route, string> = {
  home: 'Home',
  schedule: 'Schedule',
  tasks: 'Tasks',
  apps: 'App Management',
  settings: 'Settings',
};

const PROFILE_DISPLAY: Record<string, string> = {
  rest: 'Rest',
  work: 'Work',
  deep_work: 'Deep Work',
  emergency: 'Emergency',
};

interface DotProps {
  color?: string;
  size?: number;
}

const Dot = ({ color = 'var(--accent)', size = 6 }: DotProps) => (
  <span style={{
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }} />
);

interface PillProps {
  children: ReactNode;
  subtle?: boolean;
  active?: boolean;
}

const Pill = ({ children, subtle, active }: PillProps) => (
  <div style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 10px',
    borderRadius: 999,
    border: '1px solid var(--line)',
    background: subtle ? 'transparent' : 'var(--bg-raise)',
    fontSize: 11.5,
    fontFamily: 'var(--font-mono)',
    color: active ? 'var(--ink)' : 'var(--muted)',
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
  }}>{children}</div>
);

interface Props {
  route: Route;
  activeProfile: string | null;
}

const formatDate = (date: Date) => {
  const day = date.toLocaleDateString('en-US', { weekday: 'long' });
  const md = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} · ${md}`;
};

export function TopBar({ route, activeProfile }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const initial = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(initial);
  }, []);

  const profileLabel = activeProfile
    ? PROFILE_DISPLAY[activeProfile] ?? activeProfile
    : null;
  const focused = activeProfile && activeProfile !== 'rest';

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 28px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg)',
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 17,
          color: 'var(--ink)',
          letterSpacing: '-0.01em',
        }}>
          {ROUTE_TITLES[route]}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {formatDate(now)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Pill active>
          <Dot color={focused ? 'var(--accent)' : 'var(--muted)'} />
          <span style={{ color: 'var(--ink)' }}>
            {focused ? 'Focused' : 'Idle'}
          </span>
          {profileLabel && (
            <>
              <span style={{ color: 'var(--muted)' }}>·</span>
              <span>{profileLabel}</span>
            </>
          )}
        </Pill>
      </div>
    </header>
  );
}
