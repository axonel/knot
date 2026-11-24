import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, withTransaction } from '../src/main/database/connection.js';
import { runMigrations } from '../src/main/database/migrations/index.js';

describe('SQLite Database Layer & Migrations', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-db-test-'));
    dbPath = path.join(tempDir, 'knot-test.sqlite');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error in temp
    }
  });

  describe('Database Initialization & Pragmas', () => {
    it('creates database file, parent directories, and executes migrations', () => {
      const nestedPath = path.join(tempDir, 'nested', 'deep', 'knot.sqlite');
      const db = initDatabase(nestedPath);

      expect(fs.existsSync(nestedPath)).toBe(true);

      // Verify schema_migrations table
      const migrations = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version ASC').all() as {
        version: number;
        name: string;
      }[];

      expect(migrations.length).toBeGreaterThanOrEqual(1);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('001-initial-schema');

      db.close();
    });

    it('enables WAL mode, foreign keys, and busy timeout', () => {
      const db = initDatabase(dbPath);

      // PRAGMA foreign_keys
      const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
      expect(fk.foreign_keys).toBe(1);

      // PRAGMA journal_mode
      const jm = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(jm.journal_mode.toLowerCase()).toBe('wal');

      // PRAGMA busy_timeout
      const bt = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };
      expect(bt.timeout).toBeGreaterThanOrEqual(5000);

      db.close();
    });

    it('is idempotent when re-running migrations on an existing database', () => {
      const db1 = initDatabase(dbPath);
      db1.close();

      // Open second time
      const db2 = initDatabase(dbPath);
      const count = db2.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as { count: number };
      expect(count.count).toBe(2);

      db2.close();
    });
  });

  describe('Foreign Key Enforcement', () => {
    it('rejects inserting a session with an invalid project_id', () => {
      const db = initDatabase(dbPath);

      expect(() => {
        db.prepare(`
          INSERT INTO sessions (id, project_id, title, status, created_at, updated_at, last_activity_at)
          VALUES ('sess-1', 'non-existent-project', 'Test Session', 'active', '2026-01-01', '2026-01-01', '2026-01-01')
        `).run();
      }).toThrow(/FOREIGN KEY constraint failed/i);

      db.close();
    });

    it('rejects inserting a message with an invalid session_id', () => {
      const db = initDatabase(dbPath);

      expect(() => {
        db.prepare(`
          INSERT INTO messages (id, session_id, sequence, sender, message_type, content_markdown, created_at)
          VALUES ('msg-1', 'non-existent-session', 1, 'user', 'text', 'Hello', '2026-01-01')
        `).run();
      }).toThrow(/FOREIGN KEY constraint failed/i);

      db.close();
    });

    it('rejects inserting an event with an invalid session_id', () => {
      const db = initDatabase(dbPath);

      expect(() => {
        db.prepare(`
          INSERT INTO events (id, session_id, event_type, actor, created_at)
          VALUES ('ev-1', 'non-existent-session', 'test', 'user', '2026-01-01')
        `).run();
      }).toThrow(/FOREIGN KEY constraint failed/i);

      db.close();
    });
  });

  describe('Transactions & Rollback Safety', () => {
    it('rolls back all mutations if an error is thrown within withTransaction', () => {
      const db = initDatabase(dbPath);

      // Create a valid project first
      db.prepare(`
        INSERT INTO projects (id, name, created_at, updated_at)
        VALUES ('p-rollback', 'Valid Project', '2026-01-01', '2026-01-01')
      `).run();

      expect(() => {
        withTransaction(db, () => {
          db.prepare(`
            INSERT INTO projects (id, name, created_at, updated_at)
            VALUES ('p-inside-tx', 'Tx Project', '2026-01-01', '2026-01-01')
          `).run();

          // Deliberate error to trigger rollback
          throw new Error('Simulated failure during multi-step operation');
        });
      }).toThrow('Simulated failure during multi-step operation');

      // Verify that 'p-inside-tx' was NOT committed
      const found = db.prepare("SELECT * FROM projects WHERE id = 'p-inside-tx'").get();
      expect(found).toBeUndefined();

      // Verify original project still exists
      const original = db.prepare("SELECT * FROM projects WHERE id = 'p-rollback'").get();
      expect(original).toBeDefined();

      db.close();
    });

    it('safely rolls back a migration if a migration step fails', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('PRAGMA foreign_keys = ON;');

      const faultyMigrations = [
        {
          version: 999,
          name: '999-faulty',
          up: (database: DatabaseSync) => {
            database.exec('CREATE TABLE test_faulty (id TEXT PRIMARY KEY);');
            throw new Error('Deliberate migration syntax error');
          },
        },
      ];

      expect(() => runMigrations(db, faultyMigrations)).toThrow('Deliberate migration syntax error');

      // Table should not exist due to transactional rollback
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_faulty'").get();
      expect(tableCheck).toBeUndefined();

      db.close();
    });
  });

  describe('Persistence across Reopening', () => {
    it('persists data across connection close and re-open', () => {
      // Step 1: Open, insert records, and close
      const db1 = initDatabase(dbPath);
      db1.prepare(`
        INSERT INTO projects (id, name, repository_path, created_at, updated_at)
        VALUES ('proj-persist-1', 'Persistent Knot Project', '/path/to/knot', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
      `).run();

      db1.prepare(`
        INSERT INTO sessions (id, project_id, title, status, created_at, updated_at, last_activity_at)
        VALUES ('sess-persist-1', 'proj-persist-1', 'Initial Session', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
      `).run();

      db1.prepare(`
        INSERT INTO messages (id, session_id, sequence, sender, message_type, content_markdown, created_at)
        VALUES ('msg-persist-1', 'sess-persist-1', 1, 'user', 'text', 'Persisted message content', '2026-01-01T00:00:00Z')
      `).run();

      db1.close();

      // Step 2: Reopen the database from the same file path
      const db2 = initDatabase(dbPath);

      const project = db2.prepare("SELECT * FROM projects WHERE id = 'proj-persist-1'").get() as {
        name: string;
        repository_path: string;
      };
      expect(project).toBeDefined();
      expect(project.name).toBe('Persistent Knot Project');
      expect(project.repository_path).toBe('/path/to/knot');

      const session = db2.prepare("SELECT * FROM sessions WHERE id = 'sess-persist-1'").get() as {
        title: string;
        status: string;
      };
      expect(session).toBeDefined();
      expect(session.title).toBe('Initial Session');
      expect(session.status).toBe('active');

      const message = db2.prepare("SELECT * FROM messages WHERE id = 'msg-persist-1'").get() as {
        content_markdown: string;
        sequence: number;
      };
      expect(message).toBeDefined();
      expect(message.content_markdown).toBe('Persisted message content');
      expect(message.sequence).toBe(1);

      db2.close();
    });
  });
});
