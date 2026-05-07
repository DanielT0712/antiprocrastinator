export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Low',
  3: 'Med',
  4: 'High',
  5: 'Urgent',
};

export function formatHHMM(epochMs: number): string {
  const date = new Date(epochMs);
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatRange(startMs: number, endMs: number): string {
  return `${formatHHMM(startMs)} → ${formatHHMM(endMs)}`;
}

export function formatRemaining(secs: number): string {
  if (secs < 0) secs = 0;
  const mm = Math.floor(secs / 60);
  const ss = Math.floor(secs % 60);
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0) return '—';
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatRelativeDeadline(deadlineMs: number, now: number = Date.now()): string {
  const date = new Date(deadlineMs);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadlineMs);
  target.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const dayDiff = Math.round((target.getTime() - today.getTime()) / dayMs);
  const time = formatHHMM(deadlineMs);

  if (dayDiff < 0) return `${Math.abs(dayDiff)}d overdue`;
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (dayDiff < 7) {
    return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  }
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

export function formatProjectedFinish(epochMs: number, now: number = Date.now()): string {
  const target = new Date(epochMs);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const targetDay = new Date(epochMs);
  targetDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((targetDay.getTime() - today.getTime()) / 86_400_000);
  const time = formatHHMM(epochMs);
  if (dayDiff <= 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Tomorrow · ${time}`;
  if (dayDiff < 7) {
    return `${target.toLocaleDateString('en-US', { weekday: 'short' })} · ${time}`;
  }
  return `${target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

export function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? '';
}
