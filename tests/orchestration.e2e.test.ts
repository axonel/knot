import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { AntigravityManager } from '../src/main/antigravity/antigravityManager.js';
import { Orchestrator } from '../src/main/orchestration/Orchestrator.js';
import { formatBridgeMessage, parseBridgeMessage } from '../src/main/bridge/protocol.js';

describe('End-to-End Orchestration & Task Handoff Engine', () => {
  let tempDir: string;
  let bridgeRoot: string;
  let repoPath: string;
  let dbService: DatabaseService;
  let bridgeService: BridgeService;
  let mockAgyManager: Partial<AntigravityManager>;
  let orchestrator: Orchestrator;
  let projectId: string;
  let sessionId: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-orch-e2e-'));
    bridgeRoot = path.join(tempDir, 'bridge', 'v1');
    repoPath = path.join(tempDir, 'my-repo');
    fs.mkdirSync(repoPath, { recursive: true });

    const dbPath = path.join(tempDir, 'test.sqlite');
    dbService = createDatabaseService(dbPath);

    bridgeService = new BridgeService({
      customBridgeRoot: bridgeRoot,
      dbService,
    });

    const project = dbService.projects.create({
      name: 'E2E Project',
      repositoryPath: repoPath,
    });
    projectId = project.id;
    dbService.projects.updateTrustPolicy(projectId, 'trusted');

    const session = dbService.sessions.create({
      projectId,
      title: 'E2E Session',
    });
    sessionId = session.id;

    bridgeService.initSessionBridge(projectId, sessionId);

    // Mock AntigravityManager
    const eventListeners = new Set<(event: any) => void>();
    mockAgyManager = {
      on: vi.fn().mockImplementation((event: string, handler: any) => {
        if (event === 'event') {
          eventListeners.add(handler);
        }
        return mockAgyManager;
      }),
      sendMessage: vi.fn().mockImplementation(async (sId: string, prompt: string) => {
        // Emit simulated turn completion
        for (const listener of eventListeners) {
          listener({
            type: 'turn_completed',
            sessionId: sId,
            timestamp: new Date().toISOString(),
            data: {
              status: 'succeeded',
              response: `Successfully executed: ${prompt.slice(0, 40)}... Modified 2 files and passed all tests.`,
            },
          });
        }
      }),
    };

    orchestrator = new Orchestrator({
      dbService,
      bridgeService,
      antigravityManager: mockAgyManager as AntigravityManager,
    });

    orchestrator.start();
  });

  afterEach(async () => {
    orchestrator.close();
    await bridgeService.close();
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('orchestrates complete safe task handoff: inbox drop -> task queue -> auto-dispatch -> execution -> outbox result -> conversation update', async () => {
    const taskMessageId = randomUUID();
    const inboxDir = path.join(
      bridgeRoot,
      'projects',
      projectId,
      'sessions',
      sessionId,
      'inbox',
      'chatgpt'
    );
    const outboxDir = path.join(
      bridgeRoot,
      'projects',
      projectId,
      'sessions',
      sessionId,
      'outbox',
      'knot'
    );

    const taskAssignmentMarkdown = formatBridgeMessage(
      {
        id: taskMessageId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'antigravity',
        type: 'task_assignment',
        createdAt: new Date().toISOString(),
        metadata: {
          title: 'Implement feature flags',
          priority: 'high',
          executionMode: 'default',
          acceptanceCriteria: ['Pass unit tests', 'Document usage'],
        },
      },
      `## Objective\nImplement feature flags in config module.\n\n## Acceptance Criteria\n- [ ] Pass unit tests\n- [ ] Document usage`
    );

    // 1. Simulate ChatGPT writing task assignment into inbox
    const inboxFile = path.join(inboxDir, `${taskMessageId}.md`);
    fs.writeFileSync(inboxFile, taskAssignmentMarkdown, 'utf-8');

    // 2. Scan inbox directly to trigger processing
    await (bridgeService as any).watcher.scanInbox(inboxDir, { projectId, sessionId });

    // 3. Verify task was ingested into SQLite tasks table
    const task = dbService.tasks.getBySourceMessageId(taskMessageId);
    expect(task).not.toBeNull();
    expect(task?.title).toBe('Implement feature flags');
    expect(task?.priority).toBe('high');
    expect(task?.acceptanceCriteria).toEqual(['Pass unit tests', 'Document usage']);

    // 4. Verify auto-dispatch to Antigravity
    expect(mockAgyManager.sendMessage).toHaveBeenCalledWith(
      sessionId,
      expect.stringContaining('# Task: Implement feature flags')
    );

    // 5. Verify task reached succeeded state in database
    const updatedTask = dbService.tasks.get(task!.id);
    expect(updatedTask?.status).toBe('succeeded');
    expect(updatedTask?.startedAt).not.toBeNull();
    expect(updatedTask?.completedAt).not.toBeNull();
    expect(updatedTask?.resultMessageId).not.toBeNull();

    // 6. Verify task result was published into outbox/knot/
    const deterministicResultFile = path.join(outboxDir, `task-${task!.id}-result.md`);
    expect(fs.existsSync(deterministicResultFile)).toBe(true);

    const resultContent = fs.readFileSync(deterministicResultFile, 'utf-8');
    const parsedResult = parseBridgeMessage(resultContent, deterministicResultFile);
    expect(parsedResult.success).toBe(true);
    if (parsedResult.success) {
      expect(parsedResult.message.metadata.type).toBe('task_result');
      expect(parsedResult.message.metadata.sender).toBe('knot');
      expect(parsedResult.message.metadata.recipient).toBe('chatgpt');
      expect(parsedResult.message.bodyMarkdown).toContain('Task Result: Implement feature flags');
      expect(parsedResult.message.bodyMarkdown).toContain('SUCCEEDED');
      expect(parsedResult.message.bodyMarkdown).toContain('Modified 2 files and passed all tests');
    }

    // 7. Verify canonical conversation was updated
    const convPath = path.join(
      bridgeRoot,
      'projects',
      projectId,
      'sessions',
      sessionId,
      'conversation.md'
    );
    const convContent = fs.readFileSync(convPath, 'utf-8');
    expect(convContent).toContain('Task Result: Implement feature flags');

    // 8. Verify workspace-index.md was updated
    const indexPath = path.join(bridgeRoot, 'workspace-index.md');
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    expect(indexContent).toContain('Implement feature flags');
    expect(indexContent).toContain('succeeded');
  });

  it('enforces safety policy for sensitive tasks: requires user approval before dispatching', async () => {
    const taskMessageId = randomUUID();
    const inboxDir = path.join(
      bridgeRoot,
      'projects',
      projectId,
      'sessions',
      sessionId,
      'inbox',
      'chatgpt'
    );

    const sensitiveTaskMarkdown = formatBridgeMessage(
      {
        id: taskMessageId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'antigravity',
        type: 'task_assignment',
        createdAt: new Date().toISOString(),
        metadata: {
          title: 'Force push production release',
        },
      },
      `# Release\nRun git push --force origin main to release latest build.`
    );

    // 1. Write sensitive task to inbox
    const inboxFile = path.join(inboxDir, `${taskMessageId}.md`);
    fs.writeFileSync(inboxFile, sensitiveTaskMarkdown, 'utf-8');
    await (bridgeService as any).watcher.scanInbox(inboxDir, { projectId, sessionId });

    // 2. Verify task is awaiting approval
    const task = dbService.tasks.getBySourceMessageId(taskMessageId);
    expect(task).not.toBeNull();
    expect(task?.status).toBe('awaiting_approval');
    expect(task?.approvalStatus).toBe('awaiting_approval');

    // 3. Antigravity should NOT have been called yet
    expect(mockAgyManager.sendMessage).not.toHaveBeenCalled();

    // 4. User approves task through Orchestrator
    const approved = await orchestrator.approveTask(task!.id);
    expect(approved.approvalStatus).toBe('approved');

    // 5. Now it should have been dispatched and completed
    expect(mockAgyManager.sendMessage).toHaveBeenCalledWith(
      sessionId,
      expect.stringContaining('Force push production release')
    );

    const completed = dbService.tasks.get(task!.id);
    expect(completed?.status).toBe('succeeded');
  });

  it('processes ChatGPT activity reports into events without polluting conversation', async () => {
    const activityMessageId = randomUUID();
    const inboxDir = path.join(
      bridgeRoot,
      'projects',
      projectId,
      'sessions',
      sessionId,
      'inbox',
      'chatgpt'
    );

    const activityMarkdown = formatBridgeMessage(
      {
        id: activityMessageId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'activity',
        createdAt: new Date().toISOString(),
        metadata: {
          category: 'code_review',
          reference: 'PR #108',
        },
      },
      `Reviewed PR #108. All linters pass and test coverage is 95%. Ready to merge.`
    );

    const inboxFile = path.join(inboxDir, `${activityMessageId}.md`);
    fs.writeFileSync(inboxFile, activityMarkdown, 'utf-8');
    await (bridgeService as any).watcher.scanInbox(inboxDir, { projectId, sessionId });

    // Verify activity did NOT create a message in SQLite messages
    const messages = dbService.messages.listBySession(sessionId);
    const foundMsg = messages.find((m) => m.id === activityMessageId);
    expect(foundMsg).toBeUndefined();

    // Verify activity was recorded in SQLite events
    const events = dbService.events.listBySession(sessionId);
    const activityEvent = events.find((e) => e.eventType === 'chatgpt_activity');
    expect(activityEvent).toBeDefined();
    expect(activityEvent?.data).toMatchObject({
      category: 'code_review',
      reference: 'PR #108',
      summary: expect.stringContaining('Reviewed PR #108'),
    });

    // Verify conversation.md does NOT contain the background activity
    const convPath = path.join(
      bridgeRoot,
      'projects',
      projectId,
      'sessions',
      sessionId,
      'conversation.md'
    );
    const convContent = fs.readFileSync(convPath, 'utf-8');
    expect(convContent).not.toContain('Reviewed PR #108');
  });
});
