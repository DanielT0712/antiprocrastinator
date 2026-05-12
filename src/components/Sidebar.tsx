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
  locked: boolean;
  // True when the lock is forced on by a narrow window — pin button is
  // disabled in this case so the user can't desync state.
  lockForced: boolean;
  onToggleCollapse: () => void;
  onToggleLocked: () => void;
  onSuspendApp: () => void;
  onRequestQuit: () => void;
}

export function Sidebar({
  current,
  onNav,
  collapsed,
  locked,
  lockForced,
  onToggleCollapse,
  onToggleLocked,
  onSuspendApp,
  onRequestQuit,
}: Props) {
  const [hovered, setHovered] = useState(false);
  // Locked sidebar never hover-expands. Window-narrow forces locked.
  const compact = collapsed && (locked || !hovered);

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
      onMouseEnter={() => collapsed && !locked && setHovered(true)}
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

      <div style={{ marginTop: 'auto' }}>
        {collapsed && (
          <button
            onClick={lockForced ? undefined : onToggleLocked}
            disabled={lockForced}
            title={
              lockForced
                ? 'Sidebar locked because window is narrow'
                : locked
                  ? 'Unlock (allow hover-expand)'
                  : 'Lock collapsed (no hover-expand)'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: compact ? '6px 0' : '6px 10px',
              marginBottom: 6,
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: locked ? 'var(--accent)' : 'var(--faint)',
              cursor: lockForced ? 'not-allowed' : 'pointer',
              fontSize: 11.5,
              fontFamily: 'var(--font-sans)',
              opacity: lockForced ? 0.4 : 1,
              transition: 'color 180ms ease, opacity 180ms ease',
            }}
          >
            {locked ? <Icons.pin size={13} /> : <Icons.pinOff size={13} />}
            {!compact && (
              <span>{locked ? 'Locked compact' : 'Lock compact'}</span>
            )}
          </button>
        )}

      <div style={{
        paddingTop: 14,
        borderTop: '1px solid var(--line)',
        display: compact ? 'flex' : 'grid',
        flexDirection: compact ? 'column' : undefined,
        gridTemplateColumns: compact ? undefined : '1fr 1fr',
        gap: compact ? 8 : 6,
      }}>
        <button
          onClick={onSuspendApp}
          title="Suspend the entire AntiProcrastinator app for a set period. App auto-restarts after."
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: compact ? '9px 0' : '9px 10px',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid var(--line)',
            borderRadius: 7,
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 12.5,
            fontFamily: 'var(--font-sans)',
            width: '100%',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
        >
          <Icons.clock size={15} />
          {!compact && <span>Suspend</span>}
        </button>
        <button
          onClick={onRequestQuit}
          title="Stop the app entirely. Requires typing a confirmation phrase."
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: compact ? '9px 0' : '9px 10px',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid var(--line)',
            borderRadius: 7,
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 12.5,
            fontFamily: 'var(--font-sans)',
            width: '100%',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
        >
          <Icons.x size={15} />
          {!compact && <span>Quit…</span>}
        </button>
      </div>
      </div>
    </aside>
  );
}
