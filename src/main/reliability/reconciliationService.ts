import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '../database/index.js';
import type { BridgeService } from '../bridge/bridgeService.js';
import type { AntigravityManager } from '../antigravity/antigravityManager.js';
import type {
  ReconciliationReport,
  ReliabilityDiagnostics,
  TaskExecutionDetails,
} from '../../shared/types.js';
import { computeSha256 } from '../database/repositories/contextRepository.js';
import { formatBridgeMessage } from '../bridge/protocol.js';

export interface ReconciliationServiceOptions {
  dbService: DatabaseService;
  bridgeService: BridgeService;
  antigravityManager?: AntigravityManager;
}

export class ReconciliationService {
  private dbService: DatabaseService;
  private bridgeService: BridgeService;
  private antigravityManager?: AntigravityManager;

  constructor(options: ReconciliationServiceOptions) {
    this.dbService = options.dbService;
    this.bridgeService = options.bridgeService;
    this.antigravityManager = options.antigravityManager;
  }

  public setAntigravityManager(mgr: AntigravityManager): void {
    this.antigravityManager = mgr;
  }

  /**
   * Performs full runtime state reconciliation across:
   * 1. Task queue (recovering in-flight running tasks to 'interrupted').
   * 2. Antigravity session records (marking orphaned processes).
   * 3. Context Vault integrity (detecting drift, re-materializing missing files).
   * 4. Bridge filesystem mailboxes (re-ingesting stuck inbox files, verifying conversation.md).
   * 5. Task results (re-materializing missing task-*-result.md files in outbox).
   *
   * Persists report to SQLite reconciliation_history and returns detailed report.
   */
  public async reconcile(): Promise<ReconciliationReport> {
    const startTime = Date.now();
    const reportId = randomUUID();
    const reconciledAt = new Date().toISOString();

    const report: ReconciliationReport = {
      id: reportId,
      reconciledAt,
      durationMs: 0,
      tasksReconciled: 0,
      bridgeFilesReconciled: 0,
      contextDocsReconciled: 0,
      resultsReconciled: 0,
      issuesDetected: 0,
      issuesRepaired: 0,
      details: {
        interruptedTasksRecovered: [],
        archivedTasksCancelled: [],
        missedBridgeMessagesProcessed: [],
        reMaterializedContextFiles: [],
        contextDriftConflictsDetected: [],
        reMaterializedResultFiles: [],
        errors: [],
      },
    };

    const bridgeRoot = this.bridgeService.getBridgeRoot();
    const projects = this.dbService.projects.list();

    // ---------------------------------------------------------
    // 1. Reconcile Tasks
    // ---------------------------------------------------------
    try {
      // Find tasks that were in-flight ('running') when runtime restarted or crashed
      const runningTasks = (this.dbService.db
        .prepare("SELECT * FROM tasks WHERE status = 'running'")
        .all() as unknown) as Array<{ id: string; session_id: string; title: string; approval_status: string }>;

      report.tasksReconciled += runningTasks.length;

      for (const t of runningTasks) {
        report.issuesDetected++;
        const completedAt = new Date().toISOString();
        const failureReason = 'Execution interrupted: Knot was terminated or restarted while task was in-flight.';

        // Update task to 'interrupted' while strictly preserving its approval status
        this.dbService.tasks.updateExecution(t.id, {
          status: 'interrupted',
          completedAt,
          failureReason,
        });

        // Record audit event for traceability
        this.dbService.events.append({
          sessionId: t.session_id,
          taskId: t.id,
          eventType: 'task_interrupted',
          actor: 'knot',
          source: 'orchestration_runtime',
          provenance: 'knot_observed',
          severity: 'warn',
          title: `Task Interrupted: ${t.title}`,
          data: {
            reason: failureReason,
            priorStatus: 'running',
            approvalStatus: t.approval_status,
          },
        });

        report.details.interruptedTasksRecovered.push(t.id);
        report.issuesRepaired++;
      }

      // Check queued tasks belonging to archived sessions
      const queuedInArchived = (this.dbService.db
        .prepare(`
          SELECT t.id, t.session_id, t.title 
          FROM tasks t 
          JOIN sessions s ON t.session_id = s.id 
          WHERE t.status = 'queued' AND s.status = 'archived'
        `)
        .all() as unknown) as Array<{ id: string; session_id: string; title: string }>;

      for (const t of queuedInArchived) {
        report.issuesDetected++;
        this.dbService.tasks.updateExecution(t.id, {
          status: 'cancelled',
          completedAt: new Date().toISOString(),
          failureReason: 'Session is archived.',
        });
        report.details.archivedTasksCancelled.push(t.id);
        report.issuesRepaired++;
      }
    } catch (err) {
      report.details.errors.push(`Task reconciliation error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ---------------------------------------------------------
    // 2. Reconcile Antigravity Agent Sessions
    // ---------------------------------------------------------
    try {
      const activeAgentSessions = (this.dbService.db
        .prepare("SELECT * FROM agent_sessions WHERE status IN ('starting', 'running')")
        .all() as unknown) as Array<{ id: string; session_id: string; agent_type: string }>;

      for (const agentSession of activeAgentSessions) {
        const isActuallyRunning = this.antigravityManager
          ? this.antigravityManager.isProcessRunning(agentSession.session_id)
          : false;

        if (!isActuallyRunning) {
          report.issuesDetected++;
          this.dbService.agentSessions.updateStatusBySession(agentSession.session_id, agentSession.agent_type, 'stopped', 0);
          report.details.errors.push(
            `Agent session ${agentSession.id} (session: ${agentSession.session_id}) was marked running but process is inactive; updated to stopped.`
          );
          report.issuesRepaired++;
        }
      }
    } catch (err) {
      report.details.errors.push(`Agent session reconciliation error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ---------------------------------------------------------
    // 3. Reconcile Context Vault Integrity & Drift Detection
    // ---------------------------------------------------------
    try {
      for (const project of projects) {
        const docs = this.dbService.context.list({ projectId: project.id, includeArchived: true });
        report.contextDocsReconciled += docs.length;

        let needsWorkspaceSync = false;

        for (const doc of docs) {
          let expectedRelPath = path.join('projects', project.id, 'context', `${doc.id}.md`);
          if (doc.scope === 'session' && doc.sessionId) {
            expectedRelPath = path.join('projects', project.id, 'sessions', doc.sessionId, 'context', `${doc.id}.md`);
          }
          const fullPath = path.join(bridgeRoot, expectedRelPath);

          if (!fs.existsSync(fullPath)) {
            // Materialized file is missing from filesystem; re-materialize from SQLite (canonical source of truth)
            report.issuesDetected++;
            needsWorkspaceSync = true;
            report.details.reMaterializedContextFiles.push(doc.id);
            report.issuesRepaired++;
          } else {
            // File exists; check for on-disk drift against SQLite canonical content
            try {
              const fileContent = fs.readFileSync(fullPath, 'utf-8');
              const computedHash = computeSha256(doc.contentMarkdown);
              if (doc.contentHash && !fileContent.includes(doc.contentHash) && !fileContent.includes(computedHash)) {
                const isExactContentPresent = fileContent.includes(doc.contentMarkdown.trim());
                if (!isExactContentPresent) {
                  report.issuesDetected++;
                  const driftMsg = `On-disk drift detected for context doc ${doc.id} ("${doc.title}") at ${expectedRelPath}. Preserving canonical SQLite state.`;
                  report.details.contextDriftConflictsDetected.push(driftMsg);
                }
              }
            } catch {
              // Ignore read errors
            }
          }
        }

        // Check if context-manifest.md is missing or docs needed re-materialization
        const manifestPath = path.join(bridgeRoot, 'projects', project.id, 'context-manifest.md');
        if (needsWorkspaceSync || !fs.existsSync(manifestPath)) {
          this.bridgeService.syncContextWorkspace(project.id);
        }
      }
    } catch (err) {
      report.details.errors.push(`Context vault reconciliation error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ---------------------------------------------------------
    // 4. Reconcile Bridge Filesystem Mailboxes
    // ---------------------------------------------------------
    try {
      for (const project of projects) {
        const sessions = this.dbService.sessions.listByProject(project.id);
        for (const session of sessions) {
          const sessionDir = path.join(bridgeRoot, 'projects', project.id, 'sessions', session.id);
          const inboxDir = path.join(sessionDir, 'inbox', 'chatgpt');
          const outboxDir = path.join(sessionDir, 'outbox', 'knot');
          const rejectedDir = path.join(sessionDir, 'rejected', 'chatgpt');
          const conversationFile = path.join(sessionDir, 'conversation.md');

          // Ensure directories exist
          if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });
          if (!fs.existsSync(outboxDir)) fs.mkdirSync(outboxDir, { recursive: true });
          if (!fs.existsSync(rejectedDir)) fs.mkdirSync(rejectedDir, { recursive: true });

          // Check canonical conversation file
          if (!fs.existsSync(conversationFile)) {
            report.issuesDetected++;
            this.bridgeService.syncCanonicalConversation(project.id, session.id, sessionDir);
            report.details.missedBridgeMessagesProcessed.push(conversationFile);
            report.issuesRepaired++;
          }

          // Scan inbox for any un-ingested files
          if (fs.existsSync(inboxDir)) {
            const files = fs.readdirSync(inboxDir);
            for (const f of files) {
              report.bridgeFilesReconciled++;
              if (f.endsWith('.md') && !f.includes('.tmp.')) {
                report.issuesDetected++;
                const fullInboxFile = path.join(inboxDir, f);
                try {
                  // Re-process inbox message through bridge watcher
                  await (this.bridgeService as any).watcher.handleFile(fullInboxFile, {
                    projectId: project.id,
                    sessionId: session.id,
                  });
                  report.details.missedBridgeMessagesProcessed.push(fullInboxFile);
                  report.issuesRepaired++;
                } catch (err) {
                  report.details.errors.push(
                    `Failed to process stuck inbox file ${fullInboxFile}: ${err instanceof Error ? err.message : String(err)}`
                  );
                }
              }
            }
          }

          // Check rejected files for missing companion .error.json telemetry
          if (fs.existsSync(rejectedDir)) {
            const rejectedFiles = fs.readdirSync(rejectedDir);
            for (const rf of rejectedFiles) {
              if (rf.endsWith('.md') && !rf.endsWith('.error.json')) {
                const baseName = path.parse(rf).name;
                const errorJsonPath = path.join(rejectedDir, `${baseName}.error.json`);
                if (!fs.existsSync(errorJsonPath)) {
                  report.issuesDetected++;
                  fs.writeFileSync(
                    errorJsonPath,
                    JSON.stringify(
                      {
                        code: 'UNKNOWN_REJECTION',
                        message: 'Malformed or rejected message archived during reconciliation.',
                        reconciledAt,
                      },
                      null,
                      2
                    ),
                    'utf-8'
                  );
                  report.details.missedBridgeMessagesProcessed.push(errorJsonPath);
                  report.issuesRepaired++;
                }
              }
            }
          }

          // Check completed task result publication in outbox
          const completedTasks = this.dbService.tasks.listBySession(session.id).filter(
            (t) => t.status === 'succeeded' || t.status === 'failed'
          );

          for (const task of completedTasks) {
            report.resultsReconciled++;
            const expectedResultFile = path.join(outboxDir, `task-${task.id}-result.md`);

            if (!fs.existsSync(expectedResultFile)) {
              report.issuesDetected++;
              const executionDetails = (task.payload?.executionDetails as TaskExecutionDetails) || {};
              const title = task.title;
              const outcome = task.status;
              const bodyMarkdown = [
                `# Task Result: ${title}`,
                '',
                `- **Task ID**: \`${task.id}\``,
                `- **Status**: \`${outcome}\``,
                `- **Completed At**: \`${task.completedAt || new Date().toISOString()}\``,
                task.failureReason ? `- **Failure Reason**: ${task.failureReason}` : null,
                '',
                '### Summary',
                task.description || 'No description provided.',
                '',
                '### Execution Details',
                `- Changed Files: ${(executionDetails.changedFiles || []).length}`,
                `- Commands Executed: ${(executionDetails.commandsExecuted || []).length}`,
                executionDetails.commitHash ? `- Commit: \`${executionDetails.commitHash}\`` : null,
              ]
                .filter(Boolean)
                .join('\n');

              const formatted = formatBridgeMessage(
                {
                  id: task.resultMessageId || randomUUID(),
                  protocol: 'v1',
                  projectId: project.id,
                  sessionId: session.id,
                  sender: 'knot',
                  recipient: 'chatgpt',
                  type: 'task_result',
                  createdAt: task.completedAt || new Date().toISOString(),
                  metadata: {
                    taskId: task.id,
                    status: task.status,
                  },
                },
                bodyMarkdown
              );

              fs.writeFileSync(expectedResultFile, formatted, 'utf-8');
              report.details.reMaterializedResultFiles.push(task.id);
              report.issuesRepaired++;
            }
          }
        }
      }

