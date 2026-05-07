import type { TimeBlock } from '../api/types';

export type RailKind = 'deep' | 'work' | 'rest' | 'fixed' | 'emergency';

export function railKindFor(block: TimeBlock): RailKind {
  if (block.source === 'emergency') return 'emergency';
  if (block.source === 'template') return 'fixed';
  if (block.blockType === 'break' || block.blockType === 'sleep' || block.blockType === 'meal') {
    return 'rest';
  }
  if (block.enforcementProfile === 'deep_work') return 'deep';
  return 'work';
}

export function blockBarColor(kind: RailKind): string {
  switch (kind) {
    case 'deep': return 'var(--accent)';
    case 'work': return 'var(--ink)';
    case 'rest': return 'var(--muted)';
    case 'fixed': return 'var(--ink)';
    case 'emergency': return 'var(--danger)';
  }
}

export function blockLabel(kind: RailKind): string {
  switch (kind) {
    case 'deep': return 'Deep';
    case 'work': return 'Work';
    case 'rest': return 'Rest';
    case 'fixed': return 'Fixed';
    case 'emergency': return 'Emergency';
  }
}
