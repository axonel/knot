import fs from 'node:fs';
import path from 'node:path';
import {
  resolveBridgeRoot,
  ensureBridgeRoot,
  initSessionWorkspace,
  resolveSessionPaths,
  writeCanonicalConversation,
  writeWorkspaceIndex,
} from './workspace.js';
import { writeOutboundMessage } from './outboundWriter.js';
import { InboxWatcher } from './inboxWatcher.js';
import { HandshakeManager } from './handshake.js';
import type { DatabaseService } from '../database/index.js';
import type { DesktopCommanderManager } from '../desktopCommanderManager.js';
import type {
  BridgeStatusInfo,
  BridgeInstructions,
  SessionBridgePaths,
  HandshakeChallenge,
  BridgeEvent,
  ParsedBridgeMessage,
  MessageValidationError,
  BridgeMessageType,
  MessageSender,
} from './types.js';
import type { Message, Session, Task } from '../../shared/types.js';

export interface BridgeServiceOptions {
  customBridgeRoot?: string;
  dbService: DatabaseService;
  commanderManager?: DesktopCommanderManager;
}

export class BridgeService {
  private bridgeRoot: string;
  private dbService: DatabaseService;
  private commanderManager?: DesktopCommanderManager;
  private watcher: InboxWatcher;
  private handshakeManager: HandshakeManager;
  private activeSessionId: string | null = null;
  private activeProjectId: string | null = null;
  private eventListeners = new Set<(event: BridgeEvent) => void>();
  private inboundListeners = new Set<(message: ParsedBridgeMessage) => Promise<void> | void>();
  private lastInboundMessage: { id: string; timestamp: string; sender: string } | null = null;
  private lastOutboundMessage: { id: string; timestamp: string; sender: string } | null = null;

  constructor(options: BridgeServiceOptions) {
    this.bridgeRoot = resolveBridgeRoot(options.customBridgeRoot);
    this.dbService = options.dbService;
    this.commanderManager = options.commanderManager;

    ensureBridgeRoot(this.bridgeRoot);

    this.handshakeManager = new HandshakeManager();
    this.watcher = new InboxWatcher({
      onMessageAccepted: (msg) => this.handleInboundAccepted(msg),
      onMessageRejected: (rej) => this.handleInboundRejected(rej),
    });

    this.syncWorkspaceIndex();
  }

  public getBridgeRoot(): string {
    return this.bridgeRoot;
  }

  public onEvent(callback: (event: BridgeEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  public onInboundAccepted(callback: (message: ParsedBridgeMessage) => Promise<void> | void): () => void {
    this.inboundListeners.add(callback);
    return () => {
      this.inboundListeners.delete(callback);
    };
  }

  private emitEvent(type: BridgeEvent['type'], data: Record<string, unknown>): void {
    const event: BridgeEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[BridgeService] Error in event listener:', err);
      }
    }
  }

  public initSessionBridge(projectId: string, sessionId: string): SessionBridgePaths {
    this.activeProjectId = projectId;
    this.activeSessionId = sessionId;

    const paths = initSessionWorkspace(this.bridgeRoot, projectId, sessionId);

    // Watch the session's inbox
    this.watcher.watchInbox(paths.inboxDir);

    // Initial startup/activation scan of existing inbox contents
    this.watcher.scanInbox(paths.inboxDir, { projectId, sessionId }).catch((err) => {
      console.error('[BridgeService] Error scanning inbox on init:', err);
    });

    // Update canonical conversation file with current database state
    this.syncCanonicalConversation(projectId, sessionId, paths.sessionDir);

    // Sync workspace index
    this.syncWorkspaceIndex();

    this.emitEvent('workspace-ready', {
      bridgeRoot: this.bridgeRoot,
      projectId,
      sessionId,
      sessionDir: paths.sessionDir,
    });

    return paths;
  }

  public watchAllSessions(): void {
    try {
      const projects = this.dbService.projects.list();
      for (const p of projects) {
        const sessions = this.dbService.sessions.listByProject(p.id);
        for (const s of sessions) {
          const paths = resolveSessionPaths(this.bridgeRoot, p.id, s.id);
          this.watcher.watchInbox(paths.inboxDir);
        }
      }
      this.syncWorkspaceIndex();
    } catch (err) {
      console.error('[BridgeService] Error in watchAllSessions:', err);
    }
  }

