import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../api';
import type { KnownApp, TimeBlock, UserPreferences } from '../api/types';
import { formatHHMM } from '../lib/format';

const btnPrimary: CSSProperties = {
  padding: '9px 16px',
  background: 'var(--btn-primary-bg)',
  color: 'var(--btn-primary-fg)',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  cursor: 'pointer',
};

const btnGhost: CSSProperties = {
  padding: '9px 14px',
  background: 'transparent',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'var(--font-sans)',
  cursor: 'pointer',
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

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 10.5,
  color: 'var(--muted)',
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: 6,
};

interface BackdropProps {
  onClose: () => void;
  children: ReactNode;
  align?: 'center' | 'top';
}

export function Backdrop({ onClose, children, align = 'center' }: BackdropProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(10, 9, 8, 0.55)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'grid',
        placeItems: align === 'center' ? 'center' : 'start center',
        paddingTop: align === 'top' ? 80 : 0,
        animation: 'ap-fade 140ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'ap-rise 180ms cubic-bezier(.2,.7,.2,1)' }}
      >
        {children}
      </div>
    </div>
  );
}

interface ShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  accent?: string;
  accentLabel?: string;
}

export function ModalShell({
  title,
  subtitle,
  children,
  footer,
  width = 440,
  accent,
  accentLabel,
}: ShellProps) {
  return (
    <div style={{
      width,
      background: 'var(--bg-raise)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '22px 24px 0' }}>
        {accent && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: accent,
            marginBottom: 8,
          }}>
            {accentLabel ?? 'Action'}
          </div>
        )}
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          color: 'var(--ink)',
          letterSpacing: '-0.015em',
          marginBottom: subtitle ? 4 : 0,
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ padding: '18px 24px' }}>{children}</div>
      {footer && (
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ---------- Extend ----------

interface ExtendProps {
  onClose: () => void;
  onError?: (msg: string) => void;
}

export function ExtendModal({ onClose, onError }: ExtendProps) {
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState<string>('10');
  const [busy, setBusy] = useState(false);
  const chips = [
    { v: '5', label: '+5 min' },
    { v: '10', label: '+10 min' },
    { v: '15', label: '+15 min' },
    { v: '30', label: '+30 min' },
    { v: 'inf', label: 'Indefinitely' },
  ];

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (selected === 'inf') {
        await api.continueCurrentBlock();
      } else {
        const minutes = selected ? parseInt(selected, 10) : parseInt(custom, 10);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          onError?.('Pick a positive number of minutes.');
          setBusy(false);
          return;
        }
        await api.extendCurrentBlock(minutes);
      }
      onClose();
    } catch (err) {
      onError?.(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <ModalShell
        title="Extend current block"
        subtitle="Keep going on the same task. You can stop any time — Done ends the block."
        width={480}
        footer={
          <>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={submit} style={btnPrimary} disabled={busy}>
              {busy ? 'Extending…' : 'Extend'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {chips.map((c) => (
            <button
              key={c.v}
              onClick={() => {
                setSelected(c.v);
                setCustom('');
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border:
                  '1px solid ' + (selected === c.v ? 'var(--accent)' : 'var(--line)'),
                background: selected === c.v ? 'var(--accent-soft)' : 'transparent',
                color: selected === c.v ? 'var(--accent-ink)' : 'var(--ink)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label style={labelStyle}>Or custom duration</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min={1}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setSelected('');
            }}
            placeholder="e.g. 22"
            style={inputStyle}
          />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--muted)',
          }}>minutes</span>
        </div>
        <div style={{
          marginTop: 14,
          padding: '10px 12px',
          border: '1px solid var(--line)',
          borderRadius: 7,
          background: 'var(--bg)',
          fontSize: 12,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          Rest will shorten by up to the extended amount before the next fixed boundary; if it can't, the schedule rebuilds.
        </div>
      </ModalShell>
    </Backdrop>
  );
}

// ---------- Pause ----------

interface PauseProps {
  onClose: () => void;
  block: TimeBlock | null;
  remainingSecs: number;
  onError?: (msg: string) => void;
}

export function PauseModal({ onClose, block, remainingSecs, onError }: PauseProps) {
  const [bufferMins, setBufferMins] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getPauseBufferMinutes()
      .then((value) => {
        if (!cancelled) setBufferMins(value);
      })
      .catch(() => {
        if (!cancelled) setBufferMins(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (busy || !block) return;
    setBusy(true);
    try {
      await api.pauseCurrentBlock();
      onClose();
    } catch (err) {
      onError?.(String(err));
      setBusy(false);
    }
  };

  const remainingMins = Math.max(0, Math.ceil(remainingSecs / 60));
  const blockEndsAt = block ? formatHHMM(block.endTime) : '—';

  return (
    <Backdrop onClose={onClose}>
      <ModalShell
        title="Pause this block"
        subtitle="Pause uses your rest buffer. When the buffer runs out, this block resumes automatically — the remaining minutes still need to finish."
        width={440}
        footer={
          <>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button
              onClick={submit}
              style={{
                ...btnPrimary,
                opacity: bufferMins === 0 ? 0.5 : 1,
                cursor: bufferMins === 0 ? 'not-allowed' : 'pointer',
              }}
              disabled={busy || bufferMins === 0}
            >
              {bufferMins === 0 ? 'No buffer' : busy ? 'Pausing…' : 'Pause'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Rest buffer available', bufferMins == null ? '…' : `${bufferMins} min`],
            ['Block ends at', blockEndsAt],
            ['If paused now, resumes', 'automatically after rest'],
            ['Remaining on block', `${remainingMins} min`],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 10px',
                border: '1px solid var(--line)',
                borderRadius: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--muted)' }}>{k}</span>
              <span style={{ color: 'var(--ink)' }}>{v}</span>
            </div>
          ))}
        </div>
      </ModalShell>
    </Backdrop>
  );
}

// ---------- Emergency ----------

interface EmergencyProps {
  onClose: () => void;
  onError?: (msg: string) => void;
}

const EMERGENCY_REQUIRED_PHRASE = 'I need this now';

export function EmergencyModal({ onClose, onError }: EmergencyProps) {
  const [duration, setDuration] = useState('30');
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [allowlist, setAllowlist] = useState<KnownApp[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getPreferences().then(setPrefs).catch(() => {});
    api.getEmergencyAllowlist().then(setAllowlist).catch(() => setAllowlist([]));
  }, []);

  const cap = prefs?.emergencyBlockMaxMinutes ?? 120;
  const requested = parseInt(duration, 10);
  const clamped = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), cap)
    : null;
  const exceeded = Number.isFinite(requested) && requested > cap;
  const armed =
    phrase.trim() === EMERGENCY_REQUIRED_PHRASE && clamped !== null && clamped > 0;
  const reopenLabel = useMemo(() => {
    if (clamped == null) return '—';
    return formatHHMM(Date.now() + clamped * 60_000);
  }, [clamped]);

  const allowlistText = useMemo(() => {
    if (allowlist.length === 0) {
      return 'Apps in Communication or Browsers stay open. Games, social, and entertainment remain blocked.';
    }
    const names = allowlist
      .slice(0, 5)
      .map((app) => app.displayName)
      .join(' · ');
    const more = allowlist.length > 5 ? ` · +${allowlist.length - 5} more` : '';
    return `Allowed: ${names}${more}`;
  }, [allowlist]);

  const submit = async () => {
    if (!armed || busy || clamped == null) return;
    setBusy(true);
    try {
      await api.startEmergencyBlock({
        durationMinutes: clamped,
        reason: reason.trim() ? reason.trim() : null,
        title: 'Emergency',
      });
      onClose();
    } catch (err) {
      onError?.(String(err));
      setBusy(false);
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <ModalShell
        title="Start emergency block"
        subtitle="This bypasses your current profile and opens a temporary allowlist. Every use is logged for review."
        accent="var(--danger)"
        accentLabel="Emergency"
        width={520}
        footer={
          <>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button
              disabled={!armed || busy}
              onClick={submit}
              style={{
                ...btnPrimary,
                background: armed ? 'var(--danger)' : 'var(--line)',
                color: armed ? '#fff' : 'var(--muted)',
                cursor: armed ? 'pointer' : 'not-allowed',
              }}
            >
              {busy ? 'Starting…' : 'Start emergency'}
            </button>
          </>
        }
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 14,
        }}>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <input
              type="number"
              min={1}
              max={cap}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={inputStyle}
            />
            {exceeded && (
              <div style={{
                fontSize: 11,
                color: 'var(--warn)',
                fontFamily: 'var(--font-mono)',
                marginTop: 4,
              }}>
                Capped at {cap} min by Settings
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Reopen at</label>
            <div style={{
              ...inputStyle,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--muted)',
            }}>
              {reopenLabel}
            </div>
          </div>
        </div>
        <label style={labelStyle}>Reason (logged for review)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. banking call, lost 2FA"
          style={{ ...inputStyle, marginBottom: 14 }}
        />
        <label style={labelStyle}>
          Confirm: type{' '}
          <span style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
            {EMERGENCY_REQUIRED_PHRASE}
          </span>
        </label>
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={EMERGENCY_REQUIRED_PHRASE}
          style={inputStyle}
        />
        <div style={{
          marginTop: 14,
          padding: '10px 12px',
          border: '1px solid var(--line)',
          borderRadius: 7,
          background: 'var(--bg)',
          fontSize: 11.5,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.55,
        }}>
          {allowlistText}
        </div>
      </ModalShell>
    </Backdrop>
  );
}

// ---------- Block ended ----------

interface BlockEndedProps {
  onClose: () => void;
  onExtend: () => void;
  taskName?: string;
  onError?: (msg: string) => void;
}

export function BlockEndedModal({
  onClose,
  onExtend,
  taskName,
  onError,
}: BlockEndedProps) {
  const [busy, setBusy] = useState<'done' | 'continue' | null>(null);

  const done = async () => {
    setBusy('done');
    try {
      await api.completeCurrentBlock();
      onClose();
    } catch (err) {
      onError?.(String(err));
      setBusy(null);
    }
  };
  const cont = async () => {
    setBusy('continue');
    try {
      await api.continueCurrentBlock();
      onClose();
    } catch (err) {
      onError?.(String(err));
      setBusy(null);
    }
  };

  return (
    <Backdrop onClose={onClose} align="top">
      <ModalShell
        title="This block has ended."
        subtitle={
          taskName
            ? `${taskName} — keep going or mark it done.`
            : 'Keep going or mark it done.'
        }
        width={460}
        footer={
          <>
            <button onClick={onExtend} style={btnGhost} disabled={busy !== null}>
              Extend by…
            </button>
            <button onClick={cont} style={btnGhost} disabled={busy !== null}>
              {busy === 'continue' ? 'Continuing…' : 'Extend indefinitely'}
            </button>
            <button onClick={done} style={btnPrimary} disabled={busy !== null}>
              {busy === 'done' ? 'Marking done…' : 'Done'}
            </button>
          </>
        }
      >
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--muted)',
          lineHeight: 1.6,
        }}>
          If you do nothing, this prompt stays and your rest block will begin to count down.
        </div>
      </ModalShell>
    </Backdrop>
  );
}

