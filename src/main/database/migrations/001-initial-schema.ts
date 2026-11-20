import type { DatabaseSync } from 'node:sqlite';

export const migration001 = {
  version: 1,
  name: '001-initial-schema',
  up: (db: DatabaseSync): void => {
    // 1. Projects Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repository_path TEXT,
        repository_remote TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT NULL
      );
    `);

    // 2. Sessions Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        started_at TEXT NULL,
        ended_at TEXT NULL,
        metadata_json TEXT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at DESC);
    `);

    // 3. Messages Table (Append-only)
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        sender TEXT NOT NULL,
        recipient TEXT NULL,
        message_type TEXT NOT NULL,
        content_markdown TEXT NOT NULL,
        correlation_id TEXT NULL,
        metadata_json TEXT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (session_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages(session_id, sequence ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
    `);

    // 4. Tasks Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        created_by TEXT,
        assigned_to TEXT,
        status TEXT NOT NULL,
        approval_status TEXT,
        payload_json TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT NULL,
        completed_at TEXT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    `);

    // 5. Events Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        task_id TEXT NULL REFERENCES tasks(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        data_json TEXT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id);
    `);
  },
};
