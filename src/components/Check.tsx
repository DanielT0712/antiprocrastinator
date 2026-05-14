import { type CSSProperties, type MouseEvent } from 'react';

interface CheckProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: number;
  indeterminate?: boolean;
  ariaLabel?: string;
  stopPropagation?: boolean;
}

export function Check({
  checked,
  onChange,
  disabled = false,
  size = 16,
  indeterminate = false,
  ariaLabel,
  stopPropagation = false,
}: CheckProps) {
  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) e.stopPropagation();
    if (disabled) return;
    onChange(!checked);
  };
  const filled = checked || indeterminate;
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 4,
    border: '1px solid ' + (filled ? 'var(--accent)' : 'var(--line)'),
    background: filled ? 'var(--accent)' : 'var(--bg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'oklch(0.18 0.04 60)',
    transition: 'background 90ms ease, border-color 90ms ease',
    flexShrink: 0,
  };
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handle}
      style={style}
    >
      {indeterminate ? (
        <svg width={size - 6} height={size - 6} viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : checked ? (
        <svg width={size - 4} height={size - 4} viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.5l2.5 2.5 4.5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}