// ---------- Suspend App ----------

interface SuspendProps {
  onClose: () => void;
  onError?: (msg: string) => void;
}

const SUSPEND_PHRASE = 'suspend';

const SUSPEND_DURATIONS = [
  { v: '30m', label: '30 min', mins: 30 },
  { v: '1h', label: '1 hour', mins: 60 },
  { v: '2h', label: '2 hours', mins: 120 },
  { v: '4h', label: '4 hours', mins: 240 },
  { v: '1d', label: '1 day', mins: 1440 },
];

export function SuspendAppModal({ onClose, onError }: SuspendProps) {
  const [dur, setDur] = useState('1h');
  const [reason, setReason] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = SUSPEND_DURATIONS.find((d) => d.v === dur)!;
  const armed = phrase.trim().toLowerCase() === SUSPEND_PHRASE;

  const resumeLabel = useMemo(
    () => formatHHMM(Date.now() + selected.mins * 60_000),
    [selected],
  );

  const submit = async () => {
    if (!armed || busy) return;
    setBusy(true);
    try {
      await api.suspendGuard(selected.mins, reason.trim() || null);
    } catch (err) {
      onError?.(String(err));
      setBusy(false);
    }
  };

  return (
    <Backdrop onClose={onClose}>
      <ModalShell
        title="Suspend AntiProcrastinator"
        subtitle="Fully suspends the app for a set period. All blocking stops, the schedule pauses, and the app automatically restarts when the timer ends."
        width={500}
        footer={
          <>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button
              onClick={submit}
              disabled={!armed || busy}
              style={{
                ...btnPrimary,
                background: armed ? 'var(--ink)' : 'var(--line)',
                color: armed ? 'var(--bg)' : 'var(--muted)',
                cursor: armed ? 'pointer' : 'not-allowed',
              }}
            >
              {busy ? 'Suspending…' : 'Suspend app'}
            </button>
          </>
        }
      >
        <label style={labelStyle}>Duration</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {SUSPEND_DURATIONS.map((d) => (
            <button
              key={d.v}
              onClick={() => setDur(d.v)}
              style={{
                padding: '8px 13px',
                borderRadius: 6,
                border: '1px solid ' + (dur === d.v ? 'var(--accent)' : 'var(--line)'),
                background: dur === d.v ? 'var(--accent-soft)' : 'transparent',
                color: dur === d.v ? 'var(--accent-ink)' : 'var(--ink)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div style={{
          padding: '10px 12px',
          marginBottom: 16,
          border: '1px solid var(--line)',
          borderRadius: 7,
          background: 'var(--bg)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 2,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--muted)' }}>App restarts at</span>
          <span style={{ color: 'var(--ink)', textAlign: 'right' }}>{resumeLabel}</span>
          <span style={{ color: 'var(--muted)' }}>Until then</span>
          <span style={{ color: 'var(--ink)', textAlign: 'right' }}>
            no blocking · no schedule
          </span>
        </div>
        <label style={labelStyle}>Reason (logged)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. travelling, installer needs admin"
          style={{ ...inputStyle, marginBottom: 14 }}
        />
        <label style={labelStyle}>
          Confirm: type{' '}
          <span style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
            {SUSPEND_PHRASE}
          </span>
        </label>
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={SUSPEND_PHRASE}
          style={inputStyle}
        />
        <div style={{
          marginTop: 14,
          padding: '10px 12px',
          border: '1px solid var(--line)',
          borderRadius: 7,
          background: 'var(--bg)',
          fontSize: 11.5,
          color: 'var(--muted)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.55,
        }}>
          Suspends the whole app — not just the current block. Use{' '}
          <em style={{ color: 'var(--ink)', fontStyle: 'normal' }}>Pause</em>
          {' '}on the hero if you just want to pause the current focus block.
        </div>
      </ModalShell>
    </Backdrop>
  );
}
