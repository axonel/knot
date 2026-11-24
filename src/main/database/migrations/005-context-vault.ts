import type { DatabaseSync } from 'node:sqlite';

export const migration005 = {
  version: 5,
  name: '005-context-vault',
  up: (db: DatabaseSync): void => {
    // 1. Create context_documents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        scope TEXT NOT NULL CHECK(scope IN ('project', 'session')),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content_markdown TEXT NOT NULL,
        author TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK(provenance IN ('user-authored', 'chatgpt-authored', 'antigravity-reported', 'knot-derived')),
        content_hash TEXT NOT NULL,
        current_revision INTEGER NOT NULL DEFAULT 1,
        is_archived INTEGER NOT NULL DEFAULT 0,
        requires_verification INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_context_documents_project_id ON context_documents(project_id);
      CREATE INDEX IF NOT EXISTS idx_context_documents_session_id ON context_documents(session_id);
      CREATE INDEX IF NOT EXISTS idx_context_documents_scope ON context_documents(scope);
      CREATE INDEX IF NOT EXISTS idx_context_documents_category ON context_documents(category);
      CREATE INDEX IF NOT EXISTS idx_context_documents_is_archived ON context_documents(is_archived);
    `);

    // 2. Create context_revisions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_revisions (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL REFERENCES context_documents(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        title TEXT NOT NULL,
        content_markdown TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        author TEXT NOT NULL,
        provenance TEXT NOT NULL,
        requires_verification INTEGER NOT NULL DEFAULT 0,
        change_summary TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(context_id, revision)
      );

      CREATE INDEX IF NOT EXISTS idx_context_revisions_context_id ON context_revisions(context_id);
      CREATE INDEX IF NOT EXISTS idx_context_revisions_lookup ON context_revisions(context_id, revision);
    `);

    // 3. Create context_conflicts table
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_conflicts (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL REFERENCES context_documents(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        expected_revision INTEGER,
        actual_revision INTEGER NOT NULL,
        incoming_title TEXT NOT NULL,
        incoming_content TEXT NOT NULL,
        incoming_author TEXT NOT NULL,
        conflict_reason TEXT NOT NULL,
        is_resolved INTEGER NOT NULL DEFAULT 0,
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_context_conflicts_project ON context_conflicts(project_id, is_resolved);
    `);

    // 4. Add context_references_json to tasks table
    db.exec(`
      ALTER TABLE tasks ADD COLUMN context_references_json TEXT;
    `);
  },
};
