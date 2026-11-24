import { EventEmitter } from 'node:events';
import { AntigravityProcess } from './antigravityProcess.js';
import { cliDetector } from './cliDetector.js';
import type { DatabaseService } from '../database/index.js';
import type { BridgeService } from '../bridge/bridgeService.js';
import type {
  AntigravityCapabilities,
  AntigravityStatus,
  AntigravityUiEvent,
  AntigravityExecutionMode,
  Message,
  StartAgentOptions,
} from '../../shared/types.js';

export interface AntigravityManagerOptions {
  dbService: DatabaseService;
  bridgeService: BridgeService;
}

export class AntigravityManager extends EventEmitter {
  private activeProcesses = new Map<string, AntigravityProcess>();
  private dbService: DatabaseService;
  private bridgeService: BridgeService;

  constructor(options: AntigravityManagerOptions) {
    super();
    this.dbService = options.dbService;
    this.bridgeService = options.bridgeService;
  }

  public async detect(customPath?: string): Promise<AntigravityCapabilities> {
    return cliDetector.detect({ customPath });
  }

  public async getStatus(sessionId: string): Promise<AntigravityStatus> {
    const capabilities = cliDetector.getLastCapabilities() || cliDetector.detect();
    const existing = this.activeProcesses.get(sessionId);
    const persisted = this.dbService.agentSessions.getBySession(sessionId, 'antigravity');

    if (existing) {
      return {
        sessionId,
        state: existing.state,
        pid: existing.pid,
        cliConversationId: existing.cliConversationId,
        workingDirectory: existing.config.workingDirectory,
        executionMode: (existing.config.mode as AntigravityExecutionMode) || 'default',
        model: existing.config.model || null,
        effort: existing.config.effort || null,
        lastStartedAt: existing.lastStartedAt,
        lastExitCode: existing.lastExitCode,
        capabilities,
        currentTurnPending: existing.currentTurnPending,
        lastResult: existing.lastResult,
      };
    }

    return {
      sessionId,
      state: capabilities.installed ? 'stopped' : 'unavailable',
      pid: null,
      cliConversationId: persisted?.cliConversationId || null,
      workingDirectory: persisted?.workingDirectory || '',
      executionMode: (persisted?.executionMode as AntigravityExecutionMode) || 'default',
      model: persisted?.model || null,
      effort: persisted?.effort || null,
      lastStartedAt: persisted?.lastStartedAt || null,
      lastExitCode: persisted?.lastExitCode || null,
      capabilities,
      currentTurnPending: false,
      lastResult: null,
    };
  }

  public async start(sessionId: string, options: StartAgentOptions = {}): Promise<void> {
    const capabilities = cliDetector.getLastCapabilities() || cliDetector.detect();
    if (!capabilities.installed || !capabilities.executablePath) {
      throw new Error('Antigravity CLI is not installed or executable path not resolved.');
    }

    const session = this.dbService.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const project = this.dbService.projects.get(session.projectId);
    if (!project) {
      throw new Error(`Project not found: ${session.projectId}`);
    }

    const workingDirectory = project.repositoryPath;
    if (!workingDirectory) {
      throw new Error(`Project "${project.name}" has no repository path configured.`);
    }

    let existingProcess = this.activeProcesses.get(sessionId);
    if (existingProcess && existingProcess.state !== 'stopped' && existingProcess.state !== 'error') {
      return;
    }

    const persistedSession = this.dbService.agentSessions.getBySession(sessionId, 'antigravity');
    const resumeId = options.resumeConversationId || persistedSession?.cliConversationId || undefined;

    const processInstance = new AntigravityProcess({
      sessionId,
      workingDirectory,
      executablePath: options.executablePath || capabilities.executablePath,
      mode: options.mode || (persistedSession?.executionMode as AntigravityExecutionMode) || 'default',
      model: options.model || persistedSession?.model || undefined,
      effort: options.effort || persistedSession?.effort || undefined,
      resumeConversationId: resumeId,
    });

    this.wireProcessEvents(sessionId, processInstance, session.projectId);
    this.activeProcesses.set(sessionId, processInstance);

    // Persist agent session record
    this.dbService.agentSessions.upsert({
      sessionId,
      agentType: 'antigravity',
      workingDirectory,
      executionMode: options.mode || 'default',
      model: options.model || null,
      effort: options.effort || null,
      status: 'starting',
      lastStartedAt: new Date().toISOString(),
    });

    this.dbService.events.append({
      sessionId,
      eventType: 'antigravity_process_started',
      actor: 'antigravity',
      data: {
        workingDirectory,
        mode: options.mode || 'default',
        resuming: !!resumeId,
      },
    });

    await processInstance.start();

    this.dbService.agentSessions.updateStatusBySession(sessionId, 'antigravity', 'ready');
  }

  public async sendMessage(sessionId: string, prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed) {
      throw new Error('Prompt cannot be empty');
    }

    let proc = this.activeProcesses.get(sessionId);
    if (!proc || proc.state === 'stopped' || proc.state === 'error') {
      await this.start(sessionId);
      proc = this.activeProcesses.get(sessionId);
    }

    if (!proc) {
      throw new Error('Failed to start Antigravity process');
    }

    const session = this.dbService.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // 1. Record user prompt in database
    const userMsg = this.dbService.messages.append({
      sessionId,
      sender: 'user',
      recipient: 'antigravity',
      contentMarkdown: trimmed,
      messageType: 'text',
    });

