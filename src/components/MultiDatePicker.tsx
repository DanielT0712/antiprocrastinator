import { type CSSProperties, useMemo, useState } from 'react';
import { Icons } from './Icons';

function startOfLocalDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function monthLabel(year: number, monthIdx: number): string {
  return new Date(year, monthIdx, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

interface Props {
  values: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}

export function MultiDatePicker({ values, onChange, disabled = false }: Props) {
  const today = startOfLocalDay(Date.now());
  const initial = values.length > 0 ? new Date(values[0]) : new Date();
  const [viewYear, setViewYear] = useState<number>(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initial.getMonth());

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    // Monday-first grid: JS getDay() 0=Sun..6=Sat; map to 0=Mon..6=Sun.
    const leadOffset = (first.getDay() + 6) % 7;
    const total = daysInMonth(viewYear, viewMonth);
    const out: Array<{ day: number; epoch: number } | null> = [];
    for (let i = 0; i < leadOffset; i++) out.push(null);
    for (let day = 1; day <= total; day++) {
      out.push({
        day,
        epoch: startOfLocalDay(new Date(viewYear, viewMonth, day).getTime()),
      });
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [viewYear, viewMonth]);

  const selectedSet = useMemo(() => {
    const s = new Set<number>();
    for (const v of values) s.add(startOfLocalDay(v));
    return s;
  }, [values]);

  const toggle = (epoch: number) => {
    if (disabled) return;
    const norm = startOfLocalDay(epoch);
    if (selectedSet.has(norm)) {
      onChange(values.filter((v) => startOfLocalDay(v) !== norm));
    } else {
      onChange([...values, norm].sort((a, b) => a - b));
    }
  };

  const step = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  };

  const navBtn: CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--line)',
    borderRadius: 4,
    color: 'var(--muted)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '3px 7px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 8,
      padding: 10,
      background: 'var(--bg)',
      width: 260,
      opacity: disabled ? 0.55 : 1,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <button type="button" onClick={() => step(-1)} disabled={disabled} style={navBtn} title="Previous month">
          <Icons.chevron size={11} />
        </button>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--ink)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {monthLabel(viewYear, viewMonth)}
        </div>
        <button type="button" onClick={() => step(1)} disabled={disabled} style={navBtn} title="Next month">
          <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}>
            <Icons.chevron size={11} />
          </span>
        </button>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
        marginBottom: 4,
      }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
          <div key={i} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--faint)',
            textAlign: 'center',
            padding: '2px 0',
          }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
      }}>
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`pad-${idx}`} />;
          const sel = selectedSet.has(cell.epoch);
          const isToday = cell.epoch === today;
          const past = cell.epoch < today;
          return (
            <button
              key={cell.epoch}
              type="button"
              disabled={disabled}
              onClick={() => toggle(cell.epoch)}
              style={{
                padding: '4px 0',
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                background: sel ? 'var(--accent-soft)' : 'transparent',
                color: sel
                  ? 'var(--accent-ink)'
                  : past
                    ? 'var(--faint)'
                    : 'var(--ink)',
                border: '1px solid ' + (sel
                  ? 'var(--accent)'
                  : isToday
                    ? 'color-mix(in oklch, var(--accent) 50%, var(--line))'
                    : 'transparent'),
                borderRadius: 4,
                cursor: disabled ? 'not-allowed' : 'pointer',
                textAlign: 'center',
              }}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
      <div style={{
        marginTop: 8,
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--muted)',
      }}>
        {values.length === 0
          ? 'Pick one or more dates'
          : `${values.length} date${values.length === 1 ? '' : 's'} selected`}
      </div>
    </div>
  );
}
