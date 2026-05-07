import { useState } from 'react';

interface Props {
  onClick: () => void;
}

export function EmergencyDot({ onClick }: Props) {
  const [hover, setHover] = useState(false);
  return (
    <button
      aria-label="Emergency block"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 50,
        width: 32,
        height: 32,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        inset: 0,
        border: '1px solid var(--line)',
        borderRadius: 999,
        opacity: hover ? 1 : 0,
        transform: hover ? 'scale(1)' : 'scale(0.6)',
        transition: 'opacity 160ms ease, transform 160ms ease',
        background: 'var(--bg-raise)',
      }} />
      <span style={{
        position: 'relative',
        width: 10,
        height: 10,
        borderRadius: 999,
        background: 'var(--danger)',
        boxShadow: hover
          ? '0 0 0 4px rgba(205, 70, 60, 0.18)'
          : '0 0 0 0 rgba(205, 70, 60, 0)',
        transition: 'box-shadow 200ms ease',
      }} />
      <span style={{
        position: 'absolute',
        width: 10,
        height: 10,
        borderRadius: 999,
        background: 'var(--danger)',
        opacity: 0.35,
        animation: 'ap-pulse 2.4s ease-out infinite',
      }} />
      {hover && (
        <div style={{
          position: 'absolute',
          bottom: 44,
          right: 0,
          width: 220,
          padding: '10px 12px',
          background: 'var(--bg-raise)',
          border: '1px solid var(--line)',
          borderRadius: 7,
          boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
          textAlign: 'left',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--danger)',
            marginBottom: 4,
          }}>Emergency block</div>
          <div style={{
            fontSize: 12,
            color: 'var(--ink)',
            lineHeight: 1.45,
            marginBottom: 4,
          }}>
            Temporarily opens critical apps only.
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--muted)',
            lineHeight: 1.4,
            fontFamily: 'var(--font-mono)',
          }}>
            Requires confirmation. Every use is logged.
          </div>
        </div>
      )}
    </button>
  );
}
