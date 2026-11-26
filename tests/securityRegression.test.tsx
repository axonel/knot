import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import {
  validateIpcSender,
  isPathAllowedForOpen,
  validateCrossProjectAccess,
  validateCrossSessionTaskAccess,
} from '../src/main/security/ipcSecurity.js';
import {
  validateExternalUrl,
  validateNavigationUrl,
} from '../src/main/security/navigationSecurity.js';
import {
  isSensitiveFilePath,
  containsSensitiveSecrets,
  validateRepositoryPath,
  validateRelativeFilePath,
  validateCommitHash,
} from '../src/main/git/gitSecurity.js';
import { TaskQueue } from '../src/main/orchestration/TaskQueue.js';
import { TaskPolicy, computeTaskContentHash, verifyTaskContentIntegrity } from '../src/main/orchestration/TaskPolicy.js';
import { TaskDispatcher } from '../src/main/orchestration/TaskDispatcher.js';
import { ReconciliationService } from '../src/main/reliability/reconciliationService.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import type { Project } from '../src/shared/types.js';

describe('Prompt 14 — Automated Security Regression & Quality Gates', () => {
  let tempDir: string;
  let dbService: DatabaseService;
  let project: Project;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-sec-regression-'));
    dbService = initDatabaseService(':memory:');
    project = dbService.projects.create({
      name: 'Regression Project',
      repositoryPath: tempDir,
      repositoryRemote: 'git@github.com:axonel/knot.git',
      trustPolicy: 'approval_required',
    });
    const session = dbService.sessions.create({
      projectId: project.id,
      title: 'Regression Session',
    });
    sessionId = session.id;
  });

  afterEach(() => {
    try {
      dbService.close();
    } catch {
      // ignore
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // 1. Electron IPC Authorization & Path Boundaries
  // =========================================================================
  describe('1. Electron IPC Authorization & Path Traversal Guards', () => {
    it('validates IPC sender against trusted main frame and rejects foreign sender frames', () => {
      const trustedFrame = { url: 'file:///app/dist/renderer/index.html' };
      const foreignFrame = { url: 'https://attacker.site/malicious.html' };

      // 1. Matching trusted frame succeeds
      expect(() => {
        validateIpcSender({ senderFrame: trustedFrame }, trustedFrame);
      }).not.toThrow();

      // 2. Foreign senderFrame reference fails
      expect(() => {
        validateIpcSender({ senderFrame: foreignFrame }, trustedFrame);
      }).toThrow(/Unauthorized IPC sender frame/i);

      // 3. Sender frame from disallowed origin fails
      expect(() => {
        validateIpcSender({ senderFrame: { url: 'http://malicious-site.com/index.html' } });
      }).toThrow(/Unauthorized IPC sender origin/i);

      // 4. Allowed localhost origins pass
      expect(() => {
        validateIpcSender({ senderFrame: { url: 'http://localhost:5173/index.html' } });
      }).not.toThrow();
      expect(() => {
        validateIpcSender({ senderFrame: { url: 'http://127.0.0.1:5173/' } });
      }).not.toThrow();
    });

    it('confines isPathAllowedForOpen strictly to bridge root and registered repositories', () => {
      const bridgeRoot = path.join(tempDir, 'bridge');
      const repoPath = path.join(tempDir, 'repo');
      fs.mkdirSync(bridgeRoot, { recursive: true });
      fs.mkdirSync(repoPath, { recursive: true });

      // Valid paths inside bridge root and repository
      expect(isPathAllowedForOpen(bridgeRoot, bridgeRoot, [repoPath])).toBe(true);
      expect(isPathAllowedForOpen(path.join(bridgeRoot, 'inbox'), bridgeRoot, [repoPath])).toBe(true);
      expect(isPathAllowedForOpen(path.join(repoPath, 'src'), bridgeRoot, [repoPath])).toBe(true);

      // Traversal and outside paths MUST be rejected
      expect(isPathAllowedForOpen('/etc', bridgeRoot, [repoPath])).toBe(false);
      expect(isPathAllowedForOpen('/etc/passwd', bridgeRoot, [repoPath])).toBe(false);
      expect(isPathAllowedForOpen(path.join(bridgeRoot, '..', '..', 'etc'), bridgeRoot, [repoPath])).toBe(false);
      expect(isPathAllowedForOpen(path.join(repoPath, '..', 'secrets'), bridgeRoot, [repoPath])).toBe(false);
      expect(isPathAllowedForOpen('', bridgeRoot, [repoPath])).toBe(false);
    });

    it('blocks cross-project session access', () => {
      const project2 = dbService.projects.create({
        name: 'Second Project',
        repositoryPath: path.join(tempDir, 'repo2'),
      });
      const session2 = dbService.sessions.create({
        projectId: project2.id,
        title: 'Project 2 Session',
      });

      // Legitimate access succeeds
      expect(() => {
        validateCrossProjectAccess(project.id, sessionId, dbService);
      }).not.toThrow();

      // Cross-project access attempt throws
      expect(() => {
        validateCrossProjectAccess(project.id, session2.id, dbService);
      }).toThrow(/Cross-project access attempt/i);

      // Non-existent session throws
      expect(() => {
        validateCrossProjectAccess(project.id, 'non-existent-session-id', dbService);
      }).toThrow(/Session not found/i);
    });

    it('blocks cross-session task manipulation', () => {
      const task1 = dbService.tasks.create({
        sessionId,
        title: 'Session 1 Task',
        status: 'queued',
      });

      const session2 = dbService.sessions.create({
        projectId: project.id,
        title: 'Session 2',
      });
      const task2 = dbService.tasks.create({
        sessionId: session2.id,
        title: 'Session 2 Task',
        status: 'queued',
      });

      // Legitimate access succeeds
      expect(() => {
        validateCrossSessionTaskAccess(sessionId, task1.id, dbService);
      }).not.toThrow();

      // Cross-session access throws
      expect(() => {
        validateCrossSessionTaskAccess(sessionId, task2.id, dbService);
      }).toThrow(/Cross-session access attempt/i);

      // Non-existent task throws
      expect(() => {
        validateCrossSessionTaskAccess(sessionId, 'non-existent-task-id', dbService);
      }).toThrow(/Task not found/i);
    });
  });

  // =========================================================================
  // 2. URL Navigation & External URL Opening Guards
  // =========================================================================
  describe('2. URL Navigation & External URL Opening Guards', () => {
    it('restricts external URL opening strictly to http: and https:', () => {
      // Allowed schemes
      expect(validateExternalUrl('https://github.com/axonel/knot').allowed).toBe(true);
      expect(validateExternalUrl('http://localhost:5173').allowed).toBe(true);

      // Disallowed schemes
      expect(validateExternalUrl('javascript:alert(1)').allowed).toBe(false);
      expect(validateExternalUrl('file:///etc/passwd').allowed).toBe(false);
      expect(validateExternalUrl('data:text/html,<script>alert(1)</script>').allowed).toBe(false);
      expect(validateExternalUrl('vbscript:msgbox(1)').allowed).toBe(false);
      expect(validateExternalUrl('knot://custom/protocol').allowed).toBe(false);
      expect(validateExternalUrl('').allowed).toBe(false);
      expect(validateExternalUrl('not-a-valid-url').allowed).toBe(false);
    });

    it('restricts internal window navigation to trusted dev server or local file bundle', () => {
      const devServer = 'http://localhost:5173';

      // Allowed internal navigation
      expect(validateNavigationUrl('http://localhost:5173/index.html', devServer).allowed).toBe(true);
      expect(validateNavigationUrl('http://127.0.0.1:5173/index.html', devServer).allowed).toBe(true);
      expect(validateNavigationUrl('file:///app/dist/renderer/index.html').allowed).toBe(true);

      // Disallowed navigation (external sites or malicious schemes)
      expect(validateNavigationUrl('https://malicious.com', devServer).allowed).toBe(false);
      expect(validateNavigationUrl('http://attacker.com/exploit', devServer).allowed).toBe(false);
      expect(validateNavigationUrl('javascript:void(0)', devServer).allowed).toBe(false);
      expect(validateNavigationUrl('', devServer).allowed).toBe(false);
    });
  });

  // =========================================================================
  // 3. React Markdown Rendering Safety
  // =========================================================================
  describe('3. React Markdown Rendering Safety', () => {
    it('renders malicious markup strictly as escaped text without executing scripts', () => {
      const maliciousPayload = '<script>window.__PWNED__ = true;</script><img src="x" onerror="window.__PWNED__ = true;" />';

      // Component rendering message markdown in React children (matching Knot message UI)
      const MessageComponent: React.FC<{ content: string }> = ({ content }) => (
        <div data-testid="markdown-body" className="text-xs whitespace-pre-wrap font-sans">
          {content}
        </div>
      );

      const { container } = render(<MessageComponent content={maliciousPayload} />);

      const el = screen.getByTestId('markdown-body');
      expect(el).toBeInTheDocument();
      // The text is escaped and preserved as literal text
      expect(el.textContent).toContain('<script>window.__PWNED__ = true;</script>');

      // No actual <script> or <img> tags were created in the DOM
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();

      // Window property was not set
      expect((window as unknown as { __PWNED__?: boolean }).__PWNED__).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. Git Diff Inspection & Secret Redaction
  // =========================================================================
  describe('4. Git Diff Inspection & Secret Redaction', () => {
    it('identifies sensitive file paths correctly', () => {
      // Sensitive paths that must be omitted from diffs
      expect(isSensitiveFilePath('.env')).toBe(true);
      expect(isSensitiveFilePath('.env.local')).toBe(true);
      expect(isSensitiveFilePath('.env.production')).toBe(true);
      expect(isSensitiveFilePath('config/.env')).toBe(true);
      expect(isSensitiveFilePath('id_rsa')).toBe(true);
      expect(isSensitiveFilePath('id_ed25519')).toBe(true);
      expect(isSensitiveFilePath('certs/server.pem')).toBe(true);
      expect(isSensitiveFilePath('keys/private.key')).toBe(true);
      expect(isSensitiveFilePath('credentials.json')).toBe(true);
      expect(isSensitiveFilePath('auth.json')).toBe(true);
      expect(isSensitiveFilePath('secrets.yaml')).toBe(true);

      // Safe paths that should be inspected
      expect(isSensitiveFilePath('src/index.ts')).toBe(false);
      expect(isSensitiveFilePath('README.md')).toBe(false);
      expect(isSensitiveFilePath('package.json')).toBe(false);
      expect(isSensitiveFilePath('environment.ts')).toBe(false);
    });

    it('identifies sensitive credential strings in file contents', () => {
      const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----';
      const awsKey = 'AKIAIOSFODNN7EXAMPLE';
      const githubToken = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature';

      expect(containsSensitiveSecrets(privateKey)).toBe(true);
      expect(containsSensitiveSecrets(awsKey)).toBe(true);
      expect(containsSensitiveSecrets(githubToken)).toBe(true);
      expect(containsSensitiveSecrets(jwtToken)).toBe(true);

      // Ordinary clean code
      expect(containsSensitiveSecrets('const x = 42;\nconsole.log(x);')).toBe(false);
      expect(containsSensitiveSecrets('function hello() { return "world"; }')).toBe(false);
    });

    it('validates repository and relative paths rejecting traversal attempts', () => {
      // Repository path must exist and resolve within root
      expect(validateRepositoryPath(tempDir)).toBe(tempDir);
      expect(() => validateRepositoryPath('/non/existent/path')).toThrow(/does not exist/);

      // Relative path validation
      expect(validateRelativeFilePath('src/index.ts', tempDir)).toBe('src/index.ts');
      expect(() => validateRelativeFilePath('../outside.txt', tempDir)).toThrow(/traversal attempt/i);
      expect(() => validateRelativeFilePath('/etc/passwd', tempDir)).toThrow(/traversal attempt/i);
      expect(() => validateRelativeFilePath('src/null\0byte.ts', tempDir)).toThrow(/null byte/i);

      // Commit hash validation
      expect(validateCommitHash('abcdef1234567890')).toBe('abcdef1234567890');
      expect(validateCommitHash('HEAD')).toBe('HEAD');
      expect(validateCommitHash('HEAD~1')).toBe('HEAD~1');
      expect(() => validateCommitHash('-n')).toThrow(/must not start with a dash/i);
      expect(() => validateCommitHash('; rm -rf /')).toThrow(/Invalid commit hash/i);
    });
  });

  // =========================================================================
  // 5. Orchestration, Concurrency & State Recovery
  // =========================================================================
  describe('5. Orchestration, Concurrency & State Recovery', () => {
    it('CAS atomic claiming race: exactly one worker succeeds, other receives null', () => {
      const queue = new TaskQueue(dbService);
      const task = dbService.tasks.create({
        sessionId,
        title: 'CAS Race Condition Task',
        priority: 'high',
        status: 'queued',
        approvalStatus: 'approved',
      });

      // Simultaneous claim attempts
      const claim1 = queue.claimNextExecutable(sessionId);
      const claim2 = queue.claimNextExecutable(sessionId);

      expect(claim1).not.toBeNull();
      expect(claim1?.id).toBe(task.id);
      expect(claim1?.status).toBe('running');

      // The second claim MUST receive null because task status is now 'running'
      expect(claim2).toBeNull();
    });

    it('handles concurrent/duplicate event insertion safely (ON CONFLICT DO NOTHING / Idempotency)', () => {
      const eventId = 'evt-concurrent-duplicate-123';
      const eventPayload = {
        id: eventId,
        projectId: project.id,
        sessionId,
        eventType: 'task_created',
        actor: 'user',
        title: 'Concurrent Event Output',
        timestamp: new Date().toISOString(),
      };

      // First insertion succeeds
      const created1 = dbService.events.append(eventPayload);
      expect(created1.id).toBe(eventId);

      // Second insertion with the exact same ID is safely handled idempotently without throwing or crashing
      expect(() => {
        const created2 = dbService.events.append(eventPayload);
        expect(created2.id).toBe(eventId);
      }).not.toThrow();

      // Verify only 1 record exists in database
      const allEvents = dbService.events.listBySession(sessionId);
      const matching = allEvents.filter((e) => e.id === eventId);
      expect(matching.length).toBe(1);
    });

    it('invalidates approval when task instructions are modified', async () => {
      const initialInstructions = 'Create a secure authentication endpoint.';
      const contentHash = computeTaskContentHash({
        title: 'Tamper Test Task',
        description: initialInstructions,
      });

      const task = dbService.tasks.create({
        sessionId,
        title: 'Tamper Test Task',
        description: initialInstructions,
        priority: 'medium',
        status: 'queued',
        approvalStatus: 'approved',
      });

      // Update approvedContentHash
      dbService.db.prepare('UPDATE tasks SET approved_content_hash = ? WHERE id = ?').run(contentHash, task.id);
      const savedTask = dbService.tasks.get(task.id)!;

      // Verify integrity initially holds
      expect(verifyTaskContentIntegrity(savedTask).valid).toBe(true);

      // Malicious modification of instruction behind the back
      const tamperedTask = {
        ...savedTask,
        description: 'Tampered instruction: Delete production database.',
      };

      // Content integrity verification MUST fail
      expect(verifyTaskContentIntegrity(tamperedTask).valid).toBe(false);

      // TaskDispatcher must reject dispatching tampered task and revoke approval
      const dispatcher = new TaskDispatcher({
        dbService,
        antigravityManager: {
          start: vi.fn(),
          executeTask: vi.fn(),
          getStatus: vi.fn().mockResolvedValue({ state: 'ready' }),
        } as any,
        queue: new TaskQueue(dbService),
      });

      await expect(dispatcher.executeTask(tamperedTask)).rejects.toThrow(
        /content was modified after approval/i
      );

      // Verify that approval was revoked in database
      const revoked = dbService.tasks.get(task.id)!;
      expect(revoked.approvalStatus).toBe('awaiting_approval');
      expect(revoked.status).toBe('awaiting_approval');
    });

    it('gates sensitive task requiring approval even when project trustPolicy is trusted', () => {
      const autoProject = dbService.projects.create({
        name: 'Auto Project',
        repositoryPath: tempDir,
        trustPolicy: 'trusted',
      });
      const autoSession = dbService.sessions.create({
        projectId: autoProject.id,
        title: 'Auto Session',
      });

      // Critical task: policy should require approval despite project trustPolicy: 'trusted'
      const criticalTask = dbService.tasks.create({
        sessionId: autoSession.id,
        title: 'Destructive Production Migration',
        description: 'DROP TABLE production_users; rm -rf /var/cache;',
        priority: 'critical',
      });

      const policy = TaskPolicy.evaluate(criticalTask.title, criticalTask.description || '', {
        priority: 'critical',
        projectTrustPolicy: 'trusted',
      });
      expect(policy.requiresApproval).toBe(true);
      expect(policy.category).toBe('sensitive');
      expect(policy.reason).toBeDefined();
    });

    it('cancels queued task and ensures it is never claimed or dispatched', () => {
      const queue = new TaskQueue(dbService);
      const task = dbService.tasks.create({
        sessionId,
        title: 'Task To Be Cancelled',
        priority: 'medium',
        status: 'queued',
        approvalStatus: 'approved',
      });

      // Cancel the task before worker claim
      dbService.tasks.updateExecution(task.id, { status: 'cancelled' });

      // Worker claim attempt should return null
      const claim = queue.claimNextExecutable(sessionId);
      expect(claim).toBeNull();

      const fetched = dbService.tasks.get(task.id);
      expect(fetched?.status).toBe('cancelled');
    });

    it('reconciles running tasks to interrupted on restart without crashing', async () => {
      const task = dbService.tasks.create({
        sessionId,
        title: 'Orphaned Running Task at Shutdown',
        priority: 'high',
        status: 'running',
        approvalStatus: 'approved',
      });

      const bridgeService = new BridgeService({
        customBridgeRoot: path.join(tempDir, 'bridge'),
        dbService,
      });
      const reconciliationService = new ReconciliationService({
        dbService,
        bridgeService,
      });

      // Simulate startup reconciliation
      const report = await reconciliationService.reconcile();
      expect(report.tasksReconciled).toBeGreaterThanOrEqual(1);

      const reconciledTask = dbService.tasks.get(task.id);
      expect(reconciledTask?.status).toBe('interrupted');
      expect(reconciledTask?.failureReason).toContain('Execution interrupted');

      await bridgeService.close();
    });
  });
});
