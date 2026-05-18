import { useEffect, useState } from 'react';
import { api, onAppEvent, type BlockUpcomingEvent, type ProcessWarningEvent } from './api';
import type { TimeBlock } from './api/types';

interface ProcessWarn {
  processName: string;
  secondsUntilKill: number;
  message?: string;
  failed?: boolean;
  receivedAt: number;
}

interface BlockUpcoming extends BlockUpcomingEvent {
  receivedAt: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHMS(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(r)}`;
  return `${pad(m)}:${pad(r)}`;
}

/**
 * Always-on unclosable popup window. Top row = transient warning
 * (block-about-to-start or process-warning), auto-fades. Bottom row =
 * permanent ticking countdown of current/next block, polled every sec.
 */
export function WarningPopup() {
  const [procWarns, setProcWarns] = useState<Map<string, ProcessWarn>>(new Map());
  const [blockWarn, setBlockWarn] = useState<BlockUpcoming | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [current, setCurrent] = useState<TimeBlock | null>(null);
  const [next, setNext] = useState<TimeBlock | null>(null);

  // Tick + poll. Poll is cheap (two SQL reads).
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [cur, nx] = await Promise.all([
          api.getCurrentBlock(),
          api.getNextBlock(),
        ]);
        if (!cancelled) {
          setCurrent(cur);
          setNext(nx);
        }
      } catch {
        /* ignore */
      }
    };
    refresh();
    const t = window.setInterval(() => {
      setNow(Date.now());
      refresh();
    }, 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // Listen to warning events.
  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const refreshActiveWarning = async () => {
      try {
        const active = await api.getActiveWarning();
        if (cancelled) return;
        if (
          !active ||
          !['process', 'process_kill_failed'].includes(active.kind) ||
          !active.processName
        ) {
          setProcWarns(new Map());
          return;
        }
        setProcWarns((prev) => {
          const next = new Map(prev);
          next.set(active.processName!, {
            processName: active.processName!,
            secondsUntilKill: active.killAt
              ? Math.max(0, Math.ceil((active.killAt - Date.now()) / 1_000))
              : 0,
            message: active.message,
            failed: active.kind === 'process_kill_failed',
            receivedAt: Date.now(),
          });
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    refreshActiveWarning();
    (async () => {
      const u = await onAppEvent('process-warning', (p: ProcessWarningEvent) => {
        setProcWarns((prev) => {
          const next = new Map(prev);
          next.set(p.processName, {
            processName: p.processName,
            secondsUntilKill: p.secondsUntilKill,
            failed: false,
            receivedAt: Date.now(),
          });
          return next;
        });
      });
      if (cancelled) u();
      else cleanups.push(u);
    })();
    (async () => {
      const u = await onAppEvent('process-killed', (p) => {
        setProcWarns((prev) => {
          const killed = p.processName.toLowerCase();
          const next = new Map(prev);
          for (const [key, warning] of prev) {
            if (warning.processName.toLowerCase() === killed) {
              next.delete(key);
            }
          }
          return next.size === prev.size ? prev : next;
        });
      });
      if (cancelled) u();
      else cleanups.push(u);
    })();
    (async () => {
      const u = await onAppEvent('block-upcoming', (p: BlockUpcomingEvent) => {
        if (p.secondsUntilStart <= 0 || p.secondsUntilStart > 60) {
          setBlockWarn(null);
        } else {
          setBlockWarn({ ...p, receivedAt: Date.now() });
        }
      });
      if (cancelled) u();
      else cleanups.push(u);
    })();
    const sweep = setInterval(() => {
      refreshActiveWarning();
      setProcWarns((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [k, w] of prev) {
          if (now - w.receivedAt > 8_000) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setBlockWarn((prev) =>
        prev && Date.now() - prev.receivedAt > 3_000 ? null : prev,
      );
    }, 1_000);
    return () => {
      cancelled = true;
      clearInterval(sweep);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const procSorted = Array.from(procWarns.values()).sort(
    (a, b) => a.secondsUntilKill - b.secondsUntilKill,
  );
  const topProc = procSorted[0];
  const imminent =
    (topProc && topProc.secondsUntilKill <= 3) ||
    (blockWarn != null && blockWarn.secondsUntilStart <= 5);
  const warningText = topProc
    ? topProc.failed
      ? topProc.message ?? `Could not close ${topProc.processName}`
      : `${topProc.processName} closing in ${topProc.secondsUntilKill}s`
    : blockWarn
      ? `${blockWarn.title} block starts in ${blockWarn.secondsUntilStart}s`
      : null;

  // Ticking countdown body.
  let countdownLabel = 'Idle';
  let countdownValue = '—';
  if (current) {
    const remaining = Math.max(0, Math.floor((current.endTime - now) / 1000));
    countdownLabel = `Current: ${current.title}`;
    countdownValue = formatHMS(remaining);
  } else if (next) {
    const until = Math.max(0, Math.floor((next.startTime - now) / 1000));
    countdownLabel = `Next: ${next.title}`;
    countdownValue = formatHMS(until);
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: warningText
          ? imminent
            ? 'rgba(60, 10, 10, 0.94)'
            : 'rgba(60, 35, 10, 0.92)'
          : 'rgba(20, 16, 14, 0.92)',
        border:
          '1px solid ' +
          (warningText
            ? imminent
              ? 'rgba(220, 30, 30, 0.95)'
              : 'rgba(220, 130, 30, 0.85)'
            : 'rgba(140, 110, 80, 0.5)'),
        borderRadius: 12,
        padding: '10px 18px',
        boxSizing: 'border-box',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        textAlign: 'center',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        data-tauri-drag-region
        style={{
          minHeight: 38,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {warningText ? (
          <>
            <div style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: imminent ? 'rgb(255, 110, 110)' : 'rgb(255, 190, 130)',
            }}>
              {topProc ? 'Blocked app detected' : 'Block starting'}
            </div>
            <div style={{
              marginTop: 4,
              fontSize: 18,
              fontWeight: 600,
              color: imminent ? 'rgb(255, 100, 100)' : '#fff',
              letterSpacing: '-0.01em',
            }}>
              {warningText}
            </div>
          </>
        ) : (
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: 'rgb(180, 160, 140)',
          }}>
            Schedule
          </div>
        )}
      </div>
      <div style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px dashed rgba(255,255,255,0.18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}>
        <div style={{
          fontSize: 11,
          color: 'rgb(200, 190, 180)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {countdownLabel}
        </div>
        <div style={{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 26,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {countdownValue}
        </div>
      </div>
    </div>
  );
}
