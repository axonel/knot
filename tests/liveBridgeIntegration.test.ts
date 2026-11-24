import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { AntigravityManager } from '../src/main/antigravity/antigravityManager.js';
import { Orchestrator } from '../src/main/orchestration/Orchestrator.js';
import { TaskQueue } from '../src/main/orchestration/TaskQueue.js';
import { TaskDispatcher } from '../src/main/orchestration/TaskDispatcher.js';
import { cliDetector } from '../src/main/antigravity/cliDetector.js';
import { formatBridgeMessage, parseBridgeMessage } from '../src/main/bridge/protocol.js';

describe('Live Bridge Integration & End-to-End Runtime Verification', () => {
  let tempDir: string;
  let bridgeRoot: string;
  let repoDir: string;
  let dbService: DatabaseService;
  let bridgeService: BridgeService;
  let orchestrator: Orchestrator;
  let projectId: string;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-live-integration-'));
    bridgeRoot = path.join(tempDir, 'bridge', 'v1');
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    // Initialize temporary git repo
    try {
      execSync('git init -b main', { cwd: repoDir, stdio: 'pipe' });
      execSync('git config user.name "Knot Test"', { cwd: repoDir, stdio: 'pipe' });
      execSync('git config user.email "test@knot.local"', { cwd: repoDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test Project\n', 'utf-8');
      execSync('git add README.md && git commit -m "initial commit"', { cwd: repoDir, stdio: 'pipe' });
    } catch {
      // Git initialization fallback if git CLI has different flags
    }

    const dbPath = path.join(tempDir, 'integration.sqlite');
    dbService = createDatabaseService(dbPath);

    bridgeService = new BridgeService({
      customBridgeRoot: bridgeRoot,
      dbService,
    });

    const project = dbService.projects.create({
      name: 'Integration Project',
      repositoryPath: repoDir,
    });
    projectId = project.id;

    const session = dbService.sessions.create({
      projectId,
      title: 'Integration Session',
    });
    sessionId = session.id;

    bridgeService.initSessionBridge(projectId, sessionId);
  });

  afterEach(async () => {
    if (orchestrator) {
      orchestrator.close();
    }
    await bridgeService.close();
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('1. Multi-Session Watching & Offline Message Ingestion', () => {
    it('scans and ingests messages deposited into registered session inboxes while Knot was offline', async () => {
      // Create a second project and session
      const proj2 = dbService.projects.create({
        name: 'Second Project',
        repositoryPath: repoDir,
      });
      const sess2 = dbService.sessions.create({
        projectId: proj2.id,
        title: 'Second Session',
      });

      // Prepare second session inbox directly on disk without selecting it in UI
      const sess2Inbox = path.join(bridgeRoot, 'projects', proj2.id, 'sessions', sess2.id, 'inbox', 'chatgpt');
      fs.mkdirSync(sess2Inbox, { recursive: true });

      const offlineMsgId = randomUUID();
      const offlineMsg = formatBridgeMessage(
        {
          id: offlineMsgId,
          protocol: 'v1',
          projectId: proj2.id,
          sessionId: sess2.id,
          sender: 'chatgpt',
          recipient: 'knot',
          type: 'activity',
          createdAt: new Date().toISOString(),
          metadata: { category: 'planning', summary: 'Offline drop' },
        },
        '# Planning while Knot was closed\nDeposited directly into inbox.'
      );

      fs.writeFileSync(path.join(sess2Inbox, `${offlineMsgId}.md`), offlineMsg, 'utf-8');

      // Now run watchAllSessions (as done on startup)
      await bridgeService.watchAllSessions();

      // Verify the offline message was processed
      const events = dbService.events.listBySession(sess2.id);
      const activityEvent = events.find((e) => e.eventType === 'chatgpt_activity');
      expect(activityEvent).toBeDefined();
      expect(activityEvent?.data?.summary).toContain('Planning while Knot was closed');

      // Verify file was moved from inbox to processed
      expect(fs.existsSync(path.join(sess2Inbox, `${offlineMsgId}.md`))).toBe(false);
      const processedPath = path.join(bridgeRoot, 'projects', proj2.id, 'sessions', sess2.id, 'processed', 'chatgpt', `${offlineMsgId}.md`);
      expect(fs.existsSync(processedPath)).toBe(true);
    });
  });

  describe('2. Idempotency & Duplicate Delivery Rejection', () => {
    it('idempotently processes duplicate message deliveries without creating duplicate tasks', async () => {
      const mockAgy = {
        on: vi.fn(),
        executeTaskTurn: vi.fn().mockResolvedValue({
          response: 'Task done',
          executionDetails: { summary: 'File created' },
        }),
        sendMessage: vi.fn(),
      };

      orchestrator = new Orchestrator({
        dbService,
        bridgeService,
        antigravityManager: mockAgy as any,
      });
      orchestrator.start();

      const taskMessageId = randomUUID();
      const inboxDir = path.join(bridgeRoot, 'projects', projectId, 'sessions', sessionId, 'inbox', 'chatgpt');

      const taskMsg = formatBridgeMessage(
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
            title: 'Idempotency Check Task',
            priority: 'normal',
            executionMode: 'default',
          },
        },
        '# Objective\nEnsure duplicate deliveries are rejected.'
      );

      // Deliver first time
      fs.writeFileSync(path.join(inboxDir, `${taskMessageId}.md`), taskMsg, 'utf-8');

      // Wait for processing
      for (let i = 0; i < 20; i++) {
        const tasks = dbService.tasks.listBySession(sessionId);
        if (tasks.length > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      const tasksAfterFirst = dbService.tasks.listBySession(sessionId);
      expect(tasksAfterFirst.length).toBe(1);
      expect(tasksAfterFirst[0].sourceMessageId).toBe(taskMessageId);

      // Deliver exact same message a second time
      fs.writeFileSync(path.join(inboxDir, `${taskMessageId}.md`), taskMsg, 'utf-8');

      await new Promise((r) => setTimeout(r, 200));

      const tasksAfterSecond = dbService.tasks.listBySession(sessionId);
      // Still exactly 1 task
      expect(tasksAfterSecond.length).toBe(1);
    });
  });

  describe('3. Failure Recovery Scenarios', () => {
    it('recovers in-flight tasks on application restart into failed state with diagnostics and allows retry', () => {
      const queue = new TaskQueue(dbService);

      const inFlightTask = dbService.tasks.create({
        sessionId,
        title: 'Interrupted in-flight job',
        status: 'running',
        approvalStatus: 'approved',
      });

      // Simulate Knot restart recovery
      const { recoveredCount, recoveredTasks } = queue.recover(sessionId);
      expect(recoveredCount).toBe(1);
      expect(recoveredTasks[0].id).toBe(inFlightTask.id);
      expect(recoveredTasks[0].status).toBe('failed');
      expect(recoveredTasks[0].failureReason).toContain('Interrupted by application restart');

      // Verify task_interrupted event was recorded
      const events = dbService.events.listBySession(sessionId, { eventType: 'task_interrupted' });
      expect(events.length).toBe(1);
      expect(events[0].data?.reason).toContain('Application restarted');

      // Verify explicit user retry works
      const retried = queue.retryTask(inFlightTask.id);
      expect(retried.status).toBe('queued');
      expect(retried.retryCount).toBe(1);
      expect(retried.failureReason).toBeNull();
    });

    it('gracefully fails execution when project repository directory becomes inaccessible', async () => {
      const queue = new TaskQueue(dbService);
      const mockAgy = { sendMessage: vi.fn() };
      const dispatcher = new TaskDispatcher({
        dbService,
        queue,
        antigravityManager: mockAgy as any,
      });

      const badProj = dbService.projects.create({
        name: 'Inaccessible Repo Proj',
        repositoryPath: path.join(tempDir, 'deleted-repo-folder'),
      });
      const badSess = dbService.sessions.create({
        projectId: badProj.id,
        title: 'Bad Session',
      });

      const task = dbService.tasks.create({
        sessionId: badSess.id,
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
      const queue = new TaskQueue(dbService);
      const mockAgy = { sendMessage: vi.fn() };
      const dispatcher = new TaskDispatcher({
        dbService,
        queue,
        antigravityManager: mockAgy as any,
      });

      dbService.sessions.updateStatus(sessionId, 'archived');

      const task = dbService.tasks.create({
        sessionId,
        title: 'Task on archived session',
        status: 'queued',
        approvalStatus: 'approved',
      });

      const result = await dispatcher.executeTask(task);
      expect(result.status).toBe('cancelled');
      expect(result.failureReason).toContain('Session is archived');
    });
  });

  describe('4. Structured Task Result Publishing & Outbox Contract', () => {
    it('publishes task_result to outbox with complete execution metadata', async () => {
      const mockAgy = {
        on: vi.fn(),
        sendMessage: vi.fn(),
        executeTaskTurn: vi.fn().mockResolvedValue({
          response: 'Implemented user authentication with argon2 hashing',
          executionDetails: {
            summary: 'Added argon2 password hashing and updated login route',
            changedFiles: ['src/auth/hash.ts', 'src/auth/login.ts'],
            commandsExecuted: [
              { command: 'npm run test:auth', exitCode: 0, output: '12 passed' },
              { command: 'git commit -m "feat: auth hashing"', output: '[main 9abc123] feat: auth hashing' },
            ],
            testsExecuted: [
              { command: 'npm run test:auth', outcome: 'passed' },
            ],
            commitHash: '9abc123',
            errors: [],
            limitations: ['Rate limiting not yet implemented'],
          },
        }),
      };

      orchestrator = new Orchestrator({
        dbService,
        bridgeService,
        antigravityManager: mockAgy as any,
      });
      orchestrator.start();

      const task = dbService.tasks.create({
        sessionId,
        title: 'Implement Auth Hashing',
        status: 'queued',
        approvalStatus: 'approved',
      });

      await orchestrator.getDispatcher().executeTask(task);

      // Verify outbox file
      const outboxDir = path.join(bridgeRoot, 'projects', projectId, 'sessions', sessionId, 'outbox', 'knot');
      const deterministicResultFile = path.join(outboxDir, `task-${task.id}-result.md`);
      expect(fs.existsSync(deterministicResultFile)).toBe(true);

      const resultContent = fs.readFileSync(deterministicResultFile, 'utf-8');
      const parsed = parseBridgeMessage(resultContent, deterministicResultFile);

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.message.metadata.type).toBe('task_result');
        expect(parsed.message.metadata.sender).toBe('knot');
        expect(parsed.message.metadata.recipient).toBe('chatgpt');

        // Check frontmatter metadata
        const meta = parsed.message.metadata.metadata as Record<string, unknown>;
        expect(meta.taskId).toBe(task.id);
        expect(meta.status).toBe('succeeded');
        expect(meta.changedFiles).toEqual(['src/auth/hash.ts', 'src/auth/login.ts']);
        expect(meta.commitHash).toBe('9abc123');

        // Check markdown body content
        expect(parsed.message.bodyMarkdown).toContain('# Task Result: Implement Auth Hashing');
        expect(parsed.message.bodyMarkdown).toContain('## Summary of Changes');
        expect(parsed.message.bodyMarkdown).toContain('Added argon2 password hashing');
        expect(parsed.message.bodyMarkdown).toContain('`src/auth/hash.ts`');
        expect(parsed.message.bodyMarkdown).toContain('`npm run test:auth`');
        expect(parsed.message.bodyMarkdown).toContain('Commit Hash**: `9abc123`');
        expect(parsed.message.bodyMarkdown).toContain('Rate limiting not yet implemented');
      }

      // Check bridge status diagnostics
      const status = bridgeService.getStatus(sessionId);
      expect(status.latestPublishedResult).toBeDefined();
      expect(status.latestPublishedResult?.taskId).toBe(task.id);
      expect(status.unreadResultsCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. Real Local Antigravity CLI Integration Test', () => {
    it(
      'executes a real task turn via host agy CLI when available',
      async () => {
        if (!process.env.RUN_REAL_AGY_TEST) {
          console.log(
            'Skipping real CLI turn in automated test suite (takes ~40s). To run with real host agy CLI, set RUN_REAL_AGY_TEST=1 or run: npx vitest run tests/antigravity.smoke.test.ts'
          );
          return;
        }

        const caps = cliDetector.detect();
        if (!caps.installed || caps.readiness !== 'ready') {
          console.log('Skipping real CLI test: agy CLI is not installed or not ready on this machine.');
          return;
        }

      const agyManager = new AntigravityManager({
        dbService,
        bridgeService,
      });
      bridgeService.setAntigravityManager(agyManager);

      try {
        const turnResult = await agyManager.executeTaskTurn(
          sessionId,
          'Reply exactly: KNOT_INTEGRATION_VERIFIED_SUCCESS'
        );

        expect(turnResult.response).toContain('KNOT_INTEGRATION_VERIFIED_SUCCESS');
        expect(turnResult.executionDetails).toBeDefined();
        expect(turnResult.executionDetails.summary).toContain('KNOT_INTEGRATION_VERIFIED_SUCCESS');

        // Verify status reflects Antigravity active
        const status = bridgeService.getStatus(sessionId);
        expect(status.exists).toBe(true);
        expect(status.readable).toBe(true);
        expect(status.writable).toBe(true);
      } finally {
        await agyManager.cleanup();
      }
    },
    60000
  );
});
});
