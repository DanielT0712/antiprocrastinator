import { useEffect, useState } from 'react';
import { onAppEvent, type ProcessWarningEvent } from '../api';

interface ActiveWarning {
  processName: string;
  windowTitle: string | null;
  secondsUntilKill: number;
  matchReason: string | null;
  receivedAt: number;
}

/**
 * Top-right toast that surfaces process-warning events from the backend.
 * Backend emits 'process-warning' each scan tick while a blocking app is
 * still running; the seconds_until_kill counts down. When the app is
 * either closed or successfully killed the backend stops emitting and
 * fires 'process-killed', which clears the corresponding card here.
 */
export function ProcessWarningOverlay() {
  const [warnings, setWarnings] = useState<Map<string, ActiveWarning>>(
    new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      const u = await onAppEvent('process-warning', (payload: ProcessWarningEvent) => {
        setWarnings((prev) => {
          const next = new Map(prev);
          next.set(payload.processName, {
            processName: payload.processName,
            windowTitle: payload.windowTitle,
            secondsUntilKill: payload.secondsUntilKill,
            matchReason: payload.matchReason,
            receivedAt: Date.now(),
          });
          return next;
        });
      });
      if (cancelled) u();
      else cleanups.push(u);
    })();

    (async () => {
      const u = await onAppEvent('process-killed', (payload) => {
        setWarnings((prev) => {
          if (!prev.has(payload.processName)) return prev;
          const next = new Map(prev);
          next.delete(payload.processName);
          return next;
        });
      });
      if (cancelled) u();
      else cleanups.push(u);
    })();

    // Sweep stale warnings — if the backend stops emitting (process
    // exited on its own) drop the card after a few seconds.
    const interval = setInterval(() => {
      setWarnings((prev) => {
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
    }, 1_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  if (warnings.size === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 320,
      }}
    >
      {Array.from(warnings.values()).map((w) => {
        const imminent = w.secondsUntilKill <= 3;
        return (
          <div
            key={w.processName}
            style={{
              padding: '12px 14px',
              border:
                '1px solid ' +
                (imminent
                  ? 'var(--danger)'
                  : 'color-mix(in oklch, var(--warn, var(--danger)) 60%, var(--line))'),
              borderRadius: 9,
              background: imminent
                ? 'color-mix(in oklch, var(--danger) 14%, var(--bg-raise))'
                : 'color-mix(in oklch, var(--warn, var(--danger)) 10%, var(--bg-raise))',
              boxShadow: '0 16px 32px rgba(0,0,0,0.35)',
              animation: 'ap-rise 140ms ease-out',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--muted)',
                }}
              >
                Closing in
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 22,
                  fontWeight: 500,
                  color: imminent ? 'var(--danger)' : 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {w.secondsUntilKill}s
              </div>
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: 'var(--ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {w.processName}
            </div>
            {w.windowTitle ? (
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {w.windowTitle}
              </div>
            ) : null}
            {w.matchReason ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  color: 'var(--muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {w.matchReason}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
