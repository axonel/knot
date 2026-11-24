import { EventEmitter } from 'node:events';
import type { DatabaseService } from '../database/index.js';
import type { Task } from '../../shared/types.js';

export interface TaskQueueEvents {
  task_enqueued: (task: Task) => void;
  task_approved: (task: Task) => void;
  task_rejected: (task: Task) => void;
  task_cancelled: (task: Task) => void;
  task_retried: (task: Task) => void;
  task_status_changed: (task: Task) => void;
}

export class TaskQueue extends EventEmitter {
  constructor(private dbService: DatabaseService) {
    super();
  }

  /**
   * Recovers orphaned or interrupted tasks on application startup.
   * Tasks that were left in 'running' state are marked as 'failed' with an explanatory message,
   * preserving diagnostic state and enabling explicit retry without automatic rerun.
   */
  public recover(sessionId?: string): { recoveredCount: number; recoveredTasks: Task[] } {
    let recoveredCount = 0;
    const recoveredTasks: Task[] = [];
    const runningTasks = this.dbService.tasks.listRunning(sessionId);

    for (const task of runningTasks) {
      const updated = this.dbService.tasks.updateExecution(task.id, {
        status: 'failed',
        failureReason: 'Interrupted by application restart: task was in-flight when Knot closed. State preserved for diagnostic inspection or explicit retry.',
        completedAt: new Date().toISOString(),
      });

      this.dbService.events.append({
        sessionId: task.sessionId,
        taskId: task.id,
        eventType: 'task_interrupted',
        actor: 'knot',
        data: {
          taskId: task.id,
          title: task.title,
          interruptedAt: new Date().toISOString(),
          reason: 'Application restarted while task was executing',
        },
      });

      this.emit('task_status_changed', updated);
      recoveredTasks.push(updated);
      recoveredCount++;
    }

    return { recoveredCount, recoveredTasks };
  }

  /**
   * Retrieves the next executable task for a given session.
   * Must have status 'queued' and approvalStatus 'approved'.
   */
  public getNextExecutableTask(sessionId: string): Task | null {
    const queued = this.dbService.tasks.listQueued(sessionId);
    return (
      queued.find((t) => t.status === 'queued' && t.approvalStatus === 'approved') || null
    );
  }

  /**
   * Checks if a session currently has an actively running task.
   */
  public getRunningTask(sessionId: string): Task | null {
    const sessionTasks = this.dbService.tasks.listBySession(sessionId);
    return sessionTasks.find((t) => t.status === 'running') || null;
  }

  /**
   * Approves a task awaiting approval so it can be scheduled for execution.
   */
  public approveTask(taskId: string): Task {
    const task = this.dbService.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    const updated = this.dbService.tasks.updateExecution(taskId, {
      approvalStatus: 'approved',
      status: 'queued',
    });

    this.dbService.events.append({
      sessionId: task.sessionId,
      taskId,
      eventType: 'task_approved',
      actor: 'user',
      data: { taskId },
    });

    this.emit('task_approved', updated);
    this.emit('task_status_changed', updated);
    return updated;
  }

  /**
   * Rejects a task awaiting approval, moving it to cancelled.
   */
  public rejectTask(taskId: string, reason?: string): Task {
    const task = this.dbService.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    const updated = this.dbService.tasks.updateExecution(taskId, {
      approvalStatus: 'rejected',
      status: 'cancelled',
      failureReason: reason || 'Task rejected by user',
      completedAt: new Date().toISOString(),
    });

    this.dbService.events.append({
      sessionId: task.sessionId,
      taskId,
      eventType: 'task_rejected',
      actor: 'user',
      data: { taskId, reason: reason || 'Task rejected by user' },
    });

    this.emit('task_rejected', updated);
    this.emit('task_status_changed', updated);
    return updated;
  }

  /**
   * Cancels a pending, queued, or running task.
   */
  public cancelTask(taskId: string, reason?: string): Task {
    const task = this.dbService.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    const updated = this.dbService.tasks.updateExecution(taskId, {
      status: 'cancelled',
      failureReason: reason || 'Task cancelled by user',
      completedAt: new Date().toISOString(),
    });

    this.dbService.events.append({
      sessionId: task.sessionId,
      taskId,
      eventType: 'task_cancelled',
      actor: 'user',
      data: { taskId, reason: reason || 'Task cancelled by user' },
    });

    this.emit('task_cancelled', updated);
    this.emit('task_status_changed', updated);
    return updated;
  }

  /**
   * Retries a failed or cancelled task.
   */
  public retryTask(taskId: string): Task {
    const task = this.dbService.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    const nextRetry = (task.retryCount || 0) + 1;
    const isApproved = task.approvalStatus === 'approved';
    const updated = this.dbService.tasks.updateExecution(taskId, {
      status: isApproved ? 'queued' : 'awaiting_approval',
      retryCount: nextRetry,
      failureReason: null,
      completedAt: null,
      dispatchedAt: null,
    });

    this.dbService.events.append({
      sessionId: task.sessionId,
      taskId,
      eventType: 'task_retried',
      actor: 'user',
      data: { taskId, retryCount: nextRetry },
    });

    this.emit('task_retried', updated);
    this.emit('task_status_changed', updated);
    return updated;
  }

  /**
   * Lists all tasks for a session.
   */
  public listTasks(sessionId: string): Task[] {
    return this.dbService.tasks.listBySession(sessionId);
  }

  /**
   * Lists queued or pending tasks for a session.
   */
  public listQueuedTasks(sessionId?: string): Task[] {
    return this.dbService.tasks.listQueued(sessionId);
  }
}
