import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { AntigravityManager } from '../src/main/antigravity/antigravityManager.js';
import { Orchestrator } from '../src/main/orchestration/Orchestrator.js';
import { formatBridgeMessage, parseBridgeMessage } from '../src/main/bridge/protocol.js';
import { ReconciliationService } from '../src/main/reliability/reconciliationService.js';

const MOCK_AGY_PATH = path.resolve(__dirname, 'fixtures', 'mock-agy.sh');

describe('Task Lifecycle & Result Delivery Reliability - Isolated E2E Smoke Tests', () => {
  let tempDir: string;
  let dbService: DatabaseService;
  let bridgeService: BridgeService;
  let antigravityManager: AntigravityManager;
  let orchestrator: Orchestrator;

  afterEach(async () => {
    if (orchestrator) {
      orchestrator.close();
    }
    if (antigravityManager) {
      await antigravityManager.stopAll();
    }
    if (bridgeService) {
      await bridgeService.close();
    }
    if (dbService) {
      dbService.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupIsolatedSystem(options?: { trustPolicy?: 'approval_required' | 'trusted' }) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-e2e-smoke-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    const bridgeRoot = path.join(tempDir, 'bridge', 'v1');
    const repoPath = path.join(tempDir, 'repo');
    fs.mkdirSync(repoPath, { recursive: true });

    dbService = createDatabaseService(dbPath);
    bridgeService = new BridgeService({ customBridgeRoot: bridgeRoot, dbService });
    antigravityManager = new AntigravityManager({ dbService, bridgeService });

    const project = dbService.projects.create({
      name: 'E2E Smoke Project',
      repositoryPath: repoPath,
      trustPolicy: options?.trustPolicy || 'approval_required',
    });
    const session = dbService.sessions.create({
      projectId: project.id,
      title: 'E2E Smoke Session',
    });

    const paths = bridgeService.initSessionBridge(project.id, session.id);

    orchestrator = new Orchestrator({
      dbService,
      bridgeService,
      antigravityManager,
    });

    return { project, session, paths, repoPath, bridgeRoot };
  }

  it('Test A: Full Success Flow - inbox drop -> auto-dispatch -> execution -> outbox result -> conversation update', async () => {
    const { project, session, paths } = setupIsolatedSystem({ trustPolicy: 'trusted' });
    const originalEnv = process.env.MOCK_AGY_MODE;
    process.env.MOCK_AGY_MODE = 'success';

    // Start antigravity agent session with our mock CLI fixture
    await antigravityManager.start(session.id, { executablePath: MOCK_AGY_PATH });

    try {
      const assignmentMessageId = randomUUID();
      const assignmentContent = `# Task: Implement helper utility functions

## Objective
Implement helper calculation functions in src/utils/calc.ts.

## Acceptance Criteria
- Helper functions calculate sum and average
- Unit tests verify calculation results
`;

      const formattedAssignment = formatBridgeMessage(
        {
          id: assignmentMessageId,
          protocol: 'v1',
          projectId: project.id,
          sessionId: session.id,
          sender: 'chatgpt',
          recipient: 'knot',
          type: 'task_assignment',
          createdAt: new Date().toISOString(),
          metadata: {
            priority: 'high',
            requiresApproval: false,
          },
        },
        assignmentContent
      );

      // 1. ChatGPT drops assignment message into inbox
      const inboxFile = path.join(paths.inboxDir, `${assignmentMessageId}.md`);
      fs.writeFileSync(inboxFile, formattedAssignment, 'utf-8');

      // 2. Ingest through bridge (auto-dispatches since project is trusted)
      const parsed = parseBridgeMessage(formattedAssignment, inboxFile);
      expect(parsed.success).toBe(true);
      if (!parsed.success) throw new Error('Failed to parse bridge message');
      await orchestrator.handleInboundMessage(parsed.message);

      // 3. Verify task created in database and auto-dispatched to success
      const tasks = dbService.tasks.listBySession(session.id);
      expect(tasks.length).toBe(1);
      const task = tasks[0];
      expect(task.title).toContain('Implement helper utility functions');
      expect(task.sourceMessageId).toBe(assignmentMessageId);
      expect(task.status).toBe('succeeded');
      expect(task.completedAt).not.toBeNull();

      // 4. Verify result published to outbox
      const outboxFiles = fs.readdirSync(paths.outboxDir);
      expect(outboxFiles).toContain(`task-${task.id}-result.md`);

      const deterministicFile = path.join(paths.outboxDir, `task-${task.id}-result.md`);
      const resultContent = fs.readFileSync(deterministicFile, 'utf-8');
      expect(resultContent).toContain(`Task Result: ${task.title}`);
      expect(resultContent).toContain('- **Status**: `succeeded`');
      expect(resultContent).toContain('src/mockResult.ts');
      expect(resultContent).toContain('npm test');

      // 5. Verify resultMessageId stored on task
      const latestTask = dbService.tasks.get(task.id)!;
      expect(latestTask.resultMessageId).not.toBeNull();
      const messageFile = path.join(paths.outboxDir, `${latestTask.resultMessageId}.md`);
      expect(fs.existsSync(messageFile)).toBe(true);

      // 6. Terminal state guard: cannot transition succeeded task back to running
      expect(() => {
        dbService.tasks.updateStatus(task.id, 'running');
      }).toThrow(/Illegal task transition/);
    } finally {
      process.env.MOCK_AGY_MODE = originalEnv;
    }
  });

  it('Test B: Full Failure Flow - non-zero exit marks task failed with reason and publishes failure report', async () => {
    const { project, session, paths } = setupIsolatedSystem({ trustPolicy: 'trusted' });
    const originalEnv = process.env.MOCK_AGY_MODE;
    process.env.MOCK_AGY_MODE = 'non_zero_exit';

    await antigravityManager.start(session.id, { executablePath: MOCK_AGY_PATH });

    try {
      const assignmentMessageId = randomUUID();
      const assignmentContent = `# Task: Trigger deliberate failure

## Objective
Simulate broken build.
`;

      const formattedAssignment = formatBridgeMessage(
        {
          id: assignmentMessageId,
          protocol: 'v1',
          projectId: project.id,
          sessionId: session.id,
          sender: 'chatgpt',
          recipient: 'knot',
          type: 'task_assignment',
          createdAt: new Date().toISOString(),
          metadata: { requiresApproval: false },
        },
        assignmentContent
      );

      const inboxFile = path.join(paths.inboxDir, `${assignmentMessageId}.md`);
      fs.writeFileSync(inboxFile, formattedAssignment, 'utf-8');

      const parsed = parseBridgeMessage(formattedAssignment, inboxFile);
      expect(parsed.success).toBe(true);
      if (!parsed.success) throw new Error('Failed to parse bridge message');
      await orchestrator.handleInboundMessage(parsed.message);

      // Verify task created and auto-dispatched to failure due to exit code 1
      const task = dbService.tasks.listBySession(session.id)[0];
      expect(task).toBeDefined();
      expect(task.status).toBe('failed');
      expect(task.failureReason).toContain('Process exited with code 1 without emitting a final result');

      // Verify failure result published to outbox
      const deterministicFile = path.join(paths.outboxDir, `task-${task.id}-result.md`);
      expect(fs.existsSync(deterministicFile)).toBe(true);
      const resultContent = fs.readFileSync(deterministicFile, 'utf-8');
      expect(resultContent).toContain('- **Status**: `failed`');
      expect(resultContent).toContain('Process exited with code 1');

      // Terminal state guard: cannot transition failed task back to running
      expect(() => {
        dbService.tasks.updateStatus(task.id, 'running');
      }).toThrow(/Illegal task transition/);
    } finally {
      process.env.MOCK_AGY_MODE = originalEnv;
    }
  });

  it('Test C: Full Cancellation Flow - active task cancelled by user stops process and publishes cancellation report', async () => {
    const { session, paths } = setupIsolatedSystem();
    const originalEnv = process.env.MOCK_AGY_MODE;
    process.env.MOCK_AGY_MODE = 'hang';

    await antigravityManager.start(session.id, { executablePath: MOCK_AGY_PATH });

    try {
      const task = dbService.tasks.create({
        sessionId: session.id,
        title: 'Long Running Task to Cancel',
        description: 'Should be safely cancellable',
        approvalStatus: 'approved',
      });

      // Start executing in background
      const executePromise = orchestrator.getDispatcher().executeTask(task);

      // Wait a moment for process to enter thinking/running state
      await new Promise((r) => setTimeout(r, 150));

      // User initiates cancellation
      const cancelled = await orchestrator.cancelTask(task.id, 'User cancelled task from UI');
      expect(cancelled.status).toBe('cancelled');

      // The execution promise completes cleanly with cancelled task
      const finished = await executePromise;
      expect(finished.status).toBe('cancelled');

      // Verify cancellation report published to outbox
      const deterministicFile = path.join(paths.outboxDir, `task-${task.id}-result.md`);
      expect(fs.existsSync(deterministicFile)).toBe(true);
      const resultContent = fs.readFileSync(deterministicFile, 'utf-8');
      expect(resultContent).toContain('- **Status**: `cancelled`');
      expect(resultContent).toContain('User cancelled task from UI');

      // Verify process was killed
      expect(antigravityManager.isProcessRunning(session.id)).toBe(false);
    } finally {
      process.env.MOCK_AGY_MODE = originalEnv;
    }
  });

  it('Test D: Crash Interruption & Recovery Flow - in-flight task reconciled to interrupted with outbox publication', async () => {
    const { session, paths } = setupIsolatedSystem();
    const originalEnv = process.env.MOCK_AGY_MODE;
    process.env.MOCK_AGY_MODE = 'success';
    await antigravityManager.start(session.id, { executablePath: MOCK_AGY_PATH });

    try {
      const reconService = new ReconciliationService({ dbService, bridgeService, antigravityManager });

      // Simulate in-flight task left in 'running' when process crashed
      const task = dbService.tasks.create({
        sessionId: session.id,
        title: 'In-Flight Task When Knot Crashed',
        description: 'Must not be silently lost or re-dispatched',
        approvalStatus: 'approved',
      });
      dbService.tasks.updateStatus(task.id, 'running');

      // Startup reconciliation runs
      const report = await reconService.reconcile();
      expect(report.tasksReconciled).toBeGreaterThanOrEqual(1);
      expect(report.details.interruptedTasksRecovered).toContain(task.id);

      // Verify task status is 'interrupted' with explanatory message
      const recovered = dbService.tasks.get(task.id)!;
      expect(recovered.status).toBe('interrupted');
      expect(recovered.failureReason).toContain('Execution interrupted: Knot was terminated or restarted while task was in-flight.');

      // Verify outbox report was published for the interrupted task
      const deterministicFile = path.join(paths.outboxDir, `task-${task.id}-result.md`);
      expect(fs.existsSync(deterministicFile)).toBe(true);
      const resultContent = fs.readFileSync(deterministicFile, 'utf-8');
      expect(resultContent).toContain('- **Status**: `interrupted`');
      expect(resultContent).toContain('Execution interrupted');

      // Verify it is NOT automatically re-claimed by queue dispatcher
      const nextClaim = orchestrator.getDispatcher().dispatchNext(session.id);
      const claimResult = await nextClaim;
      expect(claimResult).toBeNull(); // Never automatically redispatch interrupted task

      // Verify explicit retry allows user to re-queue it
      const retried = await orchestrator.retryTask(task.id);
      expect(retried.status).toBe('queued');
      expect(retried.retryCount).toBe(1);
    } finally {
      process.env.MOCK_AGY_MODE = originalEnv;
    }
  });
});
