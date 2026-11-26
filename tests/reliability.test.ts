import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { ReconciliationService } from '../src/main/reliability/reconciliationService.js';
import { TaskQueue } from '../src/main/orchestration/TaskQueue.js';
import { formatBridgeMessage } from '../src/main/bridge/protocol.js';
import { assertLegalTaskTransition } from '../src/shared/taskStateModel.js';

describe('Runtime Reliability, State Reconciliation & Recovery', () => {
  let tempDir: string;
  let bridgeRoot: string;
  let dbService: DatabaseService;
  let bridgeService: BridgeService;
  let reconciliationService: ReconciliationService;
  let taskQueue: TaskQueue;
  let projectId: string;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-reliability-test-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    bridgeRoot = path.join(tempDir, 'bridge');

    dbService = createDatabaseService(dbPath);
    bridgeService = new BridgeService({
      customBridgeRoot: bridgeRoot,
      dbService,
    });
    reconciliationService = new ReconciliationService({
      dbService,
      bridgeService,
    });
    taskQueue = new TaskQueue(dbService);

    const project = dbService.projects.create({
      name: 'Reliability Project',
      repositoryPath: tempDir,
    });
    projectId = project.id;

    const session = dbService.sessions.create({
      projectId: project.id,
      title: 'Reliability Session',
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

  describe('1. Atomic Queue Claims & State Transition Enforcement', () => {
    it('atomically claims next executable task and prevents duplicate worker claims', () => {
      const task = dbService.tasks.create({
        sessionId,
        title: 'Concurrent Task',
        priority: 'high',
        status: 'queued',
        approvalStatus: 'approved',
      });

      // First worker claim
      const claim1 = taskQueue.claimNextExecutable(sessionId);
      expect(claim1).not.toBeNull();
      expect(claim1?.id).toBe(task.id);
      expect(claim1?.status).toBe('running');

      // Second worker attempting to claim at the exact same time
      const claim2 = taskQueue.claimNextExecutable(sessionId);
      expect(claim2).toBeNull(); // Already running; cannot be claimed again
    });

    it('enforces legal task transitions and rejects invalid state mutations', () => {
      const task = dbService.tasks.create({
        sessionId,
        title: 'Transition Test',
        status: 'awaiting_approval',
        approvalStatus: 'awaiting_approval',
      });

      // Cannot jump directly from awaiting_approval to running
      expect(() => {
        dbService.tasks.updateExecution(task.id, { status: 'running' });
      }).toThrow(/Illegal task transition/);

      // Approve task
      dbService.tasks.updateExecution(task.id, {
        status: 'queued',
        approvalStatus: 'approved',
      });

      // Now it can legally transition to running
      const running = dbService.tasks.updateExecution(task.id, { status: 'running' });
      expect(running.status).toBe('running');

      // Now complete it
      const completed = dbService.tasks.updateExecution(task.id, {
        status: 'succeeded',
        completedAt: new Date().toISOString(),
      });
      expect(completed.status).toBe('succeeded');

      // Cannot transition from terminal succeeded back to running
      expect(() => {
        dbService.tasks.updateExecution(task.id, { status: 'running' });
      }).toThrow(/Illegal task transition/);
    });

    it('assertLegalTaskTransition catches illegal attempts directly', () => {
      expect(() => {
        assertLegalTaskTransition('task-123', 'succeeded', 'running');
      }).toThrow('Illegal task transition for "task-123": cannot transition from "succeeded" to "running".');

      expect(() => {
        assertLegalTaskTransition('task-123', 'running', 'interrupted');
      }).not.toThrow();
    });
  });

  describe('2. Race-Safe Event Persistence', () => {
    it('handles duplicate concurrent event insertion idempotently without throwing', () => {
      const eventId = 'test-event-race-safe-123';
      const eventData = {
        id: eventId,
        sessionId,
        eventType: 'test_event',
        actor: 'knot',
        title: 'Initial Event Write',
        data: { iteration: 1 },
      };

      const first = dbService.events.append(eventData as any);
      expect(first.id).toBe(eventId);
      expect(first.title).toBe('Initial Event Write');

      // Concurrent duplicate append with same ID
      const second = dbService.events.append({
        ...eventData,
        title: 'Duplicate Write Attempt',
      } as any);

      expect(second.id).toBe(eventId);
      expect(second.title).toBe('Initial Event Write'); // Retains original without crashing
    });
  });

  describe('3. In-Flight Task Recovery during State Reconciliation', () => {
    it('recovers running in-flight tasks to interrupted on startup while preserving approval status', async () => {
      // Simulate task that was running when process crashed
      const inFlightTask = dbService.tasks.create({
        sessionId,
        title: 'Crashed Mid-Flight Task',
        priority: 'urgent',
        status: 'queued',
        approvalStatus: 'approved',
      });

      dbService.tasks.updateExecution(inFlightTask.id, {
        status: 'running',
        dispatchedAt: new Date().toISOString(),
      });

      const beforeReconcile = dbService.tasks.get(inFlightTask.id);
      expect(beforeReconcile?.status).toBe('running');

      // Execute State Reconciliation
      const report = await reconciliationService.reconcile();

      expect(report.tasksReconciled).toBeGreaterThanOrEqual(1);
      expect(report.details.interruptedTasksRecovered).toContain(inFlightTask.id);

      const afterReconcile = dbService.tasks.get(inFlightTask.id);
      expect(afterReconcile?.status).toBe('interrupted');
      expect(afterReconcile?.approvalStatus).toBe('approved'); // Preserved!
      expect(afterReconcile?.failureReason).toContain('Execution interrupted: Knot was terminated or restarted');

      // Verify audit event was logged
      const events = dbService.events.listBySession(sessionId);
      const interruptEvent = events.find((e) => e.eventType === 'task_interrupted' && e.taskId === inFlightTask.id);
      expect(interruptEvent).toBeDefined();
      expect(interruptEvent?.title).toContain('Task Interrupted');

      // Verify task is NOT automatically re-dispatched
      const nextClaim = taskQueue.claimNextExecutable(sessionId);
      expect(nextClaim).toBeNull();

      // Explicit user retry returns task to queue
      const retried = taskQueue.retryTask(inFlightTask.id);
      expect(retried.status).toBe('queued');
      expect(retried.approvalStatus).toBe('approved');

      // Now it can be claimed again
      const claimedAfterRetry = taskQueue.claimNextExecutable(sessionId);
      expect(claimedAfterRetry?.id).toBe(inFlightTask.id);
    });

    it('cancels queued tasks belonging to archived sessions during reconciliation', async () => {
      const archivedSession = dbService.sessions.create({
        projectId,
        title: 'Archived Session',
      });
      dbService.sessions.updateStatus(archivedSession.id, 'archived');

      const orphanTask = dbService.tasks.create({
        sessionId: archivedSession.id,
        title: 'Task in Archived Session',
        status: 'queued',
        approvalStatus: 'approved',
      });

      const report = await reconciliationService.reconcile();
      expect(report.details.archivedTasksCancelled).toContain(orphanTask.id);

      const after = dbService.tasks.get(orphanTask.id);
      expect(after?.status).toBe('cancelled');
      expect(after?.failureReason).toBe('Session is archived.');
    });
  });

  describe('4. Context Vault Integrity & Drift Detection', () => {
    it('re-materializes missing on-disk context files from canonical SQLite records', async () => {
      const doc = dbService.context.create({
        projectId,
        scope: 'project',
        category: 'architecture_decision',
        title: 'Microservices Architecture',
        contentMarkdown: 'All components communicate via asynchronous mailbox contracts.',
        author: 'chatgpt',
      });

      // Synchronize initially
      bridgeService.syncContextWorkspace(projectId);

      const expectedPath = path.join(bridgeRoot, 'projects', projectId, 'context', `${doc.id}.md`);
      expect(fs.existsSync(expectedPath)).toBe(true);

      // Simulate accidental on-disk file loss
      fs.unlinkSync(expectedPath);
      expect(fs.existsSync(expectedPath)).toBe(false);

      // Reconcile
      const report = await reconciliationService.reconcile();
      expect(report.details.reMaterializedContextFiles).toContain(doc.id);
      expect(fs.existsSync(expectedPath)).toBe(true);

      // Verify content was restored accurately
      const restored = fs.readFileSync(expectedPath, 'utf-8');
      expect(restored).toContain('All components communicate via asynchronous mailbox contracts.');
    });

    it('detects on-disk context drift without silently overwriting canonical SQLite state', async () => {
      const doc = dbService.context.create({
        projectId,
        scope: 'project',
        category: 'technical_constraints',
        title: 'Node Engine Constraints',
        contentMarkdown: 'Target runtime must be Node 22 LTS or newer.',
        author: 'user',
      });

      bridgeService.syncContextWorkspace(projectId);

      const expectedPath = path.join(bridgeRoot, 'projects', projectId, 'context', `${doc.id}.md`);
      expect(fs.existsSync(expectedPath)).toBe(true);

      // Simulate external on-disk edit/drift
      fs.writeFileSync(expectedPath, '# Corrupted or Drifted Content Outside Knot\nUnsaved local edits', 'utf-8');

      // Reconcile
      const report = await reconciliationService.reconcile();
      expect(report.details.contextDriftConflictsDetected.length).toBeGreaterThan(0);
      expect(report.details.contextDriftConflictsDetected[0]).toContain(doc.id);

      // Verify SQLite canonical record was PRESERVED and not overwritten
      const canonicalInDb = dbService.context.get(doc.id);
      expect(canonicalInDb?.contentMarkdown).toBe('Target runtime must be Node 22 LTS or newer.');
    });
  });

  describe('5. Task Result Materialization', () => {
    it('re-materializes missing task result markdown file in outbox for completed tasks', async () => {
      const task = dbService.tasks.create({
        sessionId,
        title: 'Refactor Auth Pipeline',
        description: 'Hardened token handling in auth pipeline.',
        status: 'queued',
        approvalStatus: 'approved',
      });

      dbService.tasks.updateExecution(task.id, { status: 'running' });
      dbService.tasks.updateExecution(task.id, {
        status: 'succeeded',
        completedAt: new Date().toISOString(),
      });

      const outboxDir = path.join(bridgeRoot, 'projects', projectId, 'sessions', sessionId, 'outbox', 'knot');
      const expectedResultFile = path.join(outboxDir, `task-${task.id}-result.md`);

      // Ensure file does not exist initially
      expect(fs.existsSync(expectedResultFile)).toBe(false);

      // Run reconciliation
      const report = await reconciliationService.reconcile();
      expect(report.details.reMaterializedResultFiles).toContain(task.id);
      expect(fs.existsSync(expectedResultFile)).toBe(true);

      const resultMarkdown = fs.readFileSync(expectedResultFile, 'utf-8');
      expect(resultMarkdown).toContain(`Task Result: ${task.title}`);
      expect(resultMarkdown).toContain('- **Status**: `succeeded`');
    });
  });

  describe('6. Bridge Mailbox Recovery', () => {
    it('recovers stuck unprocessed inbox files during reconciliation', async () => {
      const inboxDir = path.join(bridgeRoot, 'projects', projectId, 'sessions', sessionId, 'inbox', 'chatgpt');
      const stuckFile = path.join(inboxDir, 'stuck-message.md');
      const stuckMsgId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

      const messageContent = formatBridgeMessage(
        {
          id: stuckMsgId,
          protocol: 'v1',
          projectId,
          sessionId,
          sender: 'chatgpt',
          recipient: 'knot',
          type: 'activity',
          createdAt: new Date().toISOString(),
        },
        'ChatGPT inspected repo during network outage.'
      );

      fs.writeFileSync(stuckFile, messageContent, 'utf-8');
      expect(fs.existsSync(stuckFile)).toBe(true);

      // Reconcile
      const report = await reconciliationService.reconcile();
      expect(report.details.missedBridgeMessagesProcessed).toContain(stuckFile);

      // File should have been ingested and moved to processed
      const processedDir = path.join(bridgeRoot, 'projects', projectId, 'sessions', sessionId, 'processed', 'chatgpt');
      const processedFile = path.join(processedDir, `${stuckMsgId}.md`);
      expect(fs.existsSync(processedFile)).toBe(true);
    });
  });

  describe('7. Diagnostics Reporting & Reconciliation History', () => {
    it('generates accurate diagnostics and persists report in reconciliation_history', async () => {
      const diagBefore = await reconciliationService.getDiagnostics();
      expect(diagBefore.database.available).toBe(true);
      expect(diagBefore.database.version).toBe(8);
      expect(diagBefore.bridge.status).toBe('watching');

      const report = await reconciliationService.reconcile();

      // Query latest report from DB
      const latestReportInDb = dbService.reconciliation.getLatest();
      expect(latestReportInDb).not.toBeNull();
      expect(latestReportInDb?.id).toBe(report.id);
      expect(latestReportInDb?.tasksReconciled).toBe(report.tasksReconciled);

      const diagAfter = await reconciliationService.getDiagnostics();
      expect(diagAfter.reconciliation.lastReport?.id).toBe(report.id);
      expect(diagAfter.reconciliation.lastDurationMs).toBe(report.durationMs);
    });
  });
});
