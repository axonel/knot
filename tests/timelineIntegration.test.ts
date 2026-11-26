import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { TaskQueue } from '../src/main/orchestration/TaskQueue.js';
import { TaskResultPublisher } from '../src/main/orchestration/TaskResultPublisher.js';
import { GitService } from '../src/main/git/gitService.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import type { ParsedBridgeMessage } from '../src/main/bridge/types.js';

describe('Unified Execution Timeline Integration & End-to-End Audit Trail', () => {
  let tmpDir: string;
  let repoDir: string;
  let bridgeDir: string;
  let dbService: DatabaseService;
  let gitService: GitService;
  let bridgeService: BridgeService;
  let resultPublisher: TaskResultPublisher;
  let taskQueue: TaskQueue;
  let projectId: string;
  let sessionId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-timeline-e2e-'));
    repoDir = path.join(tmpDir, 'repo');
    bridgeDir = path.join(tmpDir, 'bridge');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(bridgeDir, { recursive: true });

    // Initialize clean git repository
    execSync('git init -b main', { cwd: repoDir, stdio: 'pipe' });
    execSync('git config user.name "Test Runner"', { cwd: repoDir, stdio: 'pipe' });
    execSync('git config user.email "test@knot.local"', { cwd: repoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Test Project\n');
    execSync('git add README.md && git commit -m "chore: initial commit"', { cwd: repoDir, stdio: 'pipe' });

    // Initialize database
    const dbPath = path.join(tmpDir, 'knot-test.sqlite');
    dbService = createDatabaseService(dbPath);

    const project = dbService.projects.create({
      name: 'Integration Test Project',
      repositoryPath: repoDir,
    });
    projectId = project.id;

    const session = dbService.sessions.create({
      projectId,
      title: 'Audit Trail Session',
    });
    sessionId = session.id;

    process.env.KNOT_BRIDGE_ROOT = bridgeDir;
    gitService = new GitService(dbService);
    bridgeService = new BridgeService({
      dbService,
      customBridgeRoot: bridgeDir,
    });
    bridgeService.initSessionBridge(projectId, sessionId);

    resultPublisher = new TaskResultPublisher(bridgeDir, dbService);
    taskQueue = new TaskQueue(dbService);
  });

  afterEach(async () => {
    try {
      delete process.env.KNOT_BRIDGE_ROOT;
      if (bridgeService) {
        await bridgeService.close();
      }
      dbService.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('captures full 7-stage lifecycle with accurate provenance and explicit distinctions', async () => {
    const task = dbService.tasks.create({
      sessionId,
      title: 'Implement Timeline Export',
      priority: 'high',
      executionMode: 'default',
      approvalStatus: 'awaiting_approval',
    });

    // 1. ChatGPT Formulation / Assignment Stage
    dbService.events.append({
      sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'task_assigned',
      actor: 'chatgpt',
      source: 'chatgpt_bridge',
      provenance: 'chatgpt_reported',
      title: 'ChatGPT Assigned: Implement Timeline Export',
      data: {
        taskId: task.id,
        taskTitle: 'Implement Timeline Export',
        instructions: 'Add markdown and JSON export options for task execution traces.',
        requiresApproval: true,
      },
    });

    // 2. Queue Ingestion Stage
    dbService.events.append({
      sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'task_queued',
      actor: 'knot',
      source: 'orchestration_runtime',
      provenance: 'knot_observed',
      title: `Task Queued: ${task.title}`,
      data: {
        taskId: task.id,
        priority: 'high',
      },
    });

    dbService.events.append({
      sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'approval_requested',
      actor: 'knot',
      source: 'orchestration_runtime',
      provenance: 'knot_observed',
      title: `Approval Required: ${task.title}`,
      data: {
        taskId: task.id,
        reason: 'Sensitive operation or policy requiring user confirmation',
      },
    });

    // 3. User Approval Stage
    dbService.events.append({
      sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'approval_granted',
      actor: 'user',
      source: 'orchestration_runtime',
      provenance: 'user_recorded',
      title: `Approval Granted: ${task.title}`,
      data: {
        taskId: task.id,
        approvedBy: 'Lead Developer Alice',
        note: 'Approved for execution in main branch workspace',
      },
    });

    // Transition task in queue
    taskQueue.approveTask(task.id);

    // 4. Git Baseline Capture
    const gitStart = await gitService.getRepoStatus(repoDir, repoDir);
    dbService.events.append({
      projectId,
      sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'git_boundary_captured',
      actor: 'git',
      source: 'local_git',
      provenance: 'git_verified',
      title: `Git Baseline Captured: ${task.title}`,
      data: {
        phase: 'start',
        branch: gitStart.branch,
        head: gitStart.head,
        isClean: gitStart.isClean,
        stagedCount: gitStart.stagedFiles.length,
        unstagedCount: gitStart.unstagedFiles.length,
        untrackedCount: gitStart.untrackedFiles.length,
      },
    });

    // 5. Antigravity Execution Stage (Worker performs operations)
    dbService.tasks.updateExecution(task.id, {
      status: 'running',
      dispatchedAt: new Date().toISOString(),
    });

    dbService.events.append({
      sessionId,
      taskId: task.id,
      eventType: 'antigravity_tool_started',
      actor: 'antigravity',
      source: 'antigravity_cli',
      provenance: 'antigravity_reported',
      title: 'Antigravity tool active: write_to_file',
      data: {
        tool: {
          name: 'write_to_file',
          parameters: { TargetFile: path.join(repoDir, 'src/timeline.ts') },
          status: 'active',
        },
      },
    });

    // Worker modifies file and creates commit
    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'src/timeline.ts'), 'export const timeline = true;\n');
    execSync('git add src/timeline.ts && git commit -m "feat: add timeline module"', {
      cwd: repoDir,
      stdio: 'pipe',
    });
    const latestCommitHash = execSync('git rev-parse HEAD', { cwd: repoDir, stdio: 'pipe' })
      .toString()
      .trim();

    dbService.events.append({
      sessionId,
      taskId: task.id,
      eventType: 'antigravity_tool_completed',
      actor: 'antigravity',
      source: 'antigravity_cli',
      provenance: 'antigravity_reported',
      title: 'Antigravity tool done: write_to_file',
      data: {
        tool: {
          name: 'write_to_file',
          output: 'File written successfully',
          status: 'done',
        },
      },
    });

    dbService.events.append({
      sessionId,
      taskId: task.id,
      eventType: 'antigravity_turn_completed',
      actor: 'antigravity',
      source: 'antigravity_cli',
      provenance: 'antigravity_reported',
      title: 'Antigravity completed task turn (SUCCESS)',
      data: {
        status: 'SUCCESS',
        durationSeconds: 3.5,
        commitHash: latestCommitHash,
      },
    });

    // 6. Git Completion Verification & Result Publication
    const gitEnd = await gitService.getRepoStatus(repoDir, repoDir);
    dbService.events.append({
      projectId,
      sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'git_boundary_captured',
      actor: 'git',
      source: 'local_git',
      provenance: 'git_verified',
      title: `Git Completion Verified: ${task.title}`,
      data: {
        phase: 'end',
        branch: gitEnd.branch,
        head: gitEnd.head,
        isClean: gitEnd.isClean,
        stagedCount: gitEnd.stagedFiles.length,
        unstagedCount: gitEnd.unstagedFiles.length,
        untrackedCount: gitEnd.untrackedFiles.length,
        verifiedCommitHash: latestCommitHash,
      },
    });

    // Publish Task Result to outbox
    const updatedTask = dbService.tasks.get(task.id)!;
    await resultPublisher.publish({
      task: updatedTask,
      executionDetails: {
        summary: 'Successfully implemented timeline export with zero linter errors.',
        changedFiles: ['src/timeline.ts'],
        commitHash: latestCommitHash,
        commandsExecuted: [],
        testsExecuted: [{ command: 'npm test', outcome: 'passed' }],
        errors: [],
        limitations: [],
      },
    });

    dbService.tasks.updateExecution(task.id, {
      status: 'succeeded',
      completedAt: new Date().toISOString(),
      gitBoundary: {
        taskId: task.id,
        start: gitStart,
        end: gitEnd,
        verifiedCommitHash: latestCommitHash,
        capturedAtStart: new Date().toISOString(),
        capturedAtEnd: new Date().toISOString(),
      },
    });

    // 7. Subsequent ChatGPT Verification
    // Simulate inbound activity message from ChatGPT verifying the result
    const inboundVerification: ParsedBridgeMessage = {
      filePath: path.join(bridgeDir, 'mock.md'),
      rawContent: '',
      bodyMarkdown: 'Verified commit matches git tree. Timeline export implementation meets all requirements.',
      metadata: {
        id: 'msg-verif-999',
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'activity',
        createdAt: new Date().toISOString(),
        metadata: {
          category: 'verification',
          taskId: task.id,
          verifiedCommit: latestCommitHash,
          outcome: 'verified',
        },
      },
    };

    await bridgeService.handleInboundAccepted(inboundVerification);

    // ==========================================
    // VERIFICATION: Unified Execution Timeline & Trace
    // ==========================================
    const trace = dbService.events.getTaskTrace(task.id);

    expect(trace).toBeDefined();
    expect(trace.task.id).toBe(task.id);
    expect(trace.task.status).toBe('succeeded');

    // Verify all 7 stages exist and are properly labeled
    expect(trace.stages.length).toBe(7);
    const stageNames = trace.stages.map((s) => s.name);
    expect(stageNames).toEqual([
      'assignment',
      'queue',
      'approval',
      'execution',
      'git',
      'completion',
      'verification',
    ]);

    // Stage 1: Assignment
    const stage1 = trace.stages.find((s) => s.name === 'assignment')!;
    expect(stage1.events.length).toBeGreaterThanOrEqual(1);
    expect(stage1.events[0].actor).toBe('chatgpt');
    expect(stage1.events[0].provenance).toBe('chatgpt_reported');

    // Stage 2: Queue
    const stage2 = trace.stages.find((s) => s.name === 'queue')!;
    expect(stage2.events.length).toBeGreaterThanOrEqual(1);
    expect(stage2.events[0].actor).toBe('knot');
    expect(stage2.events[0].provenance).toBe('knot_observed');

    // Stage 3: Approval
    const stage3 = trace.stages.find((s) => s.name === 'approval')!;
    expect(stage3.events.length).toBeGreaterThanOrEqual(2);
    expect(stage3.events.some((e) => e.actor === 'knot' && e.eventType === 'approval_requested')).toBe(true);
    expect(stage3.events.some((e) => e.actor === 'user' && e.eventType === 'approval_granted')).toBe(true);
    expect(trace.summary.isApproved).toBe(true);
    expect(trace.summary.approver).toBe('Lead Developer Alice');

    // Stage 4: Execution
    const stage4 = trace.stages.find((s) => s.name === 'execution')!;
    expect(stage4.events.length).toBeGreaterThanOrEqual(2);
    expect(stage4.events.every((e) => e.actor === 'antigravity')).toBe(true);
    expect(stage4.events.every((e) => e.provenance === 'antigravity_reported')).toBe(true);

    // Stage 5: Git
    const stage5 = trace.stages.find((s) => s.name === 'git')!;
    expect(stage5.events.length).toBeGreaterThanOrEqual(2);
    expect(stage5.events.every((e) => e.actor === 'git')).toBe(true);
    expect(stage5.events.every((e) => e.provenance === 'git_verified')).toBe(true);

    // Stage 6: Completion
    const stage6 = trace.stages.find((s) => s.name === 'completion')!;
    expect(stage6.events.length).toBeGreaterThanOrEqual(1);
    expect(stage6.status).toBe('completed');
    expect(trace.summary.verifiedCommit).toBe(latestCommitHash);

    // Stage 7: ChatGPT Verification
    const stage7 = trace.stages.find((s) => s.name === 'verification')!;
    expect(stage7.events.length).toBe(1);
    expect(stage7.events[0].eventType).toBe('chatgpt_verification');
    expect(stage7.events[0].actor).toBe('chatgpt');
    expect(stage7.events[0].provenance).toBe('chatgpt_reported');
    expect(trace.summary.hasChatGptVerification).toBe(true);
    expect(trace.summary.chatGptVerificationSummary).toContain('Verified commit matches git tree');

    // Test Markdown export of full trace
    const exportedMd = dbService.events.exportTaskTrace(task.id, 'markdown');
    expect(exportedMd).toContain('# Knot Task Execution Trace: Implement Timeline Export');
    expect(exportedMd).toContain('Lead Developer Alice');
    expect(exportedMd).toContain(latestCommitHash.slice(0, 8));
    expect(exportedMd).toContain('ChatGPT Verification');
    expect(exportedMd).toContain('1. Task Assignment');
    expect(exportedMd).toContain('7. ChatGPT Verification');

    // Test JSON export of full trace
    const exportedJson = dbService.events.exportTaskTrace(task.id, 'json');
    const parsed = JSON.parse(exportedJson);
    expect(parsed.task.id).toBe(task.id);
    expect(parsed.summary.verifiedCommit).toBe(latestCommitHash);
    expect(parsed.summary.hasChatGptVerification).toBe(true);
  });
});
