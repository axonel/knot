import type { DatabaseSync } from 'node:sqlite';

export const migration004 = {
  version: 4,
  name: '004-task-git-boundary',
  up: (db: DatabaseSync): void => {
    // Add column to tasks table for persisting task-boundary Git metadata
    db.exec(`
      ALTER TABLE tasks ADD COLUMN git_boundary_json TEXT;
    `);
  },
};
