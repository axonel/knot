import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from './index.js';

export const migration007: Migration = {
  version: 7,
  name: 'reliability_hardening_and_reconciliation_history',
  up: (db: DatabaseSync) => {
    // 1. Reconciliation History Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS reconciliation_history (
        id TEXT PRIMARY KEY NOT NULL,
        reconciled_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        tasks_reconciled INTEGER NOT NULL,
        bridge_files_reconciled INTEGER NOT NULL,
        context_docs_reconciled INTEGER NOT NULL,
        results_reconciled INTEGER NOT NULL,
        issues_detected INTEGER NOT NULL,
        issues_repaired INTEGER NOT NULL,
        details_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_reconciliation_history_reconciled_at
        ON reconciliation_history(reconciled_at DESC);
    `);

    // 2. High-performance composite index for atomic queue claiming & scheduling
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_claim_lookup
        ON tasks(session_id, status, approval_status, priority, created_at);
    `);
  },
};
