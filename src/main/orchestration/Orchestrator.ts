import { EventEmitter } from 'node:events';
import type { DatabaseService } from '../database/index.js';
import type { BridgeService } from '../bridge/bridgeService.js';
import type { AntigravityManager } from '../antigravity/antigravityManager.js';
import type { GitService } from '../git/gitService.js';
import type { Task, TaskStatus } from '../../shared/types.js';
import type { ParsedBridgeMessage } from '../bridge/types.js';
import { TaskQueue } from './TaskQueue.js';
import { TaskDispatcher } from './TaskDispatcher.js';
import { TaskResultPublisher } from './TaskResultPublisher.js';
import { ingestTaskAssignment } from './taskIngestion.js';

export interface OrchestratorOptions {
  dbService: DatabaseService;
  bridgeService: BridgeService;
  antigravityManager: AntigravityManager;
  gitService?: GitService;
}

export class Orchestrator extends EventEmitter {
  private dbService: DatabaseService;
  private bridgeService: BridgeService;
  private antigravityManager: AntigravityManager;
  private gitService?: GitService;
  private queue: TaskQueue;
  private dispatcher: TaskDispatcher;
  private publisher: TaskResultPublisher;
  private unsubscribeBridgeInbound?: () => void;
  private lastAgentResponses = new Map<string, string>();

  constructor(options: OrchestratorOptions) {
    super();
    this.dbService = options.dbService;
    this.bridgeService = options.bridgeService;
    this.antigravityManager = options.antigravityManager;
    this.gitService = options.gitService;

    this.queue = new TaskQueue(this.dbService);
    this.dispatcher = new TaskDispatcher({
      dbService: this.dbService,
      queue: this.queue,
      antigravityManager: this.antigravityManager,
      gitService: this.gitService,
    });
    this.publisher = new TaskResultPublisher(
      this.bridgeService.getBridgeRoot(),
      this.dbService
    );

    this.wireListeners();
  }

  public getQueue(): TaskQueue {
    return this.queue;
  }

  public getDispatcher(): TaskDispatcher {
    return this.dispatcher;
  }

  public getPublisher(): TaskResultPublisher {
    return this.publisher;
  }

  public start(): void {
    // Recover interrupted tasks across sessions on startup
    this.queue.recover();
    this.bridgeService.watchAllSessions();
  }

  private wireListeners(): void {
    // 1. Subscribe to inbound accepted bridge messages
    this.unsubscribeBridgeInbound = this.bridgeService.onInboundAccepted(
      async (parsedMessage: ParsedBridgeMessage) => {
        await this.handleInboundMessage(parsedMessage);
      }
    );

    // 2. Track Antigravity turn completions to grab the latest response for result publishing
    this.antigravityManager.on('event', (evt) => {
      if (evt.type === 'turn_completed' && evt.data?.response) {
        this.lastAgentResponses.set(evt.sessionId, String(evt.data.response));
      }
    });

    // 3. Dispatcher task completion listener
    this.dispatcher.on(
      'task_completed',
      async (
        task: Task,
        turnResult?: { response?: string; executionDetails?: any }
      ) => {
        const response = turnResult?.response || this.lastAgentResponses.get(task.sessionId);
        try {
          await this.publisher.publish({
            task,
            agentResponse: response,
            executionDetails: turnResult?.executionDetails,
          });
        } catch (err) {
          console.error('[Orchestrator] Error publishing task result:', err);
        } finally {
          this.lastAgentResponses.delete(task.sessionId);
          this.bridgeService.syncWorkspaceIndex();
        }
        this.emit('task_completed', task);
      }
    );

    // 4. Dispatcher task failure listener
    this.dispatcher.on('task_failed', async (task: Task) => {
      try {
        await this.publisher.publish({
          task,
        });
      } catch (err) {
        console.error('[Orchestrator] Error publishing failed task result:', err);
      } finally {
        this.lastAgentResponses.delete(task.sessionId);
        this.bridgeService.syncWorkspaceIndex();
      }
      this.emit('task_failed', task);
    });

    // 5. Dispatcher task cancellation listener
    this.dispatcher.on('task_cancelled', async (task: Task) => {
      try {
        await this.publisher.publish({
          task,
        });
      } catch (err) {
        console.error('[Orchestrator] Error publishing cancelled task result:', err);
      } finally {
        this.lastAgentResponses.delete(task.sessionId);
        this.bridgeService.syncWorkspaceIndex();
      }
      this.emit('task_cancelled', task);
    });

    // 6. Forward queue status changes
    this.queue.on('task_status_changed', (task: Task) => {
      this.bridgeService.syncWorkspaceIndex();
      this.emit('task_status_changed', task);
    });
  }