  public syncWorkspaceIndex(): void {
    try {
      const projects = this.dbService.projects.list();
      const sessionsByProject = new Map<string, Session[]>();
      const tasksBySession = new Map<string, Task[]>();

      for (const p of projects) {
        const sessions = this.dbService.sessions.listByProject(p.id);
        sessionsByProject.set(p.id, sessions);
        for (const s of sessions) {
          const tasks = this.dbService.tasks.listBySession(s.id);
          tasksBySession.set(s.id, tasks);
        }
      }

      writeWorkspaceIndex(this.bridgeRoot, projects, sessionsByProject, tasksBySession);
      this.emitEvent('workspace-index-updated', {
        bridgeRoot: this.bridgeRoot,
        projectCount: projects.length,
      });
    } catch (err) {
      console.error('[BridgeService] Failed to sync workspace index:', err);
    }
  }

  public getStatus(sessionId?: string): BridgeStatusInfo {
    const targetSessionId = sessionId || this.activeSessionId || null;
    const isRunning = this.commanderManager
      ? this.commanderManager.getStatus().state === 'Running'
      : true;

    let hasPermissions = false;
    try {
      if (fs.existsSync(this.bridgeRoot)) {
        fs.accessSync(this.bridgeRoot, fs.constants.R_OK | fs.constants.W_OK);
        hasPermissions = true;
      }
    } catch {
      hasPermissions = false;
    }

    const handshakeState = this.handshakeManager.getState(
      targetSessionId || undefined,
      hasPermissions,
      isRunning
    );

    const activeChallenge = targetSessionId
      ? this.handshakeManager.getActiveChallenge(targetSessionId)
      : null;

    let sessionPaths: SessionBridgePaths | null = null;
    if (this.activeProjectId && targetSessionId) {
      const candidatePaths = resolveSessionPaths(
        this.bridgeRoot,
        this.activeProjectId,
        targetSessionId
      );
      if (fs.existsSync(candidatePaths.sessionDir)) {
        sessionPaths = candidatePaths;
      }
    }

    return {
      workspaceInitialized: fs.existsSync(this.bridgeRoot),
      bridgeRoot: this.bridgeRoot,
      desktopCommanderRunning: isRunning,
      mcpPermissionConfigured: hasPermissions,
      handshakeState,
      activeProjectId: this.activeProjectId,
      activeSessionId: targetSessionId,
      lastInboundMessage: this.lastInboundMessage,
      lastOutboundMessage: this.lastOutboundMessage,
      lastVerifiedAt: this.handshakeManager.getLastVerifiedAt(targetSessionId || undefined),
      activeChallenge,
      sessionPaths,
    };
  }

  public getInstructions(projectId: string, sessionId: string): BridgeInstructions {
    const paths = initSessionWorkspace(this.bridgeRoot, projectId, sessionId);
    const project = this.dbService.projects.get(projectId);

    const allowedDirs = [this.bridgeRoot];
    if (project?.repositoryPath && !allowedDirs.includes(project.repositoryPath)) {
      allowedDirs.push(project.repositoryPath);
    }

    const allowedConfigSnippet = JSON.stringify(
      {
        allowedDirectories: allowedDirs,
      },
      null,
      2
    );

    const chatgptPrompt = `Use Desktop Commander to communicate with Knot:
1. First, read the instructions at:
   ${path.join(this.bridgeRoot, 'bridge-instructions.md')}
2. Read the workspace index at:
   ${path.join(this.bridgeRoot, 'workspace-index.md')}
3. Read the current conversation snapshot at:
   ${paths.conversationFile}
4. When sending messages, writing activities or assigning tasks, write Markdown files to the inbox:
   ${paths.inboxDir}/<unique-message-id>.md
5. To check for Knot's responses and task results, read from the outbox:
   ${paths.outboxDir}/
`;

    return {
      bridgeRoot: this.bridgeRoot,
      sessionDir: paths.sessionDir,
      inboxDir: paths.inboxDir,
      outboxDir: paths.outboxDir,
      allowedDirectoriesConfig: allowedConfigSnippet,
      chatgptPrompt,
    };
  }

