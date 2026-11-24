import type { DatabaseSync } from 'node:sqlite';
import { migration001 } from './001-initial-schema.js';
import { migration002 } from './002-agent-sessions.js';
import { migration003 } from './003-orchestration-enhancements.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

const allMigrations: Migration[] = [migration001, migration002, migration003];

export function runMigrations(db: DatabaseSync, migrations: Migration[] = allMigrations): void {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all() as { version: number }[];

  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      db.exec('BEGIN TRANSACTION;');
      try {
        migration.up(db);
        const insertStmt = db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
        );
        insertStmt.run(migration.version, migration.name, new Date().toISOString());
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw new Error(
          `Failed to execute migration ${migration.version} (${migration.name}): ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }
}
