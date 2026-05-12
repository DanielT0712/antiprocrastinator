import { useCallback, useEffect, useState } from 'react';
import { api, onAppEvent } from './api';
import { Sidebar, type Route } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { QuitChallengeModal, SuspendAppModal } from './components/Modals';
import { SleepPromptModal } from './components/SleepPromptModal';
import { ProcessWarningOverlay } from './components/ProcessWarningOverlay';
import { applyTheme } from './lib/themes';
import { HomeScreen } from './screens/HomeScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { TasksScreen } from './screens/TasksScreen';
import { AppsScreen } from './screens/AppsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const ROUTE_KEY = 'ap-route';
const COLLAPSED_KEY = 'ap-sidebar-collapsed';

const ROUTES: Route[] = ['home', 'schedule', 'tasks', 'apps', 'settings'];

const PROFILE_KEYS = new Set(['rest', 'work', 'deep_work', 'emergency']);

function App() {
  const [route, setRoute] = useState<Route>(() => {
    const saved = localStorage.getItem(ROUTE_KEY) as Route | null;
    return saved && ROUTES.includes(saved) ? saved : 'home';
  });
  // userCollapsed = user's explicit preference (persisted).
  // narrowForce  = forced true by narrow window (transient).
  // Effective `collapsed` = userCollapsed || narrowForce.
  const [userCollapsed, setUserCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === '1',
  );
  const [narrowForce, setNarrowForce] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 720,
  );
  const collapsed = userCollapsed || narrowForce;
  const setCollapsed = setUserCollapsed;
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [quitSource, setQuitSource] = useState<string | undefined>(undefined);
  const [quitMinimizedToTray, setQuitMinimizedToTray] = useState(false);
  const [sleepPromptOpen, setSleepPromptOpen] = useState(false);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem('ap-sleep-prompt-dismissed') === '1') return;
    let cancelled = false;
    api
      .getWeeklyTemplate()
      .then((template) => {
        if (cancelled) return;
        const days =
          (template as { days?: Array<{ sleepStartMinute?: number | null }> } | null)
            ?.days ?? [];
        const hasSleep = days.some(
          (d) =>
            typeof d.sleepStartMinute === 'number' && d.sleepStartMinute >= 0,
        );
        if (!hasSleep) setSleepPromptOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(ROUTE_KEY, route);
  }, [route]);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, userCollapsed ? '1' : '0');
  }, [userCollapsed]);

  // Auto-collapse sidebar at narrow window widths so content has room.
  // Tracks separately from the user's saved preference; toggling at
  // narrow widths doesn't clobber the saved state.
  useEffect(() => {
    const onResize = () => setNarrowForce(window.innerWidth < 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getPreferences()
      .then((prefs) => {
        if (!cancelled) applyTheme(prefs.theme);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshActiveProfile = useCallback(async () => {
    try {
      const block = await api.getCurrentBlock();
      if (!block) {
        setActiveProfile('rest');
        return;
      }
      const profile = block.enforcementProfile;
      if (profile && PROFILE_KEYS.has(profile)) {
        setActiveProfile(profile);
      } else {
        setActiveProfile(profile ?? null);
      }
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    refreshActiveProfile();
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    (async () => {
      const u = await onAppEvent('block-changed', () => refreshActiveProfile());
      if (cancelled) u();
      else cleanups.push(u);
    })();
    (async () => {
      const u = await onAppEvent('guard-quit-required', (payload) => {
        setQuitSource(payload.source);
        setQuitMinimizedToTray(payload.minimizedToTray);
        setQuitOpen(true);
      });
      if (cancelled) u();
      else cleanups.push(u);
    })();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [refreshActiveProfile]);

  const handleError = useCallback((msg: string) => setError(msg), []);

  return (
    <div style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      background: 'var(--bg)',
    }}>
      <Sidebar
        current={route}
        onNav={setRoute}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onSuspendApp={() => setSuspendOpen(true)}
        onRequestQuit={() => {
          setQuitSource('sidebar');
          setQuitMinimizedToTray(false);
          setQuitOpen(true);
        }}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar route={route} activeProfile={activeProfile} />

        {route === 'home' && <HomeScreen onError={handleError} />}
        {route === 'schedule' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <ScheduleScreen />
          </div>
        )}
        {route === 'tasks' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <TasksScreen />
          </div>
        )}
        {route === 'apps' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <AppsScreen />
          </div>
        )}
        {route === 'settings' && (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <SettingsScreen />
          </div>
        )}
      </div>

      {suspendOpen && (
        <SuspendAppModal
          onClose={() => setSuspendOpen(false)}
          onError={handleError}
        />
      )}

      <QuitChallengeModal
        open={quitOpen}
        source={quitSource}
        minimizedToTray={quitMinimizedToTray}
        onClose={() => setQuitOpen(false)}
        onError={handleError}
      />

      <ProcessWarningOverlay />

      {sleepPromptOpen && (
        <SleepPromptModal
          onSaved={() => {
            localStorage.setItem('ap-sleep-prompt-dismissed', '1');
            setSleepPromptOpen(false);
          }}
          onSkip={() => {
            localStorage.setItem('ap-sleep-prompt-dismissed', '1');
            setSleepPromptOpen(false);
          }}
        />
      )}

      {error && (
        <div
          onClick={() => setError(null)}
          style={{
            position: 'fixed',
            bottom: 70,
            right: 20,
            zIndex: 200,
            maxWidth: 360,
            padding: '10px 14px',
            background: 'var(--bg-raise)',
            border: '1px solid var(--danger)',
            borderRadius: 8,
            color: 'var(--ink)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          }}
          title="Click to dismiss"
        >
          {error}
        </div>
      )}
    </div>
  );
}

export default App;
