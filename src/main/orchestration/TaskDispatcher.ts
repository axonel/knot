import { EventEmitter } from 'node:events';
import type { DatabaseService } from '../database/index.js';
import type { TaskQueue } from './TaskQueue.js';
import type { AntigravityManager } from '../antigravity/antigravityManager.js';
import type { GitService } from '../git/gitService.js';
import type { Task, TaskExecutionDetails, TaskGitBoundary } from '../../shared/types.js';
import { formatTaskContract, type AttachedTaskContext } from './taskContract.js';
import { verifyTaskContentIntegrity } from './TaskPolicy.js';
import { validateRepositoryPath } from '../git/gitSecurity.js';

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
  private acceptingTasks = true;

  public destroy(): void {
    for (const timer of this.pendingTimeouts) {
      clearTimeout(timer);
    }
    this.pendingTimeouts.clear();
    this.removeAllListeners();
  }

  public stop(): void {
    this.acceptingTasks = false;
    this.destroy();
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
   * Atomically claims the task using compare-and-swap, enforcing FIFO ordering,
   * session concurrency of 1, and safety approval checks.
   */
  public async dispatchNext(sessionId: string): Promise<Task | null> {
    if (!this.acceptingTasks) {
      return null;
    }

    if (this.dispatchingSessions.has(sessionId)) {
      return null;
    }

    this.dispatchingSessions.add(sessionId);

    try {
      const claimed = this.queue.claimNextExecutable(sessionId);
      if (!claimed) {
        return null;
      }

      return await this.executeTask(claimed);
    } finally {
      this.dispatchingSessions.delete(sessionId);
    }
  }

  /**
   * Executes a specific approved task.
   */
  public async executeTask(task: Task, options?: { timeoutMs?: number }): Promise<Task> {
    if (task.approvalStatus !== 'approved') {
      throw new Error(`Cannot execute task "${task.id}": approvalStatus is "${task.approvalStatus}" (must be "approved").`);
    }

    // Verify task content integrity against approved hash (prevent tampering)
    if (task.approvedContentHash) {
      const integrity = verifyTaskContentIntegrity(task);
      if (!integrity.valid) {
        const failureReason = 'Task instructions were modified after approval. Approval revoked for safety.';
        const revokedTask = this.dbService.tasks.updateExecution(task.id, {
          approvalStatus: 'awaiting_approval',
          status: 'awaiting_approval',
          approvedContentHash: null,
          approvedBy: null,
          approvedAt: null,
          failureReason,
        });
        this.dbService.events.append({
          sessionId: task.sessionId,
          taskId: task.id,
          eventType: 'approval_revoked',
          actor: 'knot',
          severity: 'warning',
          title: `Approval Revoked: ${task.title} (content modified after approval)`,
          data: {
            taskId: task.id,
            reason: failureReason,
            expectedHash: integrity.expectedHash,
            currentHash: integrity.currentHash,
          },
        });
        this.emit('task_status_changed', revokedTask);
        throw new Error(`Execution blocked: task "${task.id}" content was modified after approval. Approval has been revoked.`);
      }
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

    const rawWorkingDirectory = project.repositoryPath || '';
    if (!rawWorkingDirectory) {
      throw new Error(`Project "${project.name}" does not have a repository path configured.`);
    }

    let workingDirectory: string;
    try {
      workingDirectory = validateRepositoryPath(rawWorkingDirectory);
    } catch (err: unknown) {
      const completedAt = new Date().toISOString();
      const errorMsg = `Project repository directory is inaccessible or missing: validation failed: ${err instanceof Error ? err.message : String(err)}`;
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
        if (gitBoundary) {
          this.dbService.events.append({
            projectId: project.id,
            sessionId: task.sessionId,
            taskId: task.id,
            correlationId: task.id,
            eventType: 'git_boundary_captured',
            actor: 'git',
            source: 'local_git',
            provenance: 'git_verified',
            title: `Git Baseline Captured: ${task.title}`,
            data: {
              phase: 'start',
              branch: gitBoundary.start.branch,
              head: gitBoundary.start.head,
              isClean: gitBoundary.start.isClean,
              stagedCount: gitBoundary.start.stagedFiles.length,
              unstagedCount: gitBoundary.start.unstagedFiles.length,
              untrackedCount: gitBoundary.start.untrackedFiles.length,
            },
          });
        }
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
      projectId: project.id,
      sessionId: task.sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'task_dispatched',
      actor: 'knot',
      source: 'orchestration_runtime',
      provenance: 'knot_observed',
      title: `Task Dispatched to Antigravity: ${task.title}`,
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
          { taskId: task.id, timeoutMs: options?.timeoutMs }
        );
      } else {
        await this.antigravityManager.sendMessage(task.sessionId, prompt);
      }

      // Check if task was cancelled in the background while Antigravity was executing
      const checkTask = this.dbService.tasks.get(task.id);
      if (checkTask?.status === 'cancelled') {
        this.emit('task_cancelled', checkTask);
        return checkTask;
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
          if (gitBoundary && gitBoundary.end) {
            this.dbService.events.append({
              projectId: project.id,
              sessionId: task.sessionId,
              taskId: task.id,
              correlationId: task.id,
              eventType: 'git_boundary_captured',
              actor: 'git',
              source: 'local_git',
              provenance: 'git_verified',
              title: `Git Completion Verified: ${task.title}`,
              data: {
                phase: 'end',
                branch: gitBoundary.end.branch,
                head: gitBoundary.end.head,
                isClean: gitBoundary.end.isClean,
                stagedCount: gitBoundary.end.stagedFiles.length,
                unstagedCount: gitBoundary.end.unstagedFiles.length,
                untrackedCount: gitBoundary.end.untrackedFiles.length,
                verifiedCommitHash: gitBoundary.verifiedCommitHash || null,
              },
            });
          }
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
        projectId: project.id,
        sessionId: task.sessionId,
        taskId: task.id,
        correlationId: task.id,
        eventType: 'task_completed',
        actor: 'knot',
        source: 'orchestration_runtime',
        provenance: 'knot_observed',
        title: `Task Completed: ${task.title}`,
        severity: 'success',
        data: {
          taskId: task.id,
          completedAt,
          gitEndHead: gitBoundary?.end?.head || null,
          gitVerifiedCommit: gitBoundary?.verifiedCommitHash || null,
        },
      });

      this.dbService.events.append({
        projectId: project.id,
        sessionId: task.sessionId,
        taskId: task.id,
        correlationId: task.id,
        eventType: 'task_succeeded',
        actor: 'antigravity',
        source: 'antigravity_cli',
        provenance: 'antigravity_reported',
        title: `Task Execution Succeeded: ${task.title}`,
        severity: 'success',
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

      // If task was cancelled while running or error is cancellation/abort, preserve cancelled status
      const currentTask = this.dbService.tasks.get(task.id);
      if (
        currentTask?.status === 'cancelled' ||
        errorMsg.toLowerCase().includes('turn aborted') ||
        errorMsg.toLowerCase().includes('cancelled')
      ) {
        if (currentTask?.status !== 'cancelled') {
          const cancelledTask = this.dbService.tasks.updateExecution(task.id, {
            status: 'cancelled',
            failureReason: currentTask?.failureReason || errorMsg,
            completedAt,
            gitBoundary,
          });
          this.emit('task_cancelled', cancelledTask);
          return cancelledTask;
        }
        this.emit('task_cancelled', currentTask);
        return currentTask;
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
        correlationId: task.id,
        eventType: 'task_failed',
        actor: 'knot',
        source: 'orchestration_runtime',
        provenance: 'knot_observed',
        title: `Task Execution Failed: ${task.title}`,
        severity: 'error',
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
