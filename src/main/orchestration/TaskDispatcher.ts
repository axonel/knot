import { EventEmitter } from 'node:events';
import type { DatabaseService } from '../database/index.js';
import type { TaskQueue } from './TaskQueue.js';
import type { AntigravityManager } from '../antigravity/antigravityManager.js';
import type { Task } from '../../shared/types.js';
import { formatTaskContract } from './taskContract.js';

export interface TaskDispatcherOptions {
  dbService: DatabaseService;
  queue: TaskQueue;
  antigravityManager: AntigravityManager;
}

export class TaskDispatcher extends EventEmitter {
  private dbService: DatabaseService;
  private queue: TaskQueue;
  private antigravityManager: AntigravityManager;
  private dispatchingSessions = new Set<string>();
  private pendingTimeouts = new Set<NodeJS.Timeout>();

  public destroy(): void {
    for (const timer of this.pendingTimeouts) {
      clearTimeout(timer);
    }
    this.pendingTimeouts.clear();
    this.removeAllListeners();
  }

  constructor(options: TaskDispatcherOptions) {
    super();
    this.dbService = options.dbService;
    this.queue = options.queue;
    this.antigravityManager = options.antigravityManager;
  }

  /**
   * Attempts to dispatch the next ready and approved task for a given session.
   * Enforces FIFO ordering, session concurrency of 1, and safety approval checks.
   */
  public async dispatchNext(sessionId: string): Promise<Task | null> {
    if (this.dispatchingSessions.has(sessionId)) {
      return null;
    }

    const running = this.queue.getRunningTask(sessionId);
    if (running) {
      return null;
    }

    const candidate = this.queue.getNextExecutableTask(sessionId);
    if (!candidate) {
      return null;
    }

    if (candidate.approvalStatus !== 'approved') {
      return null;
    }

    this.dispatchingSessions.add(sessionId);

    try {
      return await this.executeTask(candidate);
    } finally {
      this.dispatchingSessions.delete(sessionId);
    }
  }

  /**
   * Executes a specific approved task.
   */
  public async executeTask(task: Task): Promise<Task> {
    if (task.approvalStatus !== 'approved') {
      throw new Error(`Cannot execute task "${task.id}": approvalStatus is "${task.approvalStatus}" (must be "approved").`);
    }

    const session = this.dbService.sessions.get(task.sessionId);
    if (!session) {
      throw new Error(`Session "${task.sessionId}" not found.`);
    }

    const project = this.dbService.projects.get(session.projectId);
    if (!project) {
      throw new Error(`Project "${session.projectId}" not found.`);
    }

    const workingDirectory = project.repositoryPath || '';
    if (!workingDirectory) {
      throw new Error(`Project "${project.name}" does not have a repository path configured.`);
    }

    // 1. Transition task to running
    const dispatchedAt = new Date().toISOString();
    const runningTask = this.dbService.tasks.updateExecution(task.id, {
      status: 'running',
      dispatchedAt,
    });

    this.dbService.events.append({
      sessionId: task.sessionId,
      taskId: task.id,
      eventType: 'task_dispatched',
      actor: 'knot',
      data: {
        taskId: task.id,
        title: task.title,
        dispatchedAt,
        workingDirectory,
      },
    });

    this.emit('task_dispatched', runningTask);

    // 2. Format task prompt contract
    const prompt = formatTaskContract(runningTask, workingDirectory);

    // 3. Send prompt to AntigravityManager
    try {
      await this.antigravityManager.sendMessage(task.sessionId, prompt);

      // Succeeded
      const completedAt = new Date().toISOString();
      const succeededTask = this.dbService.tasks.updateExecution(task.id, {
        status: 'succeeded',
        completedAt,
      });

      this.dbService.events.append({
        sessionId: task.sessionId,
        taskId: task.id,
        eventType: 'task_succeeded',
        actor: 'antigravity',
        data: {
          taskId: task.id,
          completedAt,
        },
      });

      this.emit('task_completed', succeededTask);

      // Trigger next task in queue for this session
      const timer = setTimeout(() => {
        this.pendingTimeouts.delete(timer);
        this.dispatchNext(task.sessionId).catch((err) => {
          if (err?.message?.includes('database is not open') || err?.code === 'ERR_INVALID_STATE') return;
          console.error('[TaskDispatcher] Error dispatching next task:', err);
        });
      }, 50);
      this.pendingTimeouts.add(timer);

      return succeededTask;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const completedAt = new Date().toISOString();

      const failedTask = this.dbService.tasks.updateExecution(task.id, {
        status: 'failed',
        failureReason: errorMsg,
        completedAt,
      });

      this.dbService.events.append({
        sessionId: task.sessionId,
        taskId: task.id,
        eventType: 'task_failed',
        actor: 'antigravity',
        data: {
          taskId: task.id,
          error: errorMsg,
          completedAt,
        },
      });

      this.emit('task_failed', failedTask, errorMsg);
      throw err;
    }
  }
}
