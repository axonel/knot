import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { TaskQueue } from '../src/main/orchestration/TaskQueue.js';

describe('Persistent Antigravity Task Queue', () => {
  let tempDir: string;
  let dbService: DatabaseService;
  let sessionId1: string;
  let sessionId2: string;
  let queue: TaskQueue;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-task-queue-test-'));
    const dbPath = path.join(tempDir, 'test.sqlite');
    dbService = createDatabaseService(dbPath);

    const project = dbService.projects.create({
      name: 'Queue Project',
      repositoryPath: tempDir,
    });

    const s1 = dbService.sessions.create({
      projectId: project.id,
      title: 'Session 1',
    });
    sessionId1 = s1.id;

    const s2 = dbService.sessions.create({
      projectId: project.id,
      title: 'Session 2',
    });
    sessionId2 = s2.id;

    queue = new TaskQueue(dbService);
  });

  afterEach(() => {
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('retrieves next executable task in priority order while filtering unapproved tasks', () => {
    // Session 1 tasks
    const unapproved = dbService.tasks.create({
      sessionId: sessionId1,
      title: 'Unapproved task',
      priority: 'urgent',
      status: 'awaiting_approval',
      approvalStatus: 'awaiting_approval',
    });

    const approvedNormal = dbService.tasks.create({
      sessionId: sessionId1,
      title: 'Normal approved task',
      priority: 'normal',
      status: 'queued',
      approvalStatus: 'approved',
    });

    const approvedHigh = dbService.tasks.create({
      sessionId: sessionId1,
      title: 'High approved task',
      priority: 'high',
      status: 'queued',
      approvalStatus: 'approved',
    });

    // The next executable task should be the highest priority approved task (approvedHigh)
    const nextTask = queue.getNextExecutableTask(sessionId1);
    expect(nextTask).not.toBeNull();
    expect(nextTask?.id).toBe(approvedHigh.id);
    expect(nextTask?.title).toBe('High approved task');
  });

  it('maintains strict per-session isolation', () => {
    dbService.tasks.create({
      sessionId: sessionId1,
      title: 'Session 1 Task',
      status: 'queued',
      approvalStatus: 'approved',
    });

    dbService.tasks.create({
      sessionId: sessionId2,
      title: 'Session 2 Task',
      status: 'queued',
      approvalStatus: 'approved',
    });

    const next1 = queue.getNextExecutableTask(sessionId1);
    expect(next1?.sessionId).toBe(sessionId1);
    expect(next1?.title).toBe('Session 1 Task');

    const next2 = queue.getNextExecutableTask(sessionId2);
    expect(next2?.sessionId).toBe(sessionId2);
    expect(next2?.title).toBe('Session 2 Task');
  });

  it('handles approve and reject workflows', () => {
    const task = dbService.tasks.create({
      sessionId: sessionId1,
      title: 'Push release',
      status: 'awaiting_approval',
      approvalStatus: 'awaiting_approval',
    });

    expect(queue.getNextExecutableTask(sessionId1)).toBeNull();

    // Approve
    const approved = queue.approveTask(task.id);
    expect(approved.status).toBe('queued');
    expect(approved.approvalStatus).toBe('approved');
    expect(queue.getNextExecutableTask(sessionId1)?.id).toBe(task.id);

    // Create another task and reject it
    const task2 = dbService.tasks.create({
      sessionId: sessionId1,
      title: 'Delete everything',
      status: 'awaiting_approval',
      approvalStatus: 'awaiting_approval',
    });

    const rejected = queue.rejectTask(task2.id, 'Too dangerous');
    expect(rejected.status).toBe('cancelled');
    expect(rejected.approvalStatus).toBe('rejected');
    expect(rejected.failureReason).toBe('Too dangerous');
  });

  it('handles cancellation and retries', () => {
    const task = dbService.tasks.create({
      sessionId: sessionId1,
      title: 'Run build',
      status: 'running',
      approvalStatus: 'approved',
    });

    const cancelled = queue.cancelTask(task.id, 'User stopped build');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.failureReason).toBe('User stopped build');

    const retried = queue.retryTask(task.id);
    expect(retried.status).toBe('queued');
    expect(retried.retryCount).toBe(1);
    expect(retried.failureReason).toBeNull();
  });

  it('recovers running tasks on restart', () => {
    dbService.tasks.create({
      sessionId: sessionId1,
      title: 'Interrupted task',
      status: 'running',
      approvalStatus: 'approved',
    });

    const { recoveredCount } = queue.recover(sessionId1);
    expect(recoveredCount).toBe(1);

    const task = queue.listTasks(sessionId1)[0];
    expect(task.status).toBe('failed');
    expect(task.failureReason).toContain('Interrupted by application restart');
  });
});
