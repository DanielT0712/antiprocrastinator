import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Icons } from './Icons';
import type { Task, TaskGroup, TimeBlock } from '../api/types';
import {
  formatDuration,
  formatHHMM,
  formatRelativeDeadline,
  formatRemaining,
  priorityLabel,
} from '../lib/format';

interface Props {
  block: TimeBlock | null;
  task: Task | null;
  group: TaskGroup | null;
  remainingSecs: number;
  totalSecs: number;
  remainingOnTaskMinutes: number | null;
  blockedAttemptsToday: number;
  onAction: (kind: 'done' | 'extend' | 'pause') => void;
}

const PrimaryBtn = ({
  children,
  onClick,
  narrow,
}: {
  children: ReactNode;
  onClick: () => void;
  narrow: boolean;
}) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      padding: narrow ? '12px 12px' : '14px 18px',
      background: 'var(--btn-primary-bg)',
      color: 'var(--btn-primary-fg)',
      border: 'none',
      borderRadius: 7,
      fontSize: narrow ? 13 : 15,
      fontFamily: 'var(--font-sans)',
      fontWeight: 500,
      cursor: 'pointer',
      letterSpacing: '-0.005em',
      minWidth: 0,
    }}
  >
    {children}
  </button>
);

const SecondaryBtn = ({
  children,
  onClick,
  narrow,
}: {
  children: ReactNode;
  onClick: () => void;
  narrow: boolean;
}) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      padding: narrow ? '12px 10px' : '14px 16px',
      background: 'transparent',
      color: 'var(--ink)',
      border: '1px solid var(--line)',
      borderRadius: 7,
      fontSize: narrow ? 13 : 15,
      fontFamily: 'var(--font-sans)',
      cursor: 'pointer',
      minWidth: 0,
    }}
  >
    {children}
  </button>
);

const kbdStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  opacity: 0.55,
  marginLeft: 6,
  padding: '1px 5px',
  borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.18)',
};

function HeroBody({
  block,
  task,
  group,
  remainingSecs,
  totalSecs,
  remainingOnTaskMinutes,
  blockedAttemptsToday,
  onAction,
}: Props) {
  const elapsed = totalSecs > 0 ? Math.max(0, 1 - remainingSecs / totalSecs) : 0;
  const elapsedSecs = Math.max(0, totalSecs - remainingSecs);

  const blockTitle = block?.title ?? 'No active block';
  const taskName = task?.name ?? blockTitle;
  const subtitleParts: string[] = [];
  if (group) subtitleParts.push(group.name);
  if (task) {
    subtitleParts.push(`${priorityLabel(task.priority)} priority`);
    if (task.deadline) {
      subtitleParts.push(`Due ${formatRelativeDeadline(task.deadline)}`);
    }
    if (remainingOnTaskMinutes != null) {
      subtitleParts.push(`${formatDuration(remainingOnTaskMinutes)} remaining on task`);
    }
  }

  // Responsive collapse: track card width so timer + buttons + progress
  // shrink instead of overflowing at narrow window sizes.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardWidth, setCardWidth] = useState(0);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setCardWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = cardWidth > 0 && cardWidth < 560;
  const veryNarrow = cardWidth > 0 && cardWidth < 420;
  const timerFontSize = veryNarrow ? 64 : narrow ? 84 : 112;

  return (
    <div
      ref={cardRef}
      style={{
        position: 'relative',
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: veryNarrow ? '22px 18px 20px' : '30px 32px 28px',
        background: 'var(--bg-raise)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 16,
        flexWrap: 'wrap',
        minWidth: 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--muted)',
        }}>Current block</span>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--muted)',
          flexWrap: 'wrap',
        }}>
          {block && (
            <>
              <span>{`${formatHHMM(block.startTime)} → ${formatHHMM(block.endTime)}`}</span>
              <span style={{
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: 'var(--muted)',
              }} />
              <span>
                {Math.round((block.endTime - block.startTime) / 60_000)} min scheduled
              </span>
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 26, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: veryNarrow ? 22 : narrow ? 26 : 30,
          fontWeight: 400,
          color: 'var(--ink)',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          wordBreak: 'break-word',
        }}>
          {taskName}
        </div>
        {subtitleParts.length > 0 && (
          <div style={{
            marginTop: 8,
            fontSize: 13,
            color: 'var(--muted)',
            fontFamily: 'var(--font-sans)',
          }}>
            {subtitleParts.join(' · ')}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: veryNarrow ? 14 : 30,
        marginBottom: 24,
        flexWrap: veryNarrow ? 'wrap' : 'nowrap',
        minWidth: 0,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--muted)',
            marginBottom: 6,
          }}>Remaining</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: timerFontSize,
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 0.95,
            letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatRemaining(remainingSecs)}
          </div>
        </div>
        <div style={{
          flex: '1 1 160px',
          paddingBottom: 8,
          maxWidth: 260,
          minWidth: 0,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--muted)',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}>
            <span>Block progress</span>
            <span>{Math.round(elapsed * 100)}%</span>
          </div>
          <div style={{
            height: 4,
            background: 'var(--line)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${elapsed * 100}%`,
              height: '100%',
              background: 'var(--accent)',
            }} />
          </div>
          <div style={{
            marginTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
          }}>
            <span>{formatRemaining(elapsedSecs)} elapsed</span>
            <span>{formatRemaining(remainingSecs)} left</span>
          </div>
        </div>
      </div>

      <div style={{ paddingTop: 22, borderTop: '1px solid var(--line)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: veryNarrow ? 6 : 10,
          minWidth: 0,
        }}>
          <PrimaryBtn narrow={narrow} onClick={() => onAction('done')}>
            <Icons.check size={veryNarrow ? 14 : 18} />
            <span>Done</span>
            {!narrow && <kbd style={kbdStyle}>⌘D</kbd>}
          </PrimaryBtn>
          <SecondaryBtn narrow={narrow} onClick={() => onAction('extend')}>
            <Icons.plus size={veryNarrow ? 14 : 18} />
            {!veryNarrow && <span>Extend</span>}
          </SecondaryBtn>
          <SecondaryBtn narrow={narrow} onClick={() => onAction('pause')}>
            <Icons.pause size={veryNarrow ? 13 : 17} />
            {!veryNarrow && <span>Pause</span>}
          </SecondaryBtn>
        </div>
        <div style={{
          marginTop: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted)',
          textAlign: 'center',
        }}>
          {blockedAttemptsToday} blocked attempts today
        </div>
      </div>
    </div>
  );
}

export function HeroCard(props: Props) {
  return <HeroBody {...props} />;
}

export function useKeyboardHotkey(
  combo: { key: string; meta?: boolean; ctrl?: boolean },
  handler: () => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const metaOk = combo.meta ? e.metaKey || e.ctrlKey : true;
      const ctrlOk = combo.ctrl ? e.ctrlKey : true;
      if (
        e.key.toLowerCase() === combo.key.toLowerCase() &&
        metaOk &&
        ctrlOk
      ) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo.key, combo.meta, combo.ctrl, handler]);
}

export function useDocumentVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return visible;
}
