import { useEffect, useState } from 'react';
import { api, onAppEvent, type BlockUpcomingEvent, type ProcessWarningEvent } from './api';

interface ProcessWarn {
  processName: string;
  secondsUntilKill: number;
  matchReason: string | null;
  message?: string;
  failed?: boolean;
  receivedAt: number;
}

interface BlockUpcoming extends BlockUpcomingEvent {
  receivedAt: number;
}

/**
 * Click-through transparent tint window — one instance per monitor.
 * Shows the warning text big and centered so it's visible across
 * whatever app the user is focused on. Pointer events pass through.
 */
export function Overlay() {
  const [procWarns, setProcWarns] = useState<Map<string, ProcessWarn>>(new Map());
  const [blockWarn, setBlockWarn] = useState<BlockUpcoming | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const refreshActiveWarning = async () => {
      try {
        const active = await api.getActiveWarning();
        if (
          cancelled ||
          !active ||
          !['process', 'process_kill_failed'].includes(active.kind) ||
          !active.processName
        ) return;
        setProcWarns((prev) => {
          const next = new Map(prev);
          next.set(active.processName!, {
            processName: active.processName!,
            secondsUntilKill: active.killAt
              ? Math.max(0, Math.ceil((active.killAt - Date.now()) / 1_000))
              : 0,
            matchReason: active.matchReason,
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
            matchReason: p.matchReason,
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
          if (!prev.has(p.processName)) return prev;
          const next = new Map(prev);
          next.delete(p.processName);
          return next;
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

  const hasAny = topProc != null || blockWarn != null;
  if (!hasAny) {
    return <div style={{ width: '100vw', height: '100vh', background: 'transparent' }} />;
  }

  const imminent =
    (topProc && topProc.secondsUntilKill <= 3) ||
    (blockWarn && blockWarn.secondsUntilStart <= 5);

  const message = topProc
    ? topProc.failed
      ? topProc.message ?? `Could not close ${topProc.processName}`
      : `${topProc.processName} closing in ${topProc.secondsUntilKill}s`
    : blockWarn
      ? `${blockWarn.title} block starts in ${blockWarn.secondsUntilStart}s`
      : '';
  const headline = topProc
    ? topProc.failed
      ? 'Close failed'
      : 'Blocked app detected'
    : 'Block starting soon';

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        inset: 0,
        background: imminent
          ? 'rgba(180, 30, 30, 0.32)'
          : 'rgba(200, 120, 30, 0.20)',
        boxShadow: imminent
          ? 'inset 0 0 0 8px rgba(220, 30, 30, 0.85)'
          : 'inset 0 0 0 6px rgba(220, 130, 30, 0.7)',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '8vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#fff',
        textShadow: '0 2px 10px rgba(0,0,0,0.85)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '70vw' }}>
        <div style={{
          fontSize: 14,
          textTransform: 'uppercase',
          letterSpacing: '0.22em',
          color: imminent ? 'rgb(255, 110, 110)' : 'rgb(255, 200, 140)',
        }}>
          {headline}
        </div>
        <div style={{ marginTop: 10, fontSize: 38, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {message}
        </div>
        {topProc?.matchReason ? (
          <div style={{ marginTop: 6, fontSize: 14, color: 'rgb(220, 200, 200)' }}>
            {topProc.matchReason}
          </div>
        ) : null}
      </div>
    </div>
  );
}