    this.emitEvent('text_delta', sessionId, {
      type: 'user_prompt',
      messageId: userMsg.id,
      prompt: trimmed,
    });

    // 2. Send to Antigravity CLI process via stream-json
    try {
      const result = await proc.sendMessage(trimmed);

      // 3. Update agent session with cliConversationId if returned
      if (result.conversationId) {
        this.dbService.agentSessions.updateConversationIdBySession(sessionId, 'antigravity', result.conversationId);
      }

      // 4. Publish Antigravity's response through the bridge outbox and persist in SQLite
      if (result.response) {
        await this.bridgeService.publishAgentMessage({
          projectId: session.projectId,
          sessionId,
          sender: 'antigravity',
          recipient: 'chatgpt',
          contentMarkdown: result.response,
          bridgeMessageType: 'message',
          dbMessageType: 'text',
          metadata: {
            conversationId: result.conversationId,
            durationSeconds: result.durationSeconds,
            numTurns: result.numTurns,
          },
        });
      }

      this.dbService.events.append({
        sessionId,
        eventType: 'antigravity_turn_completed',
        actor: 'antigravity',
        data: {
          status: result.status,
          durationSeconds: result.durationSeconds,
          numTurns: result.numTurns,
          conversationId: result.conversationId,
        },
      });

      this.emitEvent('turn_completed', sessionId, {
        status: result.status,
        response: result.response,
        durationSeconds: result.durationSeconds,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.dbService.events.append({
        sessionId,
        eventType: 'antigravity_turn_failed',
        actor: 'antigravity',
        data: { error: errorMsg },
      });

      this.emitEvent('error', sessionId, { error: errorMsg });
      throw err;
    }
  }

  public async stop(sessionId: string): Promise<void> {
    const proc = this.activeProcesses.get(sessionId);
    if (!proc) {
      return;
    }

    await proc.stop();
    this.activeProcesses.delete(sessionId);
    this.dbService.agentSessions.updateStatusBySession(sessionId, 'antigravity', 'stopped', proc.lastExitCode ?? 0);

    this.dbService.events.append({
      sessionId,
      eventType: 'antigravity_process_stopped',
      actor: 'antigravity',
      data: { exitCode: proc.lastExitCode },
    });

    this.emitEvent('status_changed', sessionId, { state: 'stopped' });
  }

  public async interrupt(sessionId: string): Promise<void> {
    const proc = this.activeProcesses.get(sessionId);
    if (proc) {
      proc.interrupt();
      this.dbService.events.append({
        sessionId,
        eventType: 'antigravity_interrupted',
        actor: 'user',
        data: {},
      });
    }
  }

  public async resume(sessionId: string): Promise<void> {
    const persisted = this.dbService.agentSessions.getBySession(sessionId, 'antigravity');
    await this.start(sessionId, {
      resumeConversationId: persisted?.cliConversationId || undefined,
      mode: (persisted?.executionMode as AntigravityExecutionMode) || 'default',
    });
  }

  public async getHistory(sessionId: string): Promise<Message[]> {
    return this.dbService.messages.listBySession(sessionId, { limit: 100 });
  }

  public async cleanup(): Promise<void> {
    const stopPromises: Promise<void>[] = [];
    for (const [sessionId, proc] of this.activeProcesses.entries()) {
      stopPromises.push(
        proc.stop().then(() => {
          this.dbService.agentSessions.updateStatusBySession(sessionId, 'antigravity', 'stopped', 0);
        })
      );
    }
    await Promise.all(stopPromises);
    this.activeProcesses.clear();
  }

  private wireProcessEvents(sessionId: string, proc: AntigravityProcess, _projectId: string): void {
    proc.on('state_changed', ({ state }) => {
      this.dbService.agentSessions.updateStatusBySession(sessionId, 'antigravity', state, proc.lastExitCode ?? null);
      this.emitEvent('status_changed', sessionId, { state, pid: proc.pid });
    });

    proc.on('init', (initEvent) => {
      if (initEvent.conversationId) {
        this.dbService.agentSessions.updateConversationIdBySession(sessionId, 'antigravity', initEvent.conversationId);
      }
      this.dbService.events.append({
        sessionId,
        eventType: 'antigravity_init',
        actor: 'antigravity',
        data: {
          conversationId: initEvent.conversationId,
          cwd: initEvent.cwd,
          permissionMode: initEvent.permissionMode,
        },
      });
    });

    proc.on('text_delta', (data) => {
      this.emitEvent('text_delta', sessionId, data);
    });

    proc.on('tool_event', ({ tool, stepIndex }) => {
      const eventType = tool.status === 'done' ? 'tool_completed' : tool.status === 'denied' ? 'tool_denied' : 'tool_started';
      this.dbService.events.append({
        sessionId,
        eventType: `antigravity_${eventType}`,
        actor: 'antigravity',
        data: { tool, stepIndex },
      });

      this.emitEvent(eventType as any, sessionId, { tool, stepIndex });
    });

    proc.on('auth_required', (detail) => {
      this.dbService.agentSessions.updateStatusBySession(sessionId, 'antigravity', 'authentication_required');
      this.emitEvent('auth_required', sessionId, { detail });
    });
  }

  private emitEvent(type: AntigravityUiEvent['type'], sessionId: string, data: Record<string, unknown>): void {
    const event: AntigravityUiEvent = {
      type,
      sessionId,
      timestamp: new Date().toISOString(),
      data,
    };
    this.emit('event', event);
  }
}
