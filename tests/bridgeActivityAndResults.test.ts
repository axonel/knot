import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { TaskResultPublisher } from '../src/main/orchestration/TaskResultPublisher.js';
import { parseBridgeMessage } from '../src/main/bridge/protocol.js';

describe('ChatGPT Activity & Task Result Bridge Protocols', () => {
  let tempDir: string;
  let bridgeRoot: string;
  let dbService: DatabaseService;
  let bridgeService: BridgeService;
  let projectId: string;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-bridge-act-test-'));
    bridgeRoot = path.join(tempDir, 'bridge', 'v1');
    const dbPath = path.join(tempDir, 'test.sqlite');
    dbService = createDatabaseService(dbPath);

    bridgeService = new BridgeService({
      customBridgeRoot: bridgeRoot,
      dbService,
    });

    const project = dbService.projects.create({
      name: 'Activity Project',
      repositoryPath: tempDir,
    });
    projectId = project.id;

    const session = dbService.sessions.create({
      projectId,
      title: 'Activity Session',
    });
    sessionId = session.id;

    bridgeService.initSessionBridge(projectId, sessionId);
  });

  afterEach(async () => {
    await bridgeService.close();
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('generates and updates workspace-index.md with projects, sessions, and tasks', () => {
    const indexPath = path.join(bridgeRoot, 'workspace-index.md');
    expect(fs.existsSync(indexPath)).toBe(true);

    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    expect(indexContent).toContain('# Knot Workspace Index');
    expect(indexContent).toContain('Activity Project');
    expect(indexContent).toContain('Activity Session');
    expect(indexContent).toContain(tempDir);
  });

  it('handles activity messages into events table without polluting messages table', async () => {
    const messageId = randomUUID();
    const parsedMessage = {
      metadata: {
        id: messageId,
        protocol: 'v1' as const,
        projectId,
        sessionId,
        sender: 'chatgpt' as const,
        recipient: 'knot' as const,
        type: 'activity' as const,
        createdAt: new Date().toISOString(),
        metadata: {
          category: 'repo_inspection',
          reference: 'src/main/index.ts',
        },
      },
      bodyMarkdown: 'Reviewed Electron lifecycle hooks in src/main/index.ts',
      rawContent: '',
      filePath: '/dummy.md',
    };

    await bridgeService.handleInboundAccepted(parsedMessage);

    // Verify messages table does NOT contain the activity message
    const messages = dbService.messages.listBySession(sessionId);
    const foundMsg = messages.find((m) => m.id === messageId);
    expect(foundMsg).toBeUndefined();

    // Verify events table contains the chatgpt_activity event
    const events = dbService.events.listBySession(sessionId);
    const actEvent = events.find((e) => e.eventType === 'chatgpt_activity');
    expect(actEvent).toBeDefined();
    expect(actEvent?.data).toMatchObject({
      category: 'repo_inspection',
      reference: 'src/main/index.ts',
      summary: 'Reviewed Electron lifecycle hooks in src/main/index.ts',
    });
  });

  it('publishes task results to outbox and deterministic task-<id>-result.md file', async () => {
    const task = dbService.tasks.create({
      sessionId,
      title: 'Fix issue #12',
      description: 'Fix bug in auth provider',
      status: 'succeeded',
      approvalStatus: 'approved',
      priority: 'high',
    });

    const publisher = new TaskResultPublisher(bridgeRoot, dbService);
    const published = await publisher.publish({
      task,
      agentResponse: 'Fixed bug in auth provider. Added 3 test cases, all passing.',
    });

    expect(fs.existsSync(published.filePath)).toBe(true);
    expect(fs.existsSync(published.deterministicFilePath)).toBe(true);
    expect(published.deterministicFilePath).toContain(`task-${task.id}-result.md`);

    // Verify outbox file content
    const content = fs.readFileSync(published.deterministicFilePath, 'utf-8');
    const parsed = parseBridgeMessage(content, published.deterministicFilePath);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.message.metadata.type).toBe('task_result');
      expect(parsed.message.metadata.sender).toBe('knot');
      expect(parsed.message.metadata.recipient).toBe('chatgpt');
      expect(parsed.message.bodyMarkdown).toContain('Task Result: Fix issue #12');
      expect(parsed.message.bodyMarkdown).toContain('SUCCEEDED');
      expect(parsed.message.bodyMarkdown).toContain('Fixed bug in auth provider');
    }

    // Check task record was updated with resultMessageId
    const updatedTask = dbService.tasks.get(task.id);
    expect(updatedTask?.resultMessageId).toBe(published.messageId);

    // Check canonical conversation was updated
    const convPath = path.join(
      bridgeRoot,
      'projects',
      projectId,
      'sessions',
      sessionId,
      'conversation.md'
    );
    const convContent = fs.readFileSync(convPath, 'utf-8');
    expect(convContent).toContain('Task Result: Fix issue #12');
  });
});
