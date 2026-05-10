import { useState, type CSSProperties } from 'react';
import { Icons, type IconKey } from './Icons';

export type Route = 'home' | 'schedule' | 'tasks' | 'apps' | 'settings';

const NAV_ITEMS: { id: Route; label: string; icon: IconKey }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'schedule', label: 'Schedule', icon: 'schedule' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'apps', label: 'App Management', icon: 'apps' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

interface Props {
  current: Route;
  onNav: (route: Route) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSuspendApp: () => void;
}

export function Sidebar({ current, onNav, collapsed, onToggleCollapse, onSuspendApp }: Props) {
  const [hovered, setHovered] = useState(false);
  const compact = collapsed && !hovered;

  const sbStyle: CSSProperties = {
    width: compact ? 56 : 220,
    transition: 'width 180ms ease',
    borderRight: '1px solid var(--line)',
    padding: '16px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: 'var(--bg-rail)',
    flexShrink: 0,
    position: 'relative',
  };

  return (
    <aside
      style={sbStyle}
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '2px 4px 18px',
        borderBottom: '1px solid var(--line)',
        marginBottom: 10,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          background: 'var(--ink)', color: 'var(--bg)',
          display: 'grid', placeItems: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15,
          fontStyle: 'italic',
        }}>A</div>
        {!compact && (
          <div style={{ lineHeight: 1.15, flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              Anti<span style={{ fontStyle: 'italic' }}>procrastinator</span>
            </div>
            <div style={{
              fontSize: 10,
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginTop: 2,
            }}>v0.4</div>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--faint)',
            cursor: 'pointer',
            padding: '2px 3px',
            borderRadius: 4,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            transform: collapsed ? 'rotate(180deg)' : 'none',
            transition: 'transform 180ms ease, opacity 180ms ease',
            opacity: compact ? 0 : 1,
            pointerEvents: compact ? 'none' : 'auto',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--faint)')}
        >
          <Icons.chevron size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = current === item.id;
          const IconC = Icons[item.icon];
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              title={compact ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: compact ? '10px' : '9px 11px',
                justifyContent: compact ? 'center' : 'flex-start',
                borderRadius: 7,
                background: active ? 'var(--ink-soft)' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13.5,
                fontFamily: 'var(--font-sans)',
                fontWeight: active ? 500 : 400,
                textAlign: 'left',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = 'var(--ink)';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = 'var(--muted)';
              }}
            >
              <IconC size={17} />
              {!compact && <span>{item.label}</span>}
              {active && !compact && (
                <span style={{
                  position: 'absolute',
                  left: -14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 2,
                  height: 18,
                  background: 'var(--accent)',
                  borderRadius: 2,
                }} />
              )}
            </button>
          );
        })}
      </div>

      <div style={{
        marginTop: 'auto',
        paddingTop: 14,
        borderTop: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <button
          onClick={onSuspendApp}
          title="Suspend the app — pauses all enforcement and the schedule"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: compact ? '9px' : '9px 11px',
            justifyContent: compact ? 'center' : 'flex-start',
            background: 'transparent',
            border: '1px solid var(--line)',
            borderRadius: 7,
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 12.5,
            fontFamily: 'var(--font-sans)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
        >
          <Icons.clock size={15} />
          {!compact && <span>Suspend…</span>}
        </button>
      </div>
    </aside>
  );
}
