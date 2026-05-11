import type { Task, TimeBlock } from '../api/types';
import { Icons } from './Icons';
import { blockBarColor, railKindFor } from '../lib/blocks';
import { formatHHMM, formatProjectedFinish } from '../lib/format';

interface Props {
  blocks: TimeBlock[];
  currentBlock: TimeBlock | null;
  taskById: Map<number, Task>;
  projectedFinishMs: number | null;
  projectedTaskName: string | null;
  endOfDayMs: number | null;
  workBlockCount: number;
}

const PROFILE_LABEL: Record<string, string> = {
  rest: 'Rest',
  work: 'Work',
  deep_work: 'Deep Work',
  emergency: 'Emergency',
};

export function TimelineRail({
  blocks,
  currentBlock,
  taskById,
  projectedFinishMs,
  projectedTaskName,
  endOfDayMs,
  workBlockCount,
}: Props) {
  const currentIdx = currentBlock
    ? blocks.findIndex((b) => b.id === currentBlock.id)
    : -1;
  const nextIdx = currentIdx >= 0 ? currentIdx + 1 : -1;
  const now = Date.now();

  return (
    <aside style={{
      width: 320,
      flexShrink: 0,
      borderLeft: '1px solid var(--line)',
      padding: '26px 24px',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'auto',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          color: 'var(--ink)',
        }}>Today</div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {workBlockCount} blocks
          {endOfDayMs ? ` · ends ${formatHHMM(endOfDayMs)}` : ''}
        </div>
      </div>

      {projectedFinishMs && (
        <div style={{
          padding: '10px 12px',
          border: '1px solid var(--line)',
          borderRadius: 7,
          fontSize: 11.5,
          fontFamily: 'var(--font-mono)',
          color: 'var(--muted)',
          marginBottom: 14,
          background: 'var(--bg-raise)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <span style={{
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: 10,
          }}>
            {projectedTaskName ? `${projectedTaskName} projected finish` : 'Projected finish'}
          </span>
          <span style={{ color: 'var(--ink)', fontSize: 12.5 }}>
            {formatProjectedFinish(projectedFinishMs, now)}
          </span>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--line)' }}>
        {blocks.map((block, i) => {
          const kind = railKindFor(block);
          const isCurrent = block.id === currentBlock?.id;
          const isNext = i === nextIdx;
          const done =
            block.status === 'completed' ||
            block.status === 'skipped' ||
            (block.status === 'scheduled' && block.endTime < now);
          const inkColor = done ? 'var(--faint)' : 'var(--ink)';
          const mutedColor = done ? 'var(--faint)' : 'var(--muted)';
          const profileKey = block.enforcementProfile ?? '';
          const profileLabel = PROFILE_LABEL[profileKey] ?? (profileKey || '—');
          const elapsed = isCurrent
            ? Math.max(
                0,
                Math.min(
                  100,
                  ((now - block.startTime) / Math.max(1, block.endTime - block.startTime)) *
                    100,
                ),
              )
            : 0;
          const task = block.taskId != null ? taskById.get(block.taskId) ?? null : null;
          return (
            <div key={block.id} style={{ borderBottom: '1px solid var(--line)' }}>
              <div style={{
                display: 'flex',
                gap: 12,
                padding: '11px 0',
                opacity: done ? 0.55 : 1,
                position: 'relative',
              }}>
                <div style={{
                  width: 44,
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: mutedColor,
                  paddingTop: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatHHMM(block.startTime)}
                </div>
                <div style={{
                  width: 3,
                  background: blockBarColor(kind),
                  borderRadius: 2,
                  flexShrink: 0,
                  alignSelf: 'stretch',
                  opacity: isCurrent ? 1 : 0.35,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    marginBottom: 2,
                  }}>
                    {isCurrent && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        color: 'var(--accent-ink)',
                        background: 'var(--accent-soft)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}>Now</span>
                    )}
                    {isNext && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        color: 'var(--ink)',
                        background: 'var(--ink-soft)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}>Next</span>
                    )}
                    {kind === 'fixed' && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        color: mutedColor,
                        border: '1px solid var(--line)',
                        padding: '0 5px',
                        borderRadius: 3,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}>Fixed</span>
                    )}
                    {done && <Icons.check size={11} stroke="var(--faint)" />}
                  </div>
                  <div style={{
                    fontSize: 13,
                    color: inkColor,
                    lineHeight: 1.25,
                    textDecoration: done ? 'line-through' : 'none',
                    textDecorationColor: 'var(--faint)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {task?.name ?? block.title}
                  </div>
                  <div style={{
                    fontSize: 11.5,
                    color: mutedColor,
                    fontFamily: 'var(--font-mono)',
                    marginTop: 2,
                  }}>
                    ends {formatHHMM(block.endTime)} · {profileLabel}
                  </div>
                  {isCurrent && (
                    <div style={{
                      marginTop: 7,
                      height: 2,
                      background: 'var(--line)',
                      borderRadius: 1,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${elapsed}%`,
                        height: '100%',
                        background: 'var(--accent)',
                      }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {blocks.length === 0 && (
        <div style={{
          marginTop: 24,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted)',
          lineHeight: 1.5,
        }}>
          No blocks yet today. Open Schedule to plan, or wait for the planner to fill the gap with rest.
        </div>
      )}

      {blocks.length > 0 && (
        <div style={{
          marginTop: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          Tap any block to inspect →
        </div>
      )}
    </aside>
  );
}
