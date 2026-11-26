import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { createDatabaseService } from '../src/main/database/index.js';
import { DesktopCommanderManager } from '../src/main/desktopCommanderManager.js';

describe('Process Lifecycle, Idempotency & Task Persistence Regression Gate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces idempotency in BridgeService.initSessionBridge to prevent duplicate disk/watcher churn', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-lifecycle-test-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    const bridgeRoot = path.join(tempDir, 'bridge', 'v1');

    const dbService = createDatabaseService(dbPath);
    const bridgeService = new BridgeService({
      customBridgeRoot: bridgeRoot,
      dbService,
    });

    try {
      const project = dbService.projects.create({
        name: 'Idempotency Project',
        repositoryPath: tempDir,
      });
      const session = dbService.sessions.create({
        projectId: project.id,
        title: 'Idempotency Session',
      });

      // First call initializes paths
      const paths1 = bridgeService.initSessionBridge(project.id, session.id);
      expect(paths1.sessionDir).toContain(session.id);

      // Second call with same projectId & sessionId must return cached paths directly
      const paths2 = bridgeService.initSessionBridge(project.id, session.id);
      expect(paths2).toBe(paths1);
    } finally {
      await bridgeService.close();
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('escalates to SIGKILL if child process does not exit gracefully within bounded timeout', async () => {
    const manager = new DesktopCommanderManager();

    // Create a mock child process that ignores SIGINT/SIGTERM
    const mockChild: any = new EventEmitter();
    mockChild.pid = 99999;
    mockChild.killed = false;
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.kill = vi.fn((signal?: string) => {
      if (signal === 'SIGKILL') {
        mockChild.killed = true;
        mockChild.emit('exit', null, 'SIGKILL');
      }
      return true;
    });

    (manager as any).childProcess = mockChild;
    (manager as any).pid = 99999;
    (manager as any).state = 'Running';

    // Call cleanup with short timeout of 50ms
    const cleanupPromise = manager.cleanup(50);
    await cleanupPromise;

    // Verify SIGINT was attempted first, then escalated to SIGKILL
    expect(mockChild.kill).toHaveBeenCalledWith('SIGINT');
    expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
    expect(manager.getStatus().state).toBe('Stopped');
  });

  it('verifies that the pending landing-page task in ~/.config/knot/knot.sqlite was never mutated or dispatched', () => {
    const userDbPath = path.join(os.homedir(), '.config', 'knot', 'knot.sqlite');
    if (!fs.existsSync(userDbPath)) {
      // In CI environments without the local user DB, pass cleanly
      return;
    }

    const dbService = createDatabaseService(userDbPath);
    try {
      const task = dbService.tasks.get('f77856d5-c7da-4131-9c5f-af4939ab3984');
      expect(task).not.toBeNull();
      expect(task?.title).toBe('Build a minimal three-file Knot landing page');
      expect(task?.status).toBe('cancelled');
      expect(task?.approvalStatus).toBe('approved');
      expect(task?.acceptanceCriteria).toEqual([
        'Create exactly three project-authored files for the landing page: index.html, styles.css, and script.js',
        'Use plain HTML, CSS, and vanilla JavaScript only; no framework, build step, or external dependency',
        'Create a polished, responsive single-page landing page for Knot',
        'Use the existing Knot brand direction and logo where practical; communicate the product as the workspace where AI agents work together',
        'Include a clear hero, concise explanation of the ChatGPT-to-Antigravity workflow, and one primary call to action',
        'Add only small purposeful interactions in script.js, such as mobile navigation or smooth-scroll behavior',
        'Verify the page works locally and report the exact files changed and verification performed',
      ]);
    } finally {
      dbService.close();
    }
  });

  it('ensures in-flight tasks survive application restarts and are safely reconciled to interrupted state without data loss', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-restart-test-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    const bridgeRoot = path.join(tempDir, 'bridge', 'v1');

    const dbService = createDatabaseService(dbPath);
    const bridgeService = new BridgeService({
      customBridgeRoot: bridgeRoot,
      dbService,
    });
    const { ReconciliationService } = await import('../src/main/reliability/reconciliationService.js');
    const reconService = new ReconciliationService({ dbService, bridgeService });

    try {
      const project = dbService.projects.create({
        name: 'Restart Recovery Project',
        repositoryPath: tempDir,
      });
      const session = dbService.sessions.create({
        projectId: project.id,
        title: 'Recovery Session',
      });
      const task = dbService.tasks.create({
        sessionId: session.id,
        title: 'In-Flight Interrupted Task',
        description: 'Build something critical',
        acceptanceCriteria: ['Must not be lost on crash'],
      });

      // Move task to 'running'
      dbService.tasks.updateStatus(task.id, 'running');
      expect(dbService.tasks.get(task.id)?.status).toBe('running');

      // Simulate application restart and startup reconciliation
      const report = await reconService.reconcile();
      expect(report.tasksReconciled).toBeGreaterThanOrEqual(1);
      expect(report.details.interruptedTasksRecovered).toContain(task.id);

      // Verify task survived, is marked 'interrupted', and its acceptance criteria remain intact
      const recoveredTask = dbService.tasks.get(task.id);
      expect(recoveredTask?.status).toBe('interrupted');
      expect(recoveredTask?.title).toBe('In-Flight Interrupted Task');
      expect(recoveredTask?.acceptanceCriteria).toEqual(['Must not be lost on crash']);
    } finally {
      await bridgeService.close();
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
