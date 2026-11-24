import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import type { DatabaseService } from '../database/index.js';
import type { TaskQueue } from './TaskQueue.js';
import type { AntigravityManager } from '../antigravity/antigravityManager.js';
import type { GitService } from '../git/gitService.js';
import type { Task, TaskExecutionDetails, TaskGitBoundary } from '../../shared/types.js';
import { formatTaskContract, type AttachedTaskContext } from './taskContract.js';

export interface TaskDispatcherOptions {
  dbService: DatabaseService;
  queue: TaskQueue;
  antigravityManager: AntigravityManager;
  gitService?: GitService;
}

export class TaskDispatcher extends EventEmitter {
  private dbService: DatabaseService;
  private queue: TaskQueue;
  private antigravityManager: AntigravityManager;
  private gitService?: GitService;
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
    this.gitService = options.gitService;
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

    if (session.status === 'archived') {
      const completedAt = new Date().toISOString();
      const failureReason = 'Session is archived. Tasks cannot be executed in archived sessions.';
      const cancelledTask = this.dbService.tasks.updateExecution(task.id, {
        status: 'cancelled',
        failureReason,
        completedAt,
      });
      this.dbService.events.append({
        sessionId: task.sessionId,
        taskId: task.id,
        eventType: 'task_cancelled',
        actor: 'knot',
        data: {
          taskId: task.id,
          reason: failureReason,
          completedAt,
        },
      });
      this.emit('task_status_changed', cancelledTask);
      return cancelledTask;
    }

    const project = this.dbService.projects.get(session.projectId);
    if (!project) {
      throw new Error(`Project "${session.projectId}" not found.`);
    }

    const workingDirectory = project.repositoryPath || '';
    if (!workingDirectory) {
      throw new Error(`Project "${project.name}" does not have a repository path configured.`);
    }

    if (!fs.existsSync(workingDirectory)) {
      const completedAt = new Date().toISOString();
      const errorMsg = `Project repository directory is inaccessible or missing: "${workingDirectory}".`;
      const failedTask = this.dbService.tasks.updateExecution(task.id, {
        status: 'failed',
        failureReason: errorMsg,
        completedAt,
      });
      this.dbService.events.append({
        sessionId: task.sessionId,
        taskId: task.id,
        eventType: 'task_failed',
        actor: 'knot',
        data: {
          taskId: task.id,
          error: errorMsg,
          completedAt,
        },
      });
      this.emit('task_failed', failedTask, errorMsg);
      throw new Error(errorMsg);
    }

    // Capture Git boundary start snapshot if gitService is available
    let gitBoundary: TaskGitBoundary | null = null;
    if (this.gitService) {
      try {
        gitBoundary = await this.gitService.captureTaskBoundaryStart(task.id, workingDirectory, workingDirectory);
      } catch (err) {
        console.warn(`[TaskDispatcher] Could not capture Git boundary start for task "${task.id}":`, err);
      }
    }

    // 1. Transition task to running
    const dispatchedAt = new Date().toISOString();
    const runningTask = this.dbService.tasks.updateExecution(task.id, {
      status: 'running',
      dispatchedAt,
      gitBoundary,
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
        gitStartHead: gitBoundary?.start.head || null,
        gitStartClean: gitBoundary?.start.isClean ?? null,
      },
    });

    this.emit('task_dispatched', runningTask);

    // Resolve referenced context documents if any
    const referencedContexts: AttachedTaskContext[] = [];
    if (runningTask.contextReferences && runningTask.contextReferences.length > 0 && this.dbService.context) {
      for (const ref of runningTask.contextReferences) {
        try {
          const doc = this.dbService.context.get(ref.contextId);
          // Boundary enforcement: validate project ownership and non-archived status
          if (doc && doc.projectId === project.id && !doc.isArchived) {
            let content = doc.contentMarkdown;
            let revNum = doc.currentRevision;
            let docTitle = doc.title;
            if (ref.revision !== undefined && ref.revision !== doc.currentRevision) {
              const revDoc = this.dbService.context.getRevision(doc.id, ref.revision);
              if (revDoc) {
                content = revDoc.contentMarkdown;
                revNum = revDoc.revision;
                docTitle = revDoc.title;
              }
            }
            referencedContexts.push({
              id: doc.id,
              title: docTitle,
              category: doc.category,
              contentMarkdown: content,
              revision: revNum,
            });
          }
        } catch (err) {
          console.warn(`[TaskDispatcher] Could not resolve context reference ${ref.contextId}:`, err);
        }
      }
    }

    // 2. Format task prompt contract with read-only referenced context
    const prompt = formatTaskContract(runningTask, workingDirectory, referencedContexts);

    // 3. Send prompt to AntigravityManager
    try {
      let turnResult: { response?: string; executionDetails?: TaskExecutionDetails } | undefined;
      if (typeof (this.antigravityManager as any).executeTaskTurn === 'function') {
        turnResult = await (this.antigravityManager as any).executeTaskTurn(
          task.sessionId,
          prompt,
          { taskId: task.id }
        );
      } else {
        await this.antigravityManager.sendMessage(task.sessionId, prompt);
      }

      // Capture Git boundary completion snapshot
      if (this.gitService && gitBoundary) {
        try {
          const reportedHash = turnResult?.executionDetails?.commitHash;
          gitBoundary = await this.gitService.captureTaskBoundaryEnd(
            gitBoundary,
            workingDirectory,
            reportedHash,
            workingDirectory
          );
        } catch (err) {
          console.warn(`[TaskDispatcher] Could not capture Git boundary end for task "${task.id}":`, err);
        }
      }

      // Succeeded
      const completedAt = new Date().toISOString();
      const succeededTask = this.dbService.tasks.updateExecution(task.id, {
        status: 'succeeded',
        completedAt,
        gitBoundary,
      });

      this.dbService.events.append({
        sessionId: task.sessionId,
        taskId: task.id,
        eventType: 'task_succeeded',
        actor: 'antigravity',
        data: {
          taskId: task.id,
          completedAt,
          gitEndHead: gitBoundary?.end?.head || null,
          gitVerifiedCommit: gitBoundary?.verifiedCommitHash || null,
        },
      });

      this.emit('task_completed', succeededTask, turnResult);

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

      if (this.gitService && gitBoundary) {
        try {
          gitBoundary = await this.gitService.captureTaskBoundaryEnd(
            gitBoundary,
            workingDirectory,
            null,
            workingDirectory
          );
        } catch (gitErr) {
          console.warn(`[TaskDispatcher] Could not capture Git boundary end for failed task "${task.id}":`, gitErr);
        }
      }

      const failedTask = this.dbService.tasks.updateExecution(task.id, {
        status: 'failed',
        failureReason: errorMsg,
        completedAt,
        gitBoundary,
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