  public startConnectionTest(projectId: string, sessionId: string): HandshakeChallenge {
    const paths = initSessionWorkspace(this.bridgeRoot, projectId, sessionId);
    const challenge = this.handshakeManager.startChallenge(projectId, sessionId, paths);

    this.dbService.events.append({
      sessionId,
      eventType: 'bridge_handshake_started',
      actor: 'knot',
      data: {
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        outboxFile: challenge.outboxFilePath,
      },
    });

    this.emitEvent('connection-test-started', {
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      outboxFilePath: challenge.outboxFilePath,
      inboxExpectedFilePath: challenge.inboxExpectedFilePath,
    });

    return challenge;
  }

  public async sendMessage(
    projectId: string,
    sessionId: string,
    content: string
  ): Promise<Message> {
    const paths = initSessionWorkspace(this.bridgeRoot, projectId, sessionId);

    // 1. Persist to SQLite messages table
    const message = this.dbService.messages.append({
      sessionId,
      sender: 'knot',
      recipient: 'chatgpt',
      contentMarkdown: content,
      messageType: 'text',
    });

    // 2. Write atomic Markdown message to outbox/knot/
    const written = writeOutboundMessage(paths.outboxDir, projectId, sessionId, content, {
      id: message.id,
      recipient: 'chatgpt',
    });

    // 3. Record outbound event in SQLite
    this.dbService.events.append({
      sessionId,
      eventType: 'bridge_message_published',
      actor: 'knot',
      data: {
        messageId: message.id,
        sequence: message.sequence,
        filePath: written.filePath,
      },
    });

    // 4. Update state and canonical conversation
    this.lastOutboundMessage = {
      id: message.id,
      timestamp: message.createdAt,
      sender: 'knot',
    };

    this.syncCanonicalConversation(projectId, sessionId, paths.sessionDir);

    this.emitEvent('message-published', {
      messageId: message.id,
      sessionId,
      filePath: written.filePath,
      content,
    });

    return message;
  }

