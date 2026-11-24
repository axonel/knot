import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { TaskQueue } from '../src/main/orchestration/TaskQueue.js';
import { TaskDispatcher } from '../src/main/orchestration/TaskDispatcher.js';
import { formatTaskContract } from '../src/main/orchestration/taskContract.js';
import type { AntigravityManager } from '../src/main/antigravity/antigravityManager.js';

describe('Task Lifecycle & TaskDispatcher', () => {
  let tempDir: string;
  let dbService: DatabaseService;
  let sessionId: string;
  let queue: TaskQueue;
  let mockAntigravityManager: Partial<AntigravityManager>;
  let dispatcher: TaskDispatcher;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-dispatcher-test-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    dbService = createDatabaseService(dbPath);

    const project = dbService.projects.create({
      name: 'Dispatcher Project',
      repositoryPath: tempDir,
    });

    const s = dbService.sessions.create({
      projectId: project.id,
      title: 'Dispatcher Session',
    });
    sessionId = s.id;

    queue = new TaskQueue(dbService);

    mockAntigravityManager = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };

    dispatcher = new TaskDispatcher({
      dbService,
      queue,
      antigravityManager: mockAntigravityManager as AntigravityManager,
    });
  });

  afterEach(() => {
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('formats task contract with objective, acceptance criteria and constraints', () => {
    const task = dbService.tasks.create({
      sessionId,
      title: 'Setup Database',
      description: 'Setup SQLite database tables and migrations',
      acceptanceCriteria: ['Pass all tests', 'Add indices'],
      executionMode: 'accept-edits',
    });

    const formatted = formatTaskContract(task, '/test/repo');
    expect(formatted).toContain('# Task: Setup Database');
    expect(formatted).toContain('## Objective\nSetup SQLite database tables and migrations');
    expect(formatted).toContain('- [ ] Pass all tests');
    expect(formatted).toContain('- [ ] Add indices');
    expect(formatted).toContain('Target Working Directory: `/test/repo`');
    expect(formatted).toContain('Execution Mode: `accept-edits`');
    expect(formatted).toContain('## Expected Report');
  });

  it('refuses to execute an unapproved task', async () => {
    const unapproved = dbService.tasks.create({
      sessionId,
      title: 'Sensitive Task',
      status: 'awaiting_approval',
      approvalStatus: 'awaiting_approval',
    });

    await expect(dispatcher.executeTask(unapproved)).rejects.toThrow('must be "approved"');
    expect(mockAntigravityManager.sendMessage).not.toHaveBeenCalled();
  });

  it('executes approved task, transitions status to running and then succeeded', async () => {
    const task = dbService.tasks.create({
      sessionId,
      title: 'Safe Task',
      status: 'queued',
      approvalStatus: 'approved',
    });

    const completed = await dispatcher.executeTask(task);
    expect(completed.status).toBe('succeeded');
    expect(completed.startedAt).not.toBeNull();
    expect(completed.completedAt).not.toBeNull();
    expect(mockAntigravityManager.sendMessage).toHaveBeenCalledWith(sessionId, expect.stringContaining('Safe Task'));

    // Check DB state
    const saved = dbService.tasks.get(task.id);
    expect(saved?.status).toBe('succeeded');
  });

  it('marks task as failed when Antigravity turn fails', async () => {
    const task = dbService.tasks.create({
      sessionId,
      title: 'Failing Task',
      status: 'queued',
      approvalStatus: 'approved',
    });

    (mockAntigravityManager.sendMessage as any).mockRejectedValueOnce(new Error('CLI process crashed'));

    await expect(dispatcher.executeTask(task)).rejects.toThrow('CLI process crashed');

    const saved = dbService.tasks.get(task.id);
    expect(saved?.status).toBe('failed');
    expect(saved?.failureReason).toBe('CLI process crashed');
  });

  it('dispatches next ready task in queue', async () => {
    const task1 = dbService.tasks.create({
      sessionId,
      title: 'First task',
      priority: 'high',
      status: 'queued',
      approvalStatus: 'approved',
    });

    const dispatched = await dispatcher.dispatchNext(sessionId);
    expect(dispatched).not.toBeNull();
    expect(dispatched?.id).toBe(task1.id);
    expect(dispatched?.status).toBe('succeeded');
  });

  it('fails gracefully when project repository directory is missing or inaccessible', async () => {
    const missingProj = dbService.projects.create({
      name: 'Missing Repo Project',
      repositoryPath: path.join(tempDir, 'does-not-exist-dir'),
    });
    const missingSess = dbService.sessions.create({
      projectId: missingProj.id,
      title: 'Missing Repo Session',
    });
    const task = dbService.tasks.create({
      sessionId: missingSess.id,
      title: 'Task on missing dir',
      status: 'queued',
      approvalStatus: 'approved',
    });

    await expect(dispatcher.executeTask(task)).rejects.toThrow('inaccessible or missing');
    const saved = dbService.tasks.get(task.id);
    expect(saved?.status).toBe('failed');
    expect(saved?.failureReason).toContain('inaccessible or missing');
  });

  it('cancels pending task when session is archived', async () => {
    const archivedSess = dbService.sessions.create({
      projectId: dbService.projects.list()[0].id,
      title: 'Archived Session',
    });
    dbService.sessions.updateStatus(archivedSess.id, 'archived');

    const task = dbService.tasks.create({
      sessionId: archivedSess.id,
      title: 'Task on archived session',
      status: 'queued',
      approvalStatus: 'approved',
    });

    const result = await dispatcher.executeTask(task);
    expect(result.status).toBe('cancelled');
    expect(result.failureReason).toContain('Session is archived');
  });

  it('calls executeTaskTurn when available and gathers structured result', async () => {
    const executeTaskTurn = vi.fn().mockResolvedValue({
      response: 'Turn finished',
      executionDetails: {
        summary: 'Modified 1 file',
        changedFiles: ['src/index.ts'],
        commandsExecuted: [{ command: 'npm test', exitCode: 0 }],
        testsExecuted: [{ command: 'npm test', outcome: 'passed' }],
      },
    });

    (mockAntigravityManager as any).executeTaskTurn = executeTaskTurn;

    const task = dbService.tasks.create({
      sessionId,
      title: 'Structured Task',
      status: 'queued',
      approvalStatus: 'approved',
    });

    const completed = await dispatcher.executeTask(task);
    expect(completed.status).toBe('succeeded');
    expect(executeTaskTurn).toHaveBeenCalledWith(sessionId, expect.stringContaining('Structured Task'), { taskId: task.id });
  });
});
