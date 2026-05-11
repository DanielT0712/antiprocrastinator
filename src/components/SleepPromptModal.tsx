import { type CSSProperties, useEffect, useState } from 'react';
import { api } from '../api';

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

function minutesFromTime(value: string): number | null {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

interface Props {
  onSaved: () => void;
  onSkip: () => void;
}

export function SleepPromptModal({ onSaved, onSkip }: Props) {
  const [start, setStart] = useState('23:00');
  const [end, setEnd] = useState('07:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onSkip]);

  const submit = async () => {
    if (busy) return;
    const s = minutesFromTime(start);
    const e = minutesFromTime(end);
    if (s == null || e == null) {
      setError('Use HH:MM (24-hour).');
      return;
    }
    setBusy(true);
    try {
      const existing = (await api.getWeeklyTemplate()) as Record<string, unknown> | null;
      const baseDays = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ];
      const days = baseDays.map((day) => ({
        day,
        enabled: true,
        sleepStartMinute: s,
        sleepEndMinute: e,
      }));
      const template: Record<string, unknown> = {
        ...(existing ?? {}),
        defaultWorkMinutes:
          (existing?.defaultWorkMinutes as number | undefined) ?? 90,
        defaultBreakMinutes:
          (existing?.defaultBreakMinutes as number | undefined) ?? 30,
        days,
        fixedBlocks:
          (existing?.fixedBlocks as unknown[] | undefined) ?? [],
      };
      await api.saveWeeklyTemplate(template);
      onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onSkip}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 110,
        background: 'rgba(10, 9, 8, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          padding: '22px 24px',
        }}
      >
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--muted)',
          marginBottom: 8,
        }}>
          Welcome
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          color: 'var(--ink)',
          letterSpacing: '-0.015em',
          marginBottom: 6,
        }}>
          When do you sleep?
        </div>
        <div style={{
          fontSize: 13,
          color: 'var(--muted)',
          lineHeight: 1.5,
          marginBottom: 16,
        }}>
          The planner needs a Sleep block to avoid scheduling work overnight.
          You can change this later in Schedule → Weekly templates.
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 16,
        }}>
          <div>
            <label style={labelStyle}>Sleep starts</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Wake at</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        {error && (
          <div style={{
            color: 'var(--danger)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}
        <div style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onSkip}
            style={{
              padding: '9px 14px',
              background: 'transparent',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            Not now
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '9px 16px',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-fg)',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Saving…' : 'Save sleep window'}
          </button>
        </div>
      </div>
    </div>
  );
}