  public async publishAgentMessage(options: {
    projectId: string;
    sessionId: string;
    sender: MessageSender;
    recipient?: string;
    contentMarkdown: string;
    bridgeMessageType?: BridgeMessageType;
    dbMessageType?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Message> {
    const { projectId, sessionId, sender, contentMarkdown } = options;
    const paths = initSessionWorkspace(this.bridgeRoot, projectId, sessionId);

    // 1. Persist to SQLite messages table
    const message = this.dbService.messages.append({
      sessionId,
      sender,
      recipient: options.recipient || 'chatgpt',
      contentMarkdown,
      messageType: (options.dbMessageType as any) || 'text',
      correlationId: options.correlationId,
      metadata: options.metadata,
    });

    // 2. Write atomic Markdown message to outbox/knot/ with proper sender
    const written = writeOutboundMessage(paths.outboxDir, projectId, sessionId, contentMarkdown, {
      id: message.id,
      sender,
      recipient: options.recipient || 'chatgpt',
      messageType: options.bridgeMessageType || 'message',
      metadata: options.metadata,
    });

    // 3. Record event in SQLite
    this.dbService.events.append({
      sessionId,
      eventType: 'agent_message_published',
      actor: sender,
      data: {
        messageId: message.id,
        sequence: message.sequence,
        filePath: written.filePath,
        agent: sender,
      },
    });

    // 4. Update state and canonical conversation
    this.lastOutboundMessage = {
      id: message.id,
      timestamp: message.createdAt,
      sender,
    };

    this.syncCanonicalConversation(projectId, sessionId, paths.sessionDir);

    this.emitEvent('message-published', {
      messageId: message.id,
      sessionId,
      filePath: written.filePath,
      content: contentMarkdown,
      sender,
    });

    return message;
  }

  public async handleInboundAccepted(parsedMessage: ParsedBridgeMessage): Promise<void> {
    const { id, projectId, sessionId, sender, recipient, type } = parsedMessage.metadata;

    // Verify session exists in DB
    const session = this.dbService.sessions.get(sessionId);
    if (!session) {
      console.error(`[BridgeService] Unknown session ${sessionId} for inbound message ${id}`);
      return;
    }

    // Update internal status
    this.lastInboundMessage = {
      id,
      timestamp: parsedMessage.metadata.createdAt,
      sender,
    };

    // If type === 'activity', record in events table only (do not pollute messages table or conversation.md)
    if (type === 'activity') {
      const meta = parsedMessage.metadata.metadata || {};
      this.dbService.events.append({
        sessionId,
        eventType: 'chatgpt_activity',
        actor: sender,
        data: {
          messageId: id,
          category: meta.category || 'other',
          reference: meta.reference || null,
          taskId: meta.taskId || null,
          summary: parsedMessage.bodyMarkdown,
        },
      });

      this.emitEvent('activity-received', {
        messageId: id,
        sessionId,
        projectId,
        category: meta.category || 'other',
        reference: meta.reference || null,
        taskId: meta.taskId || null,
        summary: parsedMessage.bodyMarkdown,
      });

      // Notify external inbound subscribers (e.g. Orchestrator)
      for (const listener of this.inboundListeners) {
        try {
          await listener(parsedMessage);
        } catch (err) {
          console.error('[BridgeService] Error in inbound listener:', err);
        }
      }

      this.syncWorkspaceIndex();
      return;
    }

    // 1. Idempotently insert into SQLite messages table
    const savedMessage = this.dbService.messages.append({
      id,
      sessionId,
      sender,
      recipient,
      contentMarkdown: parsedMessage.bodyMarkdown,
      messageType: type,
      metadata: parsedMessage.metadata.metadata,
    });

    // 2. Record auditable event in SQLite events table
    this.dbService.events.append({
      sessionId,
      eventType: 'bridge_message_received',
      actor: sender,
      data: {
        messageId: id,
        sequence: savedMessage.sequence,
        type,
        sender,
      },
    });

    // 3. Update canonical conversation
    const paths = resolveSessionPaths(this.bridgeRoot, projectId, sessionId);
    this.syncCanonicalConversation(projectId, sessionId, paths.sessionDir);

    // 4. Check if this is a handshake response
    if (type === 'handshake_response') {
      const validation = this.handshakeManager.validateResponse(parsedMessage);
      if (validation.valid) {
        this.emitEvent('connection-verified', {
          sessionId,
          challengeId: parsedMessage.metadata.challengeId,
          messageId: id,
        });
      } else {
        this.emitEvent('error', {
          error: `Handshake validation failed: ${validation.reason}`,
          sessionId,
        });
      }
    }

    if (type === 'task_assignment') {
      this.emitEvent('task-assignment-received', {
        messageId: id,
        sessionId,
        projectId,
        message: savedMessage,
      });
    }

    this.emitEvent('message-received', {
      message: savedMessage,
      sessionId,
      projectId,
    });

    // Notify external inbound subscribers (e.g. Orchestrator)
    for (const listener of this.inboundListeners) {
      try {
        await listener(parsedMessage);
      } catch (err) {
        console.error('[BridgeService] Error in inbound listener:', err);
      }
    }

    this.syncWorkspaceIndex();
  }

  public handleInboundRejected(data: {
    filePath: string;
    error: MessageValidationError;
    rawContent?: string;
    projectId?: string;
    sessionId?: string;
  }): void {
    if (data.sessionId) {
      try {
        this.dbService.events.append({
          sessionId: data.sessionId,
          eventType: 'bridge_message_rejected',
          actor: 'knot',
          data: {
            filePath: data.filePath,
            error: data.error,
          },
        });
      } catch {
        // Ignore DB error if session wasn't found
      }
    }

    this.emitEvent('message-rejected', {
      filePath: data.filePath,
      error: data.error,
      sessionId: data.sessionId,
    });
  }

  public syncCanonicalConversation(projectId: string, sessionId: string, sessionDir: string): void {
    try {
      const project = this.dbService.projects.get(projectId);
      const session = this.dbService.sessions.get(sessionId);
      if (!project || !session) return;

      const messages = this.dbService.messages.listBySession(sessionId, { limit: 1000 });
      writeCanonicalConversation(sessionDir, project, session, messages);
    } catch (err) {
      console.error('[BridgeService] Failed to sync canonical conversation:', err);
    }
  }

  public async close(): Promise<void> {
    await this.watcher.close();
    this.eventListeners.clear();
    this.inboundListeners.clear();
  }
}
