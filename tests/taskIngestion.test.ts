import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { ingestTaskAssignment, extractTaskTitle, extractAcceptanceCriteria } from '../src/main/orchestration/taskIngestion.js';
import { TaskPolicy } from '../src/main/orchestration/TaskPolicy.js';
import type { ParsedBridgeMessage } from '../src/main/bridge/types.js';

describe('Task Assignment Ingestion & Task Repository Enhancements', () => {
  let tempDir: string;
  let dbService: DatabaseService;
  let projectId: string;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-ingest-test-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    dbService = createDatabaseService(dbPath);

    const project = dbService.projects.create({
      name: 'Test Project',
      repositoryPath: tempDir,
    });
    projectId = project.id;

    const session = dbService.sessions.create({
      projectId,
      title: 'Test Session',
    });
    sessionId = session.id;
  });

  afterEach(() => {
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('extracts task title from metadata, markdown heading or first line', () => {
    expect(extractTaskTitle('# Heading Title\nSome content', 'Meta Title')).toBe('Meta Title');
    expect(extractTaskTitle('# Heading Title\nSome content')).toBe('Heading Title');
    expect(extractTaskTitle('## Subheading Title\nSome content')).toBe('Subheading Title');
    expect(extractTaskTitle('Plain first line text\nSecond line')).toBe('Plain first line text');
  });

  it('extracts acceptance criteria from markdown list or metadata', () => {
    const md = `
# Refactor Auth

## Objective
Update authentication flow.

## Acceptance Criteria
- [ ] Implement JWT token validation
- [x] Add unit tests for expired tokens
- Verify user logout clears cookies
`;
    const criteria = extractAcceptanceCriteria(md);
    expect(criteria).toEqual([
      'Implement JWT token validation',
      'Add unit tests for expired tokens',
      'Verify user logout clears cookies',
    ]);

    const metaCriteria = ['Criterion 1', 'Criterion 2'];
    expect(extractAcceptanceCriteria(md, metaCriteria)).toEqual(metaCriteria);
  });

  it('evaluates safe tasks as auto-approved and sensitive tasks as awaiting approval', () => {
    const safeEval = TaskPolicy.evaluate('Write unit tests', 'Run tests and fix linter errors');
    expect(safeEval.requiresApproval).toBe(false);
    expect(safeEval.category).toBe('safe');

    const sensitiveEval = TaskPolicy.evaluate('Deploy to production', 'Run git push origin main and publish package');
    expect(sensitiveEval.requiresApproval).toBe(true);
    expect(sensitiveEval.category).toBe('sensitive');
    expect(sensitiveEval.reason).toContain('push');
  });

  it('ingests task assignment and creates task in SQLite with proper fields', () => {
    dbService.projects.updateTrustPolicy(projectId, 'trusted');
    const messageId = randomUUID();
    const parsedMessage: ParsedBridgeMessage = {
      metadata: {
        id: messageId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'antigravity',
        type: 'task_assignment',
        createdAt: new Date().toISOString(),
        metadata: {
          title: 'Implement unit tests for auth module',
          priority: 'high',
          executionMode: 'default',
        },
      },
      bodyMarkdown: `## Objective\nWrite tests for auth.\n\n## Acceptance Criteria\n- [ ] 100% branch coverage\n- [ ] Clean lint`,
      rawContent: '',
      filePath: '/dummy/path.md',
    };

    const result = ingestTaskAssignment(parsedMessage, dbService);
    expect(result.isDuplicate).toBe(false);
    expect(result.task).toBeDefined();
    expect(result.task.sourceMessageId).toBe(messageId);
    expect(result.task.title).toBe('Implement unit tests for auth module');
    expect(result.task.priority).toBe('high');
    expect(result.task.executionMode).toBe('default');
    expect(result.task.status).toBe('queued');
    expect(result.task.approvalStatus).toBe('approved');
    expect(result.task.acceptanceCriteria).toEqual(['100% branch coverage', 'Clean lint']);

    // Check persistent database lookup by sourceMessageId
    const found = dbService.tasks.getBySourceMessageId(messageId);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(result.task.id);

    // Verify event in SQLite
    const events = dbService.events.listBySession(sessionId);
    const assignedEvent = events.find((e) => e.eventType === 'task_assigned');
    expect(assignedEvent).toBeDefined();
    expect(assignedEvent?.taskId).toBe(result.task.id);
  });

  it('is strictly idempotent when same inbound task assignment is processed twice', () => {
    const messageId = randomUUID();
    const parsedMessage: ParsedBridgeMessage = {
      metadata: {
        id: messageId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'antigravity',
        type: 'task_assignment',
        createdAt: new Date().toISOString(),
      },
      bodyMarkdown: '# Fix broken test\nPlease fix the auth test.',
      rawContent: '',
      filePath: '/dummy/path.md',
    };

    const first = ingestTaskAssignment(parsedMessage, dbService);
    expect(first.isDuplicate).toBe(false);

    const second = ingestTaskAssignment(parsedMessage, dbService);
    expect(second.isDuplicate).toBe(true);
    expect(second.task.id).toBe(first.task.id);

    // Verify only one task was inserted into DB
    const allTasks = dbService.tasks.listBySession(sessionId);
    expect(allTasks.length).toBe(1);
  });

  it('marks sensitive tasks as awaiting_approval', () => {
    const messageId = randomUUID();
    const parsedMessage: ParsedBridgeMessage = {
      metadata: {
        id: messageId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'antigravity',
        type: 'task_assignment',
        createdAt: new Date().toISOString(),
      },
      bodyMarkdown: '## Push release\nRun git push --force origin main and delete old branches',
      rawContent: '',
      filePath: '/dummy/path.md',
    };

    const result = ingestTaskAssignment(parsedMessage, dbService);
    expect(result.task.status).toBe('awaiting_approval');
    expect(result.task.approvalStatus).toBe('awaiting_approval');
  });

  it('lists queued tasks ordered by priority and createdAt', () => {
    dbService.tasks.create({
      sessionId,
      title: 'Low task',
      priority: 'low',
      status: 'queued',
    });
    dbService.tasks.create({
      sessionId,
      title: 'Urgent task',
      priority: 'urgent',
      status: 'queued',
    });
    dbService.tasks.create({
      sessionId,
      title: 'High task',
      priority: 'high',
      status: 'queued',
    });
    dbService.tasks.create({
      sessionId,
      title: 'Normal task',
      priority: 'normal',
      status: 'queued',
    });

    const queued = dbService.tasks.listQueued(sessionId);
    expect(queued.length).toBe(4);
    expect(queued[0].title).toBe('Urgent task');
    expect(queued[1].title).toBe('High task');
    expect(queued[2].title).toBe('Normal task');
    expect(queued[3].title).toBe('Low task');
  });

  it('updates task execution details via updateExecution', () => {
    const task = dbService.tasks.create({
      sessionId,
      title: 'Execution Test',
      status: 'queued',
    });

    const dispatchedAt = new Date().toISOString();
    const updated = dbService.tasks.updateExecution(task.id, {
      status: 'running',
      dispatchedAt,
      retryCount: 1,
    });

    expect(updated.status).toBe('running');
    expect(updated.dispatchedAt).toBe(dispatchedAt);
    expect(updated.retryCount).toBe(1);

    const completedAt = new Date().toISOString();
    const completed = dbService.tasks.updateExecution(task.id, {
      status: 'succeeded',
      completedAt,
      resultMessageId: 'msg-res-123',
    });

    expect(completed.status).toBe('succeeded');
    expect(completed.completedAt).toBe(completedAt);
    expect(completed.resultMessageId).toBe('msg-res-123');
  });
});
