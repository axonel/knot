import { useState, useRef, useCallback, useEffect } from 'react';
import type { Task } from '../../shared/types.js';

export interface PendingTaskAction {
  taskId: string;
  taskTitle: string;
  actionType: 'cancel' | 'reject';
  secondsRemaining: number;
  totalSeconds: number;
  scheduledAt: number;
  expiresAt: number;
}

interface ActionTimers {
  timeoutId: NodeJS.Timeout;
  intervalId: NodeJS.Timeout;
}

export function useTaskUndoManager(
  onExecuteAction: (taskId: string, actionType: 'cancel' | 'reject') => Promise<void>
) {
  const [pendingActions, setPendingActions] = useState<Map<string, PendingTaskAction>>(new Map());
  const timersRef = useRef<Map<string, ActionTimers>>(new Map());
  const executeCallbackRef = useRef(onExecuteAction);
  executeCallbackRef.current = onExecuteAction;

  // Cleanup on unmount
  useEffect(() => {
    const currentTimers = timersRef.current;
    return () => {
      currentTimers.forEach(({ timeoutId, intervalId }) => {
        clearTimeout(timeoutId);
        clearInterval(intervalId);
      });
      currentTimers.clear();
    };
  }, []);

  const scheduleAction = useCallback((task: Task, actionType: 'cancel' | 'reject', durationSeconds = 3) => {
    // Prevent duplicate scheduling for the same task
    if (timersRef.current.has(task.id)) {
      return;
    }

    const now = Date.now();
    const durationMs = durationSeconds * 1000;
    const expiresAt = now + durationMs;

    const initialPending: PendingTaskAction = {
      taskId: task.id,
      taskTitle: task.title,
      actionType,
      secondsRemaining: durationSeconds,
      totalSeconds: durationSeconds,
      scheduledAt: now,
      expiresAt,
    };

    setPendingActions((prev) => {
      const next = new Map(prev);
      next.set(task.id, initialPending);
      return next;
    });

    const intervalId = setInterval(() => {
      const remainingMs = expiresAt - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

      setPendingActions((prev) => {
        const item = prev.get(task.id);
        if (!item) return prev;
        const next = new Map(prev);
        next.set(task.id, {
          ...item,
          secondsRemaining: remainingSec,
        });
        return next;
      });
    }, 200);

    const timeoutId = setTimeout(async () => {
      // Clear timers
      clearInterval(intervalId);
      timersRef.current.delete(task.id);

      setPendingActions((prev) => {
        const next = new Map(prev);
        next.delete(task.id);
        return next;
      });

      // Execute backend operation
      try {
        await executeCallbackRef.current(task.id, actionType);
      } catch (err) {
        console.error(`[useTaskUndoManager] Failed executing deferred ${actionType} for ${task.id}:`, err);
      }
    }, durationMs);

    timersRef.current.set(task.id, { timeoutId, intervalId });
  }, []);

  const undoAction = useCallback((taskId: string) => {
    const timers = timersRef.current.get(taskId);
    if (timers) {
      clearTimeout(timers.timeoutId);
      clearInterval(timers.intervalId);
      timersRef.current.delete(taskId);
    }

    setPendingActions((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Map(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  const isTaskPending = useCallback((taskId: string): boolean => {
    return pendingActions.has(taskId);
  }, [pendingActions]);

  const getPendingAction = useCallback((taskId: string): PendingTaskAction | undefined => {
    return pendingActions.get(taskId);
  }, [pendingActions]);

  return {
    pendingActions: Array.from(pendingActions.values()),
    pendingActionsMap: pendingActions,
    scheduleAction,
    undoAction,
    isTaskPending,
    getPendingAction,
  };
}