  public async handleInboundMessage(parsedMessage: ParsedBridgeMessage): Promise<void> {
    const { type, sessionId } = parsedMessage.metadata;

    if (type === 'task_assignment') {
      try {
        const { task, isDuplicate } = ingestTaskAssignment(
          parsedMessage,
          this.dbService
        );

        if (!isDuplicate) {
          this.emit('task_created', task);

          // If auto-approved, trigger dispatch immediately
          if (task.status === 'queued' && task.approvalStatus === 'approved') {
            await this.dispatcher.dispatchNext(sessionId);
          }
        }
      } catch (err) {
        console.error('[Orchestrator] Error ingesting task assignment:', err);
      }
    } else if (type === 'task_control') {
      const meta = parsedMessage.metadata.metadata || {};
      const action = meta.action as string | undefined;
      const targetTaskId = meta.taskId as string | undefined;

      if (targetTaskId && action === 'cancel') {
        await this.cancelTask(targetTaskId, 'Cancelled via task_control bridge command');
      } else if (targetTaskId && action === 'retry') {
        await this.retryTask(targetTaskId);
      }
    }
  }

  public async approveTask(taskId: string, expectedContentHash?: string, approver = 'user'): Promise<Task> {
    const task = this.queue.approveTask(taskId, expectedContentHash, approver);
    try {
      await this.dispatcher.dispatchNext(task.sessionId);
    } catch (err) {
      console.warn(`[Orchestrator] Task execution failed or dispatch error after approval:`, err);
    }
    return task;
  }

  public async rejectTask(taskId: string, reason?: string): Promise<Task> {
    const task = this.queue.rejectTask(taskId, reason);
    try {
      await this.publisher.publish({
        task,
      });
    } catch (err) {
      console.error('[Orchestrator] Error publishing rejected task result:', err);
    } finally {
      this.bridgeService.syncWorkspaceIndex();
    }
    return task;
  }

  public async cancelTask(taskId: string, reason?: string): Promise<Task> {
    const existing = this.dbService.tasks.get(taskId);
    if (!existing) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    if (existing.status === 'running') {
      try {
        await this.antigravityManager.cancelTaskTurn(existing.sessionId, reason);
      } catch (err) {
        console.warn(`[Orchestrator] Could not cancel active Antigravity turn for session ${existing.sessionId}:`, err);
      }
    }

    const task = this.queue.cancelTask(taskId, reason);
    try {
      await this.publisher.publish({
        task,
      });
    } catch (err) {
      console.error('[Orchestrator] Error publishing cancelled task result:', err);
    } finally {
      this.bridgeService.syncWorkspaceIndex();
    }
    return task;
  }

  public async retryTask(taskId: string): Promise<Task> {
    const task = this.queue.retryTask(taskId);
    if (task.status === 'queued' && task.approvalStatus === 'approved') {
      try {
        await this.dispatcher.dispatchNext(task.sessionId);
      } catch (err) {
        console.warn(`[Orchestrator] Task execution failed or dispatch error after retry:`, err);
      }
    }
    return task;
  }

  public listTasks(sessionId: string, status?: TaskStatus): Task[] {
    return this.dbService.tasks.listBySession(sessionId, status);
  }

  public close(): void {
    if (this.unsubscribeBridgeInbound) {
      this.unsubscribeBridgeInbound();
    }
    this.dispatcher.stop();
    this.removeAllListeners();
  }
}
