import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  stroke?: string;
}

interface BaseProps extends IconProps {
  d: ReactNode;
}

const Icon = ({ d, size = 18, stroke = 'currentColor' }: BaseProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d}
  </svg>
);

export const Icons = {
  home: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v10h14V10" />
        </>
      }
    />
  ),
  schedule: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 3v4M16 3v4" />
        </>
      }
    />
  ),
  tasks: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <path d="M4 7h12" />
          <path d="M4 12h12" />
          <path d="M4 17h8" />
          <circle cx="19" cy="7" r="1.2" />
          <circle cx="19" cy="12" r="1.2" />
        </>
      }
    />
  ),
  apps: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      }
    />
  ),
  settings: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </>
      }
    />
  ),
  tweak: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <path d="M4 7h10" />
          <path d="M18 7h2" />
          <circle cx="16" cy="7" r="2" />
          <path d="M4 17h4" />
          <path d="M12 17h8" />
          <circle cx="10" cy="17" r="2" />
        </>
      }
    />
  ),
  check: (p: IconProps) => <Icon {...p} d={<path d="m5 12 5 5 9-11" />} />,
  plus: (p: IconProps) => (
    <Icon {...p} d={<><path d="M12 5v14M5 12h14" /></>} />
  ),
  pause: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <rect x="7" y="5" width="3.5" height="14" rx="0.5" />
          <rect x="13.5" y="5" width="3.5" height="14" rx="0.5" />
        </>
      }
    />
  ),
  shield: (p: IconProps) => (
    <Icon
      {...p}
      d={<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" />}
    />
  ),
  dot: (p: IconProps) => <Icon {...p} d={<circle cx="12" cy="12" r="4" />} />,
  chevron: (p: IconProps) => <Icon {...p} d={<path d="m9 6 6 6-6 6" />} />,
  chevronD: (p: IconProps) => <Icon {...p} d={<path d="m6 9 6 6 6-6" />} />,
  search: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </>
      }
    />
  ),
  command: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <path d="M9 6a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6 3 3 0 0 0-3 3v6a3 3 0 1 0 6 0 3 3 0 0 0-3-3H9a3 3 0 1 0 0 6" />
      }
    />
  ),
  x: (p: IconProps) => (
    <Icon {...p} d={<path d="m6 6 12 12M18 6 6 18" />} />
  ),
  alert: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <path d="M12 3 2 20h20L12 3Z" />
          <path d="M12 10v5" />
          <circle cx="12" cy="18" r="0.6" fill="currentColor" />
        </>
      }
    />
  ),
  helper: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" />
        </>
      }
    />
  ),
  clock: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </>
      }
    />
  ),
  flame: (p: IconProps) => (
    <Icon
      {...p}
      d={<path d="M12 3c1 3 4 4 4 8a4 4 0 1 1-8 0c0-2 1-3 1-4 2 0 3-2 3-4Z" />}
    />
  ),
  trash: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </>
      }
    />
  ),
  folder: (p: IconProps) => (
    <Icon
      {...p}
      d={
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      }
    />
  ),
};

export type IconKey = keyof typeof Icons;
