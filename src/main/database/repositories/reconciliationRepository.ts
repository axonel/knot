import type { DatabaseSync } from 'node:sqlite';
import type { ReconciliationReport } from '../../../shared/types.js';
import type { ReconciliationHistoryRecord } from '../types.js';

export class ReconciliationRepository {
  constructor(private db: DatabaseSync) {}

  private mapRow(row: ReconciliationHistoryRecord): ReconciliationReport {
    let details: ReconciliationReport['details'] = {
      interruptedTasksRecovered: [],
      archivedTasksCancelled: [],
      missedBridgeMessagesProcessed: [],
      reMaterializedContextFiles: [],
      contextDriftConflictsDetected: [],
      reMaterializedResultFiles: [],
      errors: [],
    };

    if (row.details_json) {
      try {
        const parsed = JSON.parse(row.details_json);
        details = {
          interruptedTasksRecovered: parsed.interruptedTasksRecovered || [],
          archivedTasksCancelled: parsed.archivedTasksCancelled || [],
          missedBridgeMessagesProcessed: parsed.missedBridgeMessagesProcessed || [],
          reMaterializedContextFiles: parsed.reMaterializedContextFiles || [],
          contextDriftConflictsDetected: parsed.contextDriftConflictsDetected || [],
          reMaterializedResultFiles: parsed.reMaterializedResultFiles || [],
          errors: parsed.errors || [],
        };
      } catch {
        // Fallback to empty details
      }
    }

    return {
      id: row.id,
      reconciledAt: row.reconciled_at,
      durationMs: row.duration_ms,
      tasksReconciled: row.tasks_reconciled,
      bridgeFilesReconciled: row.bridge_files_reconciled,
      contextDocsReconciled: row.context_docs_reconciled,
      resultsReconciled: row.results_reconciled,
      issuesDetected: row.issues_detected,
      issuesRepaired: row.issues_repaired,
      details,
    };
  }

  public insert(report: ReconciliationReport): void {
    const stmt = this.db.prepare(`
      INSERT INTO reconciliation_history (
        id,
        reconciled_at,
        duration_ms,
        tasks_reconciled,
        bridge_files_reconciled,
        context_docs_reconciled,
        results_reconciled,
        issues_detected,
        issues_repaired,
        details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      report.id,
      report.reconciledAt,
      report.durationMs,
      report.tasksReconciled,
      report.bridgeFilesReconciled,
      report.contextDocsReconciled,
      report.resultsReconciled,
      report.issuesDetected,
      report.issuesRepaired,
      JSON.stringify(report.details)
    );
  }

  public getLatest(): ReconciliationReport | null {
    const row = this.db
      .prepare('SELECT * FROM reconciliation_history ORDER BY reconciled_at DESC LIMIT 1')
      .get() as unknown as ReconciliationHistoryRecord | undefined;

    return row ? this.mapRow(row) : null;
  }

  public list(limit = 10): ReconciliationReport[] {
    const rows = (this.db
      .prepare('SELECT * FROM reconciliation_history ORDER BY reconciled_at DESC LIMIT ?')
      .all(limit) as unknown) as ReconciliationHistoryRecord[];

    return rows.map((r) => this.mapRow(r));
  }
}
