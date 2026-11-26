import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AntigravityProcess } from '../src/main/antigravity/antigravityProcess.js';
import { AntigravityManager } from '../src/main/antigravity/antigravityManager.js';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { TaskResultPublisher } from '../src/main/orchestration/TaskResultPublisher.js';
import type { Task } from '../src/shared/types.js';

const MOCK_AGY_PATH = path.resolve(__dirname, 'fixtures', 'mock-agy.sh');

describe('Hardened Antigravity Subprocess Lifecycle & Deterministic Execution Gate', () => {
  let tempDir: string;
  let dbService: DatabaseService;
  let bridgeService: BridgeService;
  let runningProcesses: AntigravityProcess[] = [];

  afterEach(async () => {
    for (const proc of runningProcesses) {
      try {
        await proc.stop();
      } catch {
        // ignore
      }
    }
    runningProcesses = [];

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

  function setupEnvironment() {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-subprocess-test-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    const bridgeRoot = path.join(tempDir, 'bridge', 'v1');
    const repoPath = path.join(tempDir, 'repo');
    fs.mkdirSync(repoPath, { recursive: true });

    dbService = createDatabaseService(dbPath);
    bridgeService = new BridgeService({ customBridgeRoot: bridgeRoot, dbService });

    const project = dbService.projects.create({
      name: 'Subprocess Test Project',
      repositoryPath: repoPath,
    });
    const session = dbService.sessions.create({
      projectId: project.id,
      title: 'Subprocess Session',
    });

    return { project, session, repoPath, bridgeRoot };
  }

  it('1. real subprocess executes successfully and emits structured result with tools and text', async () => {
    const { session, repoPath } = setupEnvironment();
    const proc = new AntigravityProcess({
      sessionId: session.id,
      workingDirectory: repoPath,
      executablePath: MOCK_AGY_PATH,
      env: { ...process.env, MOCK_AGY_MODE: 'success' },
    });
    runningProcesses.push(proc);

    const toolEvents: any[] = [];
    proc.on('tool_event', (e) => toolEvents.push(e));

    await proc.start();
    expect(proc.state).toBe('ready');

    const result = await proc.sendMessage('Build the feature');
    expect(result.status).toBe('SUCCESS');
    expect(result.response).toContain('Task implemented and verified');
    expect(toolEvents.length).toBeGreaterThanOrEqual(2);
    expect(toolEvents.some((t) => t.tool.name === 'write_to_file')).toBe(true);
    expect(toolEvents.some((t) => t.tool.name === 'run_command')).toBe(true);
  });

  it('2. real subprocess exiting non-zero fails gracefully with clear error without hanging', async () => {
    const { session, repoPath } = setupEnvironment();
    const proc = new AntigravityProcess({
      sessionId: session.id,
      workingDirectory: repoPath,
      executablePath: MOCK_AGY_PATH,
      env: { ...process.env, MOCK_AGY_MODE: 'non_zero_exit' },
    });
    runningProcesses.push(proc);

    await proc.start();
    await expect(proc.sendMessage('Trigger crash')).rejects.toThrow(
      /Process exited with code 1 without emitting a final result/
    );
    expect(proc.state).toBe('error');
    expect(proc.currentTurnPending).toBe(false);
  });

  it('3. real subprocess hung execution past bounded timeout is interrupted, escalated and rejected', async () => {
    const { session, repoPath } = setupEnvironment();
    const proc = new AntigravityProcess({
      sessionId: session.id,
      workingDirectory: repoPath,
      executablePath: MOCK_AGY_PATH,
      env: { ...process.env, MOCK_AGY_MODE: 'hang' },
    });
    runningProcesses.push(proc);

    await proc.start();
    // Use short 200ms timeout
    const startTime = Date.now();
    await expect(proc.sendMessage('Hang please', { timeoutMs: 200 })).rejects.toThrow(
      /Task execution timed out after 200ms/
    );
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(proc.currentTurnPending).toBe(false);
  });

  it('4. real subprocess cancellation stops process and rejects pending turn immediately', async () => {
    const { session, repoPath } = setupEnvironment();
    const proc = new AntigravityProcess({
      sessionId: session.id,
      workingDirectory: repoPath,
      executablePath: MOCK_AGY_PATH,
      env: { ...process.env, MOCK_AGY_MODE: 'hang' },
    });
    runningProcesses.push(proc);

    await proc.start();
    const turnPromise = proc.sendMessage('Hang please');

    // Cancel while in flight
    const stopPromise = proc.stop();

    await expect(turnPromise).rejects.toThrow(/Turn aborted: process stopping/);
    await stopPromise;
    expect(proc.state).toBe('stopped');
    expect(proc.currentTurnPending).toBe(false);
  });

  it('5. unexpected process disappearance (SIGKILL) rejects turn with descriptive signal error', async () => {
    const { session, repoPath } = setupEnvironment();
    const proc = new AntigravityProcess({
      sessionId: session.id,
      workingDirectory: repoPath,
      executablePath: MOCK_AGY_PATH,
      env: { ...process.env, MOCK_AGY_MODE: 'hang' },
    });
    runningProcesses.push(proc);

    await proc.start();
    const turnPromise = proc.sendMessage('Will be killed by SIGKILL');

    setTimeout(() => {
      if (proc.pid) {
        process.kill(proc.pid, 'SIGKILL');
      }
    }, 100);

    await expect(turnPromise).rejects.toThrow(/Process terminated by signal SIGKILL without emitting a final result/);
    expect(proc.currentTurnPending).toBe(false);
  });

  it('6. subprocess exiting with code 0 without result event is rejected as premature failure', async () => {
    const { session, repoPath } = setupEnvironment();
    const proc = new AntigravityProcess({
      sessionId: session.id,
      workingDirectory: repoPath,
      executablePath: MOCK_AGY_PATH,
      env: { ...process.env, MOCK_AGY_MODE: 'exit_no_result' },
    });
    runningProcesses.push(proc);

    await proc.start();
    await expect(proc.sendMessage('Exit 0 prematurely')).rejects.toThrow(
      /Process exited prematurely with code 0 without emitting a final result/
    );
    expect(proc.currentTurnPending).toBe(false);
  });

  it('7. malformed NDJSON stream lines are parsed cleanly without crashing the process', async () => {
    const { session, repoPath } = setupEnvironment();
    const proc = new AntigravityProcess({
      sessionId: session.id,
      workingDirectory: repoPath,
      executablePath: MOCK_AGY_PATH,
      env: { ...process.env, MOCK_AGY_MODE: 'malformed_ndjson' },
    });
    runningProcesses.push(proc);

    const malformedLines: any[] = [];
    proc.on('malformed_line', (info) => malformedLines.push(info));

    await proc.start();
    const result = await proc.sendMessage('Send corrupted lines');
    expect(result.status).toBe('SUCCESS');
    expect(result.response).toContain('Recovered cleanly');
    expect(malformedLines.length).toBeGreaterThanOrEqual(1);
  });

  it('8. result event with status ERROR throws in executeTaskTurn and marks state as error', async () => {
    const { session } = setupEnvironment();
    const originalEnv = process.env.MOCK_AGY_MODE;
    process.env.MOCK_AGY_MODE = 'error_result';
    const manager = new AntigravityManager({ dbService, bridgeService });

    const task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Error Result Test Task',
    });
    dbService.tasks.updateExecution(task.id, { status: 'running' });

    try {
      await manager.start(session.id, { executablePath: MOCK_AGY_PATH });
      await expect(
        manager.executeTaskTurn(session.id, 'Run test suite', {
          taskId: task.id,
        })
      ).rejects.toThrow(/Verification test suite failed with 2 errors/);
    } finally {
      process.env.MOCK_AGY_MODE = originalEnv;
      await manager.stop(session.id);
    }
  });

  it('9. TaskResultPublisher enforces atomic writes with retry on outbox directory creation race', async () => {
    const { session, bridgeRoot } = setupEnvironment();
    const publisher = new TaskResultPublisher(bridgeRoot, dbService);

    const task: Task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Atomic Publication Test',
      description: 'Ensure outbox write atomicity',
    });
    dbService.tasks.updateExecution(task.id, { status: 'running' });
    dbService.tasks.updateExecution(task.id, { status: 'succeeded', completedAt: new Date().toISOString() });
    const succeededTask = dbService.tasks.get(task.id)!;

    const res = await publisher.publish({
      task: succeededTask,
      agentResponse: 'Finished cleanly',
    });

    expect(fs.existsSync(res.filePath)).toBe(true);
    expect(fs.existsSync(res.deterministicFilePath)).toBe(true);
    const content = fs.readFileSync(res.deterministicFilePath, 'utf-8');
    expect(content).toContain(`Task Result: ${task.title}`);
    expect(content).toContain('- **Status**: `succeeded`');
  });

  it('10. TaskResultPublisher enforces exactly-once idempotency across repeated invocations', async () => {
    const { session, bridgeRoot } = setupEnvironment();
    const publisher = new TaskResultPublisher(bridgeRoot, dbService);

    const task: Task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Idempotency Publication Test',
      description: 'Must not write duplicate messages',
    });
    dbService.tasks.updateExecution(task.id, { status: 'running' });
    dbService.tasks.updateExecution(task.id, { status: 'succeeded', completedAt: new Date().toISOString() });
    const succeededTask = dbService.tasks.get(task.id)!;

    // First publication
    const res1 = await publisher.publish({ task: succeededTask });
    const messagesCount1 = dbService.messages.listBySession(session.id).length;

    // Second publication for same task
    const updatedTask = dbService.tasks.get(task.id)!;
    const res2 = await publisher.publish({ task: updatedTask });
    const messagesCount2 = dbService.messages.listBySession(session.id).length;

    expect(res2.messageId).toBe(res1.messageId);
    expect(res2.deterministicFilePath).toBe(res1.deterministicFilePath);
    expect(messagesCount2).toBe(messagesCount1); // Exactly-once: no duplicate messages inserted
  });
});