      // Sync global workspace index
      this.bridgeService.syncWorkspaceIndex();
    } catch (err) {
      report.details.errors.push(`Bridge reconciliation error: ${err instanceof Error ? err.message : String(err)}`);
    }

    report.durationMs = Date.now() - startTime;

    // Persist to reconciliation_history table
    try {
      this.dbService.reconciliation.insert(report);
    } catch (err) {
      console.error('[ReconciliationService] Failed to persist reconciliation history:', err);
    }

    return report;
  }

  /**
   * Retrieves high-level diagnostics regarding the current system reliability.
   */
  public async getDiagnostics(): Promise<ReliabilityDiagnostics> {
    const bridgeLifecycle = this.bridgeService.getLifecycleState();

    let dbAvailable = true;
    let dbVersion = 7;
    let dbError: string | null = null;
    let runningTasksCount = 0;
    let queuedTasksCount = 0;
    let awaitingApprovalCount = 0;
    let interruptedTasksCount = 0;

    try {
      const vRow = this.dbService.db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as { version?: number };
      if (vRow && typeof vRow.version === 'number') {
        dbVersion = vRow.version;
      }

      const counts = (this.dbService.db
        .prepare(`
          SELECT status, COUNT(*) as count 
          FROM tasks 
          GROUP BY status
        `)
        .all() as unknown) as Array<{ status: string; count: number }>;

      for (const row of counts) {
        if (row.status === 'running') runningTasksCount = row.count;
        if (row.status === 'queued') queuedTasksCount = row.count;
        if (row.status === 'awaiting_approval') awaitingApprovalCount = row.count;
        if (row.status === 'interrupted') interruptedTasksCount = row.count;
      }
    } catch (err) {
      dbAvailable = false;
      dbError = err instanceof Error ? err.message : String(err);
    }

    let activeProcessesCount = 0;
    if (this.antigravityManager) {
      if (this.antigravityManager.isProcessRunning()) {
        activeProcessesCount = 1;
      }
    }

    // Count stuck inbox files and rejected files across sessions
    let pendingInboundCount = 0;
    let rejectedCount = 0;
    const watchedPaths = (this.bridgeService as any).watcher?.getWatchedPaths?.() || [];

    try {
      const bridgeRoot = this.bridgeService.getBridgeRoot();
      const projects = this.dbService.projects.list();
      for (const p of projects) {
        const sessions = this.dbService.sessions.listByProject(p.id);
        for (const s of sessions) {
          const inboxDir = path.join(bridgeRoot, 'projects', p.id, 'sessions', s.id, 'inbox', 'chatgpt');
          if (fs.existsSync(inboxDir)) {
            const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith('.md') && !f.includes('.tmp.'));
            pendingInboundCount += files.length;
          }
          const rejDir = path.join(bridgeRoot, 'projects', p.id, 'sessions', s.id, 'rejected', 'chatgpt');
          if (fs.existsSync(rejDir)) {
            const files = fs.readdirSync(rejDir).filter((f) => f.endsWith('.md'));
            rejectedCount += files.length;
          }
        }
      }
    } catch {
      // Ignore filesystem enumeration errors
    }

    const lastReport = this.dbService.reconciliation.getLatest();

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'failed' | 'unknown' = 'healthy';
    if (!dbAvailable || bridgeLifecycle === 'failed') {
      status = 'failed';
    } else if (bridgeLifecycle === 'degraded' || interruptedTasksCount > 0 || pendingInboundCount > 0) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      database: {
        available: dbAvailable,
        path: ':default:',
        version: dbVersion,
        walMode: true,
        busyTimeout: 5000,
        error: dbError,
      },
      bridge: {
        status: bridgeLifecycle,
        activeWatchersCount: watchedPaths.length,
        watchedPaths,
        pendingInboundCount,
        rejectedCount,
        lastError: null,
      },
      orchestration: {
        activeProcessesCount,
        runningTasksCount,
        queuedTasksCount,
        awaitingApprovalCount,
        interruptedTasksCount,
        pendingResultsPublicationCount: 0,
      },
      reconciliation: {
        lastReconciliationAt: lastReport?.reconciledAt ?? null,
        lastDurationMs: lastReport?.durationMs ?? null,
        issuesDetectedTotal: lastReport?.issuesDetected ?? 0,
        issuesRepairedTotal: lastReport?.issuesRepaired ?? 0,
        lastReport: lastReport ?? null,
      },
    };
  }
}
