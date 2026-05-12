import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, onAppEvent } from '../api';
import type {
  BlockDecisionPrompt,
  Task,
  TaskGroup,
  TimeBlock,
} from '../api/types';
import { HeroCard, useKeyboardHotkey } from '../components/HeroCard';
import { TimelineRail } from '../components/TimelineRail';
import {
  BlockEndedModal,
  EmergencyModal,
  ExtendModal,
  PauseModal,
} from '../components/Modals';
import { EmergencyDot } from '../components/EmergencyDot';

type ModalKind = 'extend' | 'pause' | 'emergency' | 'blockEnded' | null;

interface Props {
  onError: (msg: string) => void;
}

const startOfDay = (epochMs: number): number => {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const endOfDay = (epochMs: number): number => {
  const d = new Date(epochMs);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

export function HomeScreen({ onError }: Props) {
  const [block, setBlock] = useState<TimeBlock | null>(null);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [remainingSecs, setRemainingSecs] = useState(0);
  const [totalSecs, setTotalSecs] = useState(0);
  const [modal, setModal] = useState<ModalKind>(null);
  const [projectedFinishMs, setProjectedFinishMs] = useState<number | null>(null);
  const [railOpen, setRailOpen] = useState<boolean>(
    () => localStorage.getItem('ap-home-rail-open') !== '0',
  );

  useEffect(() => {
    localStorage.setItem('ap-home-rail-open', railOpen ? '1' : '0');
  }, [railOpen]);

  // Grow on rail open, shrink back on close. Skipped on initial mount
  // and in fullscreen / maximised. Measure innerSize BEFORE updating
  // setMinSize so a min bump can't silently clobber the current
  // logical width before we compute the new size.
  const prevRailOpen = useRef(false);
  const railDidMount = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWebviewWindow } = await import(
          '@tauri-apps/api/webviewWindow'
        );
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWebviewWindow();
        if (!railDidMount.current) {
          railDidMount.current = true;
          prevRailOpen.current = railOpen;
          return;
        }
        const isFullscreen = await win.isFullscreen().catch(() => false);
        const isMaximized = await win.isMaximized().catch(() => false);
        if (isFullscreen || isMaximized) {
          prevRailOpen.current = railOpen;
          return;
        }
        // Floor matches APM: content is responsive past 480 so the OS
        // window can shrink that far too. Height floor 540 matches
        // tauri.conf.json minHeight.
        const closedMin = 480;
        const minH = 420;
        const railWidth = 320;
        const opening = railOpen && !prevRailOpen.current;
        const closing = !railOpen && prevRailOpen.current;
        const currentSize = await win.innerSize();
        const factor = await win.scaleFactor();
        const logicalWidth = currentSize.width / factor;
        const logicalHeight = currentSize.height / factor;
        if (opening) {
          await win.setSize(
            new LogicalSize(
              logicalWidth + railWidth,
              Math.max(minH, logicalHeight),
            ),
          );
        } else if (closing) {
          await win.setSize(
            new LogicalSize(
              Math.max(closedMin, logicalWidth - railWidth),
              Math.max(minH, logicalHeight),
            ),
          );
        }
        const targetMin = railOpen ? closedMin + railWidth : closedMin;
        await win.setMinSize(new LogicalSize(targetMin, minH));
        prevRailOpen.current = railOpen;
      } catch (err) {
        console.warn('[home] dynamic window resize failed:', err);
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [railOpen]);

  const refreshBlock = useCallback(async () => {
    try {
      const cur = await api.getCurrentBlock();
      setBlock(cur);
      if (cur) {
        const remaining = Math.max(0, Math.round((cur.endTime - Date.now()) / 1000));
        const total = Math.max(1, Math.round((cur.endTime - cur.startTime) / 1000));
        setRemainingSecs(remaining);
        setTotalSecs(total);
      } else {
        setRemainingSecs(0);
        setTotalSecs(0);
      }
    } catch (err) {
      onError(String(err));
    }
  }, [onError]);

  const refreshSchedule = useCallback(async () => {
    try {
      const now = Date.now();
      const list = await api.getScheduleRange(startOfDay(now), endOfDay(now));
      setBlocks(list);
    } catch (err) {
      onError(String(err));
    }
  }, [onError]);

  const refreshTasks = useCallback(async () => {
    try {
      const [taskList, groupList] = await Promise.all([
        api.getTasks(),
        api.getTaskGroups(),
      ]);
      setTasks(taskList);
      setGroups(groupList);
    } catch (err) {
      onError(String(err));
    }
  }, [onError]);

  // Initial load
  useEffect(() => {
    refreshBlock();
    refreshSchedule();
    refreshTasks();
  }, [refreshBlock, refreshSchedule, refreshTasks]);

  // Subscribe to backend events
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let cancelled = false;
    (async () => {
      const u1 = await onAppEvent('timer-tick', (payload) => {
        setRemainingSecs(payload.remainingSecs);
        setTotalSecs(payload.totalSecs);
      });
      const u2 = await onAppEvent('block-changed', (next) => {
        setBlock(next);
        refreshSchedule();
      });
      const u3 = await onAppEvent('block-finished-prompt', (_prompt: BlockDecisionPrompt) => {
        setModal('blockEnded');
      });
      const u4 = await onAppEvent('schedule-warning', (warnings) => {
        if (warnings.length > 0) {
          onError(warnings.map((w) => w.message).join(' / '));
        }
      });
      if (cancelled) {
        u1();
        u2();
        u3();
        u4();
      } else {
        unlisteners.push(u1, u2, u3, u4);
      }
    })();
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [onError, refreshSchedule]);

  // Refresh projected finish for the current task whenever block changes
  useEffect(() => {
    if (!block?.taskId) {
      setProjectedFinishMs(null);
      return;
    }
    let cancelled = false;
    api
      .getProjectedFinish(block.taskId)
      .then((value) => {
        if (!cancelled) setProjectedFinishMs(value);
      })
      .catch(() => {
        if (!cancelled) setProjectedFinishMs(null);
      });
    return () => {
      cancelled = true;
    };
  }, [block?.taskId, blocks]);

  const taskById = useMemo(() => {
    const map = new Map<number, Task>();
    tasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [tasks]);
  const groupById = useMemo(() => {
    const map = new Map<number, TaskGroup>();
    groups.forEach((g) => map.set(g.id, g));
    return map;
  }, [groups]);

  const currentTask = block?.taskId != null ? taskById.get(block.taskId) ?? null : null;
  const currentGroup =
    currentTask?.groupId != null ? groupById.get(currentTask.groupId) ?? null : null;

  const remainingOnTaskMinutes = useMemo(() => {
    if (!currentTask?.estimatedMinutes) return null;
    const taskBlocks = blocks.filter((b) => b.taskId === currentTask.id);
    const now = Date.now();
    let consumedMs = 0;
    for (const b of taskBlocks) {
      if (b.status === 'completed') {
        consumedMs += b.endTime - b.startTime;
      } else if (b.status === 'active' || b.status === 'paused') {
        consumedMs += Math.max(0, Math.min(now, b.endTime) - b.startTime);
      }
    }
    const consumedMin = Math.round(consumedMs / 60_000);
    return Math.max(0, currentTask.estimatedMinutes - consumedMin);
  }, [currentTask, blocks]);

  const visibleBlocks = useMemo(
    () => blocks.filter((b) => b.endTime >= startOfDay(Date.now())),
    [blocks],
  );

  const workBlockCount = useMemo(
    () => visibleBlocks.filter((b) => b.blockType === 'work' || b.source === 'template').length,
    [visibleBlocks],
  );

  const endOfScheduleMs = useMemo(() => {
    const filtered = visibleBlocks.filter(
      (b) =>
        b.blockType !== 'sleep' && b.blockType !== 'meal' && b.blockType !== 'break',
    );
    if (filtered.length === 0) return null;
    return Math.max(...filtered.map((b) => b.endTime));
  }, [visibleBlocks]);

  // Hotkey: Cmd/Ctrl+D = mark done
  useKeyboardHotkey({ key: 'd', meta: true }, () => {
    if (block) {
      api.completeCurrentBlock().catch((err) => onError(String(err)));
    }
  });

  const handleAction = (kind: 'done' | 'extend' | 'pause') => {
    if (kind === 'done') {
      api.completeCurrentBlock().catch((err) => onError(String(err)));
    } else if (kind === 'extend') {
      setModal('extend');
    } else if (kind === 'pause') {
      setModal('pause');
    }
  };

  return (
    <>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        <main style={{
          flex: 1,
          minWidth: 0,
          padding: '32px 36px',
          overflow: 'auto',
          position: 'relative',
        }}>
          <button
            onClick={() => setRailOpen((v) => !v)}
            title={railOpen ? 'Hide today' : 'Show today'}
            style={{
              position: 'absolute',
              top: 18,
              right: 12,
              zIndex: 5,
              width: 26,
              height: 26,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--bg-raise)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: 0,
              transform: railOpen ? 'none' : 'rotate(180deg)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
          <HeroCard
            block={block}
            task={currentTask}
            group={currentGroup}
            remainingSecs={remainingSecs}
            totalSecs={totalSecs}
            remainingOnTaskMinutes={remainingOnTaskMinutes}
            blockedAttemptsToday={0}
            onAction={handleAction}
          />
        </main>
        {railOpen && (
          <TimelineRail
            blocks={visibleBlocks}
            currentBlock={block}
            taskById={taskById}
            projectedFinishMs={projectedFinishMs}
            projectedTaskName={currentTask?.name ?? null}
            endOfDayMs={endOfScheduleMs}
            workBlockCount={workBlockCount}
          />
        )}
      </div>

      <EmergencyDot onClick={() => setModal('emergency')} />

      {modal === 'extend' && <ExtendModal onClose={() => setModal(null)} onError={onError} />}
      {modal === 'pause' && (
        <PauseModal
          onClose={() => setModal(null)}
          block={block}
          remainingSecs={remainingSecs}
          onError={onError}
        />
      )}
      {modal === 'emergency' && (
        <EmergencyModal onClose={() => setModal(null)} onError={onError} />
      )}
      {modal === 'blockEnded' && (
        <BlockEndedModal
          onClose={() => setModal(null)}
          onExtend={() => setModal('extend')}
          taskName={currentTask?.name ?? block?.title}
          onError={onError}
        />
      )}
    </>
  );
}
