import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Icons } from './Icons';

export interface DropdownOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

interface DropdownProps<T extends string | number> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  style?: CSSProperties;
  width?: number | string;
  placeholder?: string;
  align?: 'left' | 'right';
}

export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  style,
  width,
  placeholder,
  align = 'left',
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} style={{ position: 'relative', width: width ?? '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...style,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          width: '100%',
          cursor: 'pointer',
          textAlign: 'left',
          boxSizing: 'border-box',
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: current ? 'inherit' : 'var(--faint)',
        }}>
          {current?.label ?? placeholder ?? '—'}
        </span>
        <span style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}>
          <Icons.chevronD size={11} />
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            [align === 'right' ? 'right' : 'left']: 0,
            minWidth: '100%',
            zIndex: 60,
            background: 'var(--bg-raise)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
            padding: '4px 0',
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {options.map((opt) => {
            const isSel = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 12px',
                  background: isSel ? 'var(--ink-soft)' : 'transparent',
                  border: 'none',
                  color: 'var(--ink)',
                  fontSize: 13,
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!isSel) e.currentTarget.style.background = 'var(--ink-soft)';
                }}
                onMouseLeave={(e) => {
                  if (!isSel) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div>{opt.label}</div>
                {opt.hint ? (
                  <div style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    marginTop: 2,
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {opt.hint}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
