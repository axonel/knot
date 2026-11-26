import type { TaskStatus } from './types.js';

/**
 * Legal task status transitions matrix.
 * Enforces strict lifecycle rules:
 * - A task awaiting approval cannot run directly without approval.
 * - A cancelled or terminal succeeded task cannot be dispatched directly.
 * - A running task cannot be marked completed without having entered running.
 * - A task cannot be retried while still running.
 */
export const LEGAL_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['running', 'awaiting_approval', 'cancelled', 'failed', 'interrupted'],
  awaiting_approval: ['approved', 'queued', 'cancelled', 'failed'],
  approved: ['queued', 'running', 'cancelled', 'failed'],
  running: ['succeeded', 'failed', 'cancelled', 'interrupted'],
  succeeded: [], // terminal state
  failed: ['queued', 'awaiting_approval'], // via explicit retry
  cancelled: ['queued', 'awaiting_approval'], // via explicit retry
  interrupted: ['queued', 'awaiting_approval'], // via explicit retry
  needs_attention: ['queued', 'awaiting_approval', 'cancelled'],
};

/**
 * Validates whether transitioning a task from `fromStatus` to `toStatus` is permitted.
 */
export function canTransitionTask(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
  if (fromStatus === toStatus) {
    return true;
  }
  const permitted = LEGAL_TASK_TRANSITIONS[fromStatus];
  return permitted ? permitted.includes(toStatus) : false;
}

/**
 * Asserts that a task status transition is permitted, throwing a descriptive error if invalid.
 */
export function assertLegalTaskTransition(taskId: string, fromStatus: TaskStatus, toStatus: TaskStatus): void {
  if (!canTransitionTask(fromStatus, toStatus)) {
    throw new Error(
      `Illegal task transition for "${taskId}": cannot transition from "${fromStatus}" to "${toStatus}".`
    );
  }
}
