import fs from 'node:fs';
import path from 'node:path';
import {
  resolveBridgeRoot,
  ensureBridgeRoot,
  initSessionWorkspace,
  resolveSessionPaths,
  writeCanonicalConversation,
  writeWorkspaceIndex,
  writeContextManifest,
} from './workspace.js';
import { writeOutboundMessage } from './outboundWriter.js';
import { InboxWatcher } from './inboxWatcher.js';
import { HandshakeManager } from './handshake.js';
import type { DatabaseService } from '../database/index.js';
import type { DesktopCommanderManager } from '../desktopCommanderManager.js';
import type { AntigravityManager } from '../antigravity/antigravityManager.js';
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
import type { Message, Session, Task, ContextDocument, ContextManifest } from '../../shared/types.js';

export interface BridgeServiceOptions {
  customBridgeRoot?: string;
  dbService: DatabaseService;
  commanderManager?: DesktopCommanderManager;
  antigravityManager?: AntigravityManager;
}

export class BridgeService {
  private bridgeRoot: string;
  private dbService: DatabaseService;
  private commanderManager?: DesktopCommanderManager;
  private antigravityManager?: AntigravityManager;
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
    this.antigravityManager = options.antigravityManager;

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

  public setAntigravityManager(mgr: AntigravityManager): void {
    this.antigravityManager = mgr;
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

    // Sync context manifest and materialized documents
    this.syncContextWorkspace(projectId);

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

  public async watchAllSessions(): Promise<void> {
    try {
      const projects = this.dbService.projects.list();
      for (const p of projects) {
        const sessions = this.dbService.sessions.listByProject(p.id);
        for (const s of sessions) {
          const paths = initSessionWorkspace(this.bridgeRoot, p.id, s.id);
          this.watcher.watchInbox(paths.inboxDir);
          await this.watcher.scanInbox(paths.inboxDir, { projectId: p.id, sessionId: s.id });
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

  public syncContextWorkspace(projectId: string): ContextManifest | null {
    try {
      const project = this.dbService.projects.get(projectId);
      if (!project) return null;

      const docs = this.dbService.context.list({ projectId, includeArchived: true });
      const sessions = this.dbService.sessions.listByProject(projectId);

      const manifest = writeContextManifest(this.bridgeRoot, project, docs, sessions);
      this.emitEvent('context-manifest-updated', {
        projectId,
        manifest,
      });
      return manifest;
    } catch (err) {
      console.error(`[BridgeService] Failed to sync context workspace for project ${projectId}:`, err);
      return null;
    }
  }

  public getContextManifest(projectId: string): ContextManifest | null {
    const project = this.dbService.projects.get(projectId);
    if (!project) return null;
    const docs = this.dbService.context.list({ projectId, includeArchived: true });
    const sessions = this.dbService.sessions.listByProject(projectId);
    return writeContextManifest(this.bridgeRoot, project, docs, sessions);
  }

  public getStatus(sessionId?: string): BridgeStatusInfo {
    const targetSessionId = sessionId || this.activeSessionId || null;
    const isRunning = this.commanderManager
      ? this.commanderManager.getStatus().state === 'Running'
      : true;

    const exists = fs.existsSync(this.bridgeRoot);
    let readable = false;
    let writable = false;
    try {
      if (exists) {
        fs.accessSync(this.bridgeRoot, fs.constants.R_OK);
        readable = true;
      }
    } catch {
      readable = false;
    }

    try {
      if (exists) {
        fs.accessSync(this.bridgeRoot, fs.constants.W_OK);
        writable = true;
      }
    } catch {
      writable = false;
    }

    const hasPermissions = readable && writable;

    const handshakeState = this.handshakeManager.getState(
      targetSessionId || undefined,
      hasPermissions,
      isRunning
    );

    const activeChallenge = targetSessionId
      ? this.handshakeManager.getActiveChallenge(targetSessionId)
      : null;

    let sessionPaths: SessionBridgePaths | null = null;
    let effectiveProjectId = this.activeProjectId;
    if (targetSessionId && !effectiveProjectId) {
      const sess = this.dbService.sessions.get(targetSessionId);
      if (sess) {
        effectiveProjectId = sess.projectId;
      }
    }

    if (effectiveProjectId && targetSessionId) {
      const candidatePaths = resolveSessionPaths(
        this.bridgeRoot,
        effectiveProjectId,
        targetSessionId
      );
      if (fs.existsSync(candidatePaths.sessionDir)) {
        sessionPaths = candidatePaths;
      }
    }

    // Watched sessions diagnostics
    const watchedPaths = this.watcher.getWatchedPaths();
    const watchedSessionIds: string[] = [];
    for (const p of watchedPaths) {
      const parts = p.split(path.sep);
      const inboxIdx = parts.lastIndexOf('inbox');
      if (inboxIdx >= 1) {
        watchedSessionIds.push(parts[inboxIdx - 1]);
      }
    }

    // Latest dispatched task
    let latestDispatchedTask: { taskId: string; title: string; timestamp: string } | null = null;
    try {
      const params = targetSessionId ? [targetSessionId] : [];
      const row = this.dbService.db.prepare(`
        SELECT id, title, dispatched_at FROM tasks
        WHERE dispatched_at IS NOT NULL
        ${targetSessionId ? 'AND session_id = ?' : ''}
        ORDER BY dispatched_at DESC
        LIMIT 1
      `).get(...params) as { id: string; title: string; dispatched_at: string } | undefined;
      if (row) {
        latestDispatchedTask = {
          taskId: row.id,
          title: row.title,
          timestamp: row.dispatched_at,
        };
      }
    } catch {
      // ignore
    }

    // Antigravity running state
    const antigravityRunning = this.antigravityManager
      ? this.antigravityManager.isProcessRunning(targetSessionId || undefined)
      : false;

    // Latest published result
    let latestPublishedResult: { taskId: string; messageId: string; timestamp: string } | null = null;
    try {
      const params = targetSessionId ? [targetSessionId] : [];
      const row = this.dbService.db.prepare(`
        SELECT task_id, data_json, created_at FROM events
        WHERE event_type = 'task_result_published'
        ${targetSessionId ? 'AND session_id = ?' : ''}
        ORDER BY created_at DESC
        LIMIT 1
      `).get(...params) as { task_id: string; data_json: string; created_at: string } | undefined;
      if (row) {
        let msgId = '';
        try {
          const parsed = JSON.parse(row.data_json);
          msgId = parsed.messageId || '';
        } catch {
          // ignore
        }
        latestPublishedResult = {
          taskId: row.task_id,
          messageId: msgId,
          timestamp: row.created_at,
        };
      }
    } catch {
      // ignore
    }

    // Unread outbox results
    let unreadResultsCount = 0;
    try {
      if (sessionPaths && fs.existsSync(sessionPaths.outboxDir)) {
        const outboxFiles = fs.readdirSync(sessionPaths.outboxDir);
        unreadResultsCount = outboxFiles.filter(
          (f) => f.endsWith('-result.md') || (f.endsWith('.md') && !f.includes('.tmp.'))
        ).length;
      }
    } catch {
      unreadResultsCount = 0;
    }

    return {
      workspaceInitialized: exists,
      bridgeRoot: this.bridgeRoot,
      exists,
      readable,
      writable,
      watcherActive: this.watcher.isWatching(),
      watchedSessionsCount: watchedSessionIds.length,
      watchedSessionIds,
      desktopCommanderRunning: isRunning,
      mcpPermissionConfigured: hasPermissions,
      handshakeState,
      activeProjectId: effectiveProjectId,
      activeSessionId: targetSessionId,
      lastInboundMessage: this.lastInboundMessage,
      lastOutboundMessage: this.lastOutboundMessage,
      latestDispatchedTask,
      antigravityRunning,
      latestPublishedResult,
      unreadResultsCount,
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
      projectId,
      eventType: 'agent_message_published',
      actor: sender,
      source: 'filesystem_bridge',
      provenance: 'knot_observed',
      title: `Published message to outbox (${sender})`,
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
      const isVerification = meta.category === 'verification' ||
        (typeof meta.category === 'string' && meta.category.toLowerCase().includes('verif')) ||
        (typeof parsedMessage.metadata.title === 'string' && parsedMessage.metadata.title.toLowerCase().includes('verif'));
      const eventType = isVerification ? 'chatgpt_verification' : 'chatgpt_activity';
      const title = typeof parsedMessage.metadata.title === 'string' && parsedMessage.metadata.title
        ? parsedMessage.metadata.title
        : isVerification ? 'ChatGPT verified execution results' : 'ChatGPT activity reported';
      const severity = meta.status === 'failed' || meta.outcome === 'failed' ? 'error' : 'info';

      this.dbService.events.append({
        sessionId,
        projectId,
        taskId: (meta.taskId as string) || null,
        correlationId: (parsedMessage.metadata.correlationId as string) || null,
        eventType,
        actor: sender,
        source: 'chatgpt_bridge',
        provenance: 'chatgpt_reported',
        title,
        severity,
        data: {
          messageId: id,
          category: meta.category || 'other',
          reference: meta.reference || null,
          taskId: meta.taskId || null,
          summary: parsedMessage.bodyMarkdown,
          verifiedCommit: meta.verifiedCommit || null,
          outcome: meta.outcome || meta.status || null,
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

    // If type === 'context_update', validate, store, version in Context Vault, sync files, and emit
    if (type === 'context_update') {
      const meta = (parsedMessage.metadata.metadata || {}) as Record<string, unknown>;
      const rawContextId = typeof meta.contextId === 'string' && meta.contextId ? meta.contextId : undefined;
      const scope = (meta.scope as any) || (rawContextId ? undefined : sessionId ? 'session' : 'project');
      const category = (typeof meta.category === 'string' && meta.category.trim()) || 'recorded_decisions';
      const expectedRevision = typeof meta.expectedRevision === 'number' ? meta.expectedRevision : undefined;
      const expectedContentHash = typeof meta.expectedContentHash === 'string' ? meta.expectedContentHash : undefined;
      const changeSummary = typeof meta.changeSummary === 'string' ? meta.changeSummary : undefined;
      const requiresVerification = typeof meta.requiresVerification === 'boolean' ? meta.requiresVerification : false;

      // Extract title from metadata.title or first markdown heading or default
      let title = typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : '';
      if (!title) {
        const headingMatch = parsedMessage.bodyMarkdown.match(/^#{1,3}\s+(.+)$/m);
        if (headingMatch && headingMatch[1].trim()) {
          title = headingMatch[1].trim();
        } else {
          title = 'Context Document';
        }
      }

      let existingDoc = rawContextId ? this.dbService.context.get(rawContextId) : null;
      let resultDoc: ContextDocument | null = null;

      try {
        if (existingDoc) {
          resultDoc = this.dbService.context.update(existingDoc.id, {
            title,
            contentMarkdown: parsedMessage.bodyMarkdown,
            category,
            author: sender,
            provenance: 'chatgpt-authored',
            expectedRevision,
            expectedContentHash,
            changeSummary,
            requiresVerification,
          });

          this.dbService.events.append({
            sessionId,
            projectId,
            eventType: 'context_updated',
            actor: sender,
            source: 'filesystem_bridge',
            provenance: 'chatgpt_reported',
            title: `Context document updated: ${resultDoc.title}`,
            data: {
              contextId: resultDoc.id,
              revision: resultDoc.currentRevision,
              title: resultDoc.title,
              category: resultDoc.category,
              scope: resultDoc.scope,
            },
          });

          this.emitEvent('context-updated' as any, {
            context: resultDoc,
            projectId,
            sessionId,
          });
        } else {
          resultDoc = this.dbService.context.create({
            id: rawContextId,
            projectId,
            sessionId: scope === 'session' ? sessionId : null,
            scope: scope || 'project',
            category,
            title,
            contentMarkdown: parsedMessage.bodyMarkdown,
            author: sender,
            provenance: 'chatgpt-authored',
            changeSummary: changeSummary || 'Document created from ChatGPT context update',
            requiresVerification,
          });

          this.dbService.events.append({
            sessionId,
            projectId,
            eventType: 'context_created',
            actor: sender,
            source: 'filesystem_bridge',
            provenance: 'chatgpt_reported',
            title: `Context document created: ${resultDoc.title}`,
            data: {
              contextId: resultDoc.id,
              revision: resultDoc.currentRevision,
              title: resultDoc.title,
              category: resultDoc.category,
              scope: resultDoc.scope,
            },
          });

          this.emitEvent('context-created' as any, {
            context: resultDoc,
            projectId,
            sessionId,
          });
        }

        // Sync context manifest and materialized documents to bridge
        this.syncContextWorkspace(projectId);
      } catch (err: unknown) {
        console.warn(`[BridgeService] Context update conflict/error:`, err);
        const errMsg = err instanceof Error ? err.message : String(err);
        this.dbService.events.append({
          sessionId,
          projectId,
          eventType: 'context_conflict_detected',
          actor: 'knot',
          source: 'context_vault',
          provenance: 'knot_observed',
          severity: 'warn',
          title: `Context conflict on document ${rawContextId || 'unknown'}`,
          data: {
            contextId: rawContextId,
            expectedRevision,
            error: errMsg,
          },
        });

        this.emitEvent('context-conflict' as any, {
          contextId: rawContextId,
          projectId,
          sessionId,
          reason: errMsg,
        });
      }

      // Notify external inbound subscribers
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
      projectId,
      eventType: 'bridge_message_received',
      actor: sender,
      source: 'filesystem_bridge',
      provenance: 'knot_observed',
      title: `Inbound bridge message received (${type})`,
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
