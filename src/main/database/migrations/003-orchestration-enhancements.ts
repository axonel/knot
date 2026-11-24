import type { DatabaseSync } from 'node:sqlite';

export const migration003 = {
  version: 3,
  name: '003-orchestration-enhancements',
  up: (db: DatabaseSync): void => {
    // Add columns to tasks table for orchestration, idempotency and safety tracking
    db.exec(`
      ALTER TABLE tasks ADD COLUMN source_message_id TEXT;
      ALTER TABLE tasks ADD COLUMN result_message_id TEXT;
      ALTER TABLE tasks ADD COLUMN dispatched_at TEXT;
      ALTER TABLE tasks ADD COLUMN failure_reason TEXT;
      ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'normal';
      ALTER TABLE tasks ADD COLUMN execution_mode TEXT DEFAULT 'default';
      ALTER TABLE tasks ADD COLUMN acceptance_criteria_json TEXT;
      ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source_message_id ON tasks(source_message_id);
    `);
  },
};
