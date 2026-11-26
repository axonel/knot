import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import type { AppendEventInput } from '../src/shared/types.js';

describe('EventRepository — Unified Execution Timeline & Audit Trail', () => {
  let tmpDir: string;
  let dbService: DatabaseService;
  let projectId: string;
  let sessionId: string;
  let taskId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-event-repo-test-'));
    const dbPath = path.join(tmpDir, 'test.sqlite');
    dbService = createDatabaseService(dbPath);

    const project = dbService.projects.create({
      name: 'Test Timeline Project',
      repositoryPath: tmpDir,
    });
    projectId = project.id;

    const session = dbService.sessions.create({
      projectId,
      title: 'Timeline Session 1',
    });
    sessionId = session.id;

    const task = dbService.tasks.create({
      sessionId,
      title: 'Sample Implementation Task',
      priority: 'high',
      executionMode: 'default',
    });
    taskId = task.id;
  });

  afterEach(() => {
    try {
      dbService.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  });

  it('appends and reads an event with canonical fields and defaults', () => {
    const event = dbService.events.append({
      sessionId,
      eventType: 'task_created',
      actor: 'chatgpt',
      source: 'bridge',
      provenance: 'chatgpt_reported',
      title: 'Task Created by ChatGPT',
      severity: 'info',
      data: { taskId, details: 'Initial plan' },
    });

    expect(event.id).toBeDefined();
    expect(event.projectId).toBe(projectId); // Auto-resolved from session
    expect(event.sessionId).toBe(sessionId);
    expect(event.actor).toBe('chatgpt');
    expect(event.source).toBe('bridge');
    expect(event.provenance).toBe('chatgpt_reported');
    expect(event.title).toBe('Task Created by ChatGPT');
    expect(event.severity).toBe('info');
    expect(event.timestamp).toBeDefined();
    expect(event.createdAt).toBeDefined();

    const fetched = dbService.events.get(event.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(event.id);
    expect(fetched?.data).toEqual({ taskId, details: 'Initial plan' });
  });

  it('guarantees idempotency on duplicate event insert with same ID', () => {
    const customId = 'evt-idempotent-123';
    const input: AppendEventInput = {
      id: customId,
      sessionId,
      eventType: 'agent_started',
      actor: 'antigravity',
      title: 'Antigravity Process Started',
      data: { pid: 4321 },
    };

    const first = dbService.events.append(input);
    expect(first.id).toBe(customId);

    // Re-inserting with same id should not crash or duplicate (idempotent write)
    const second = dbService.events.append({
      ...input,
      title: 'Antigravity Process Started (Duplicate ignored)',
    });
    expect(second.id).toBe(customId);

    const all = dbService.events.listBySession(sessionId);
    const matches = all.filter((e) => e.id === customId);
    expect(matches.length).toBe(1);
    expect(matches[0].title).toBe('Antigravity Process Started');
  });

  it('sorts events deterministically by event_timestamp ASC, created_at ASC, id ASC', () => {
    const baseTime = 1700000000000;

    dbService.events.append({
      id: 'evt-3',
      sessionId,
      eventType: 'third',
      actor: 'knot',
      timestamp: new Date(baseTime + 3000).toISOString(),
    });

    dbService.events.append({
      id: 'evt-1',
      sessionId,
      eventType: 'first',
      actor: 'knot',
      timestamp: new Date(baseTime + 1000).toISOString(),
    });

    dbService.events.append({
      id: 'evt-2',
      sessionId,
      eventType: 'second',
      actor: 'knot',
      timestamp: new Date(baseTime + 2000).toISOString(),
    });

    const list = dbService.events.listBySession(sessionId, { order: 'ASC' });
    expect(list.length).toBe(3);
    expect(list[0].id).toBe('evt-1');
    expect(list[1].id).toBe('evt-2');
    expect(list[2].id).toBe('evt-3');

    const descList = dbService.events.listBySession(sessionId, { order: 'DESC' });
    expect(descList[0].id).toBe('evt-3');
    expect(descList[1].id).toBe('evt-2');
    expect(descList[2].id).toBe('evt-1');
  });

  it('filters events by project, session, actor, and severity', () => {
    dbService.events.append({
      sessionId,
      eventType: 'ev_chatgpt',
      actor: 'chatgpt',
      severity: 'info',
    });
    dbService.events.append({
      sessionId,
      eventType: 'ev_antigravity',
      actor: 'antigravity',
      severity: 'warning',
    });
    dbService.events.append({
      sessionId,
      eventType: 'ev_knot_err',
      actor: 'knot',
      severity: 'error',
    });

    const chatgptEvents = dbService.events.list({
      sessionId,
      actor: 'chatgpt',
    });
    expect(chatgptEvents.length).toBe(1);
    expect(chatgptEvents[0].actor).toBe('chatgpt');

    const errorEvents = dbService.events.list({
      sessionId,
      severity: 'error',
    });
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].actor).toBe('knot');

    const projectEvents = dbService.events.listByProject(projectId);
    expect(projectEvents.length).toBe(3);
  });

  it('builds a complete 7-stage TaskExecutionTrace', () => {
    const t0 = new Date('2026-11-26T12:00:00.000Z');
    const t1 = new Date('2026-11-26T12:00:02.000Z');
    const t2 = new Date('2026-11-26T12:00:05.000Z');
    const t3 = new Date('2026-11-26T12:00:06.000Z');
    const t4 = new Date('2026-11-26T12:00:10.000Z');
    const t5 = new Date('2026-11-26T12:00:15.000Z');
    const t6 = new Date('2026-11-26T12:00:16.000Z');

    // 1. Assignment
    dbService.events.append({
      sessionId,
      taskId,
      eventType: 'task_assigned',
      actor: 'chatgpt',
      provenance: 'chatgpt_reported',
      title: 'Task Assigned by ChatGPT',
      timestamp: t0.toISOString(),
    });

    // 2. Queue
    dbService.events.append({
      sessionId,
      taskId,
      eventType: 'task_queued',
      actor: 'knot',
      provenance: 'knot_observed',
      title: 'Task Ingested & Queued',
      timestamp: t1.toISOString(),
    });

    // 3. Approval
    dbService.events.append({
      sessionId,
      taskId,
      eventType: 'approval_granted',
      actor: 'user',
      provenance: 'user_recorded',
      title: 'User Approved Execution',
      data: { approvedBy: 'Developer Bob' },
      timestamp: t2.toISOString(),
    });

    // 4. Git Baseline
    dbService.events.append({
      sessionId,
      taskId,
      eventType: 'git_boundary_captured',
      actor: 'git',
      provenance: 'git_verified',
      title: 'Git Baseline Captured',
      data: { phase: 'start', isClean: true },
      timestamp: t3.toISOString(),
    });

    // 5. Execution
    dbService.events.append({
      sessionId,
      taskId,
      eventType: 'antigravity_tool_started',
      actor: 'antigravity',
      provenance: 'antigravity_reported',
      title: 'Tool Started: write_file',
      timestamp: t4.toISOString(),
    });

    // 6. Completion
    dbService.events.append({
      sessionId,
      taskId,
      eventType: 'task_succeeded',
      actor: 'knot',
      provenance: 'knot_observed',
      title: 'Task Execution Succeeded',
      data: { verifiedCommitHash: 'abc1234def5678' },
      timestamp: t5.toISOString(),
    });

    // Also update task in DB to succeeded
    dbService.tasks.updateExecution(taskId, {
      status: 'succeeded',
      dispatchedAt: t3.toISOString(),
      completedAt: t5.toISOString(),
    });

    // 7. Verification
    dbService.events.append({
      sessionId,
      taskId,
      eventType: 'chatgpt_verification',
      actor: 'chatgpt',
      provenance: 'chatgpt_reported',
      title: 'ChatGPT Verified Changes',
      data: { outcome: 'verified', summary: 'All tests pass cleanly.' },
      timestamp: t6.toISOString(),
    });

    const trace = dbService.events.getTaskTrace(taskId);
    expect(trace).toBeDefined();
    expect(trace.stages.length).toBe(7);

    // Verify 7 stages names
    expect(trace.stages[0].name).toBe('assignment');
    expect(trace.stages[0].events.length).toBe(1);
    expect(trace.stages[0].status).toBe('completed');

    expect(trace.stages[1].name).toBe('queue');
    expect(trace.stages[1].events.length).toBe(1);

    expect(trace.stages[2].name).toBe('approval');
    expect(trace.stages[2].events.length).toBe(1);

    expect(trace.stages[3].name).toBe('execution');
    expect(trace.stages[3].events.length).toBe(1);

    expect(trace.stages[4].name).toBe('git');
    expect(trace.stages[4].events.length).toBe(1);

    expect(trace.stages[5].name).toBe('completion');
    expect(trace.stages[5].status).toBe('completed');

    expect(trace.stages[6].name).toBe('verification');
    expect(trace.stages[6].events.length).toBe(1);
    expect(trace.stages[6].status).toBe('completed');

    // Verify summary metrics
    expect(trace.summary.isApproved).toBe(true);
    expect(trace.summary.approver).toBe('Developer Bob');
    expect(trace.summary.verifiedCommit).toBe('abc1234def5678');
    expect(trace.summary.hasChatGptVerification).toBe(true);
    expect(trace.summary.chatGptVerificationSummary).toBe('All tests pass cleanly.');
  });

  it('exports task execution trace to Markdown and JSON with secret sanitization', () => {
    // Append event with sensitive auth token
    dbService.events.append({
      sessionId,
      taskId,
      eventType: 'antigravity_tool_completed',
      actor: 'antigravity',
      provenance: 'antigravity_reported',
      title: 'API Call with Secret',
      data: {
        authorization: 'Bearer secret_token_xyz987654321',
        apiKey: 'sk-ant-live-abc123456789',
      },
    });

    // Markdown export
    const md = dbService.events.exportTaskTrace(taskId, 'markdown');
    expect(md).toContain('# Knot Task Execution Trace: Sample Implementation Task');
    expect(md).toContain('## Lifecycle Stages Summary');
    expect(md).toContain('## Complete Chronological Audit Trail');
    // Verify secret was redacted
    expect(md).not.toContain('secret_token_xyz987654321');
    expect(md).toContain('[REDACTED');

    // JSON export
    const jsonStr = dbService.events.exportTaskTrace(taskId, 'json');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.task.id).toBe(taskId);
    expect(parsed.stages.length).toBe(7);
    expect(jsonStr).not.toContain('secret_token_xyz987654321');
  });
});
