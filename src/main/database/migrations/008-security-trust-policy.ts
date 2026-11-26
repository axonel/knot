import type { DatabaseSync } from 'node:sqlite';

export const migration008 = {
  version: 8,
  name: '008-security-trust-policy',
  up: (db: DatabaseSync): void => {
    db.exec(`
      -- Add project trust policy column (approval_required | trusted)
      ALTER TABLE projects ADD COLUMN trust_policy TEXT NOT NULL DEFAULT 'approval_required';

      -- Add task content integrity & authorization binding columns
      ALTER TABLE tasks ADD COLUMN content_hash TEXT;
      ALTER TABLE tasks ADD COLUMN approved_content_hash TEXT;
      ALTER TABLE tasks ADD COLUMN approved_by TEXT;
      ALTER TABLE tasks ADD COLUMN approved_at TEXT;
    `);
  },
};
