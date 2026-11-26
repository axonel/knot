import type { DatabaseSync } from 'node:sqlite';

export const migration006 = {
  version: 6,
  name: '006-unified-timeline',
  up: (db: DatabaseSync): void => {
    // 1. Create modernized events table
    db.exec(`
      CREATE TABLE IF NOT EXISTS events_v2 (
        id TEXT PRIMARY KEY,
        project_id TEXT NULL REFERENCES projects(id) ON DELETE CASCADE,
        session_id TEXT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        task_id TEXT NULL REFERENCES tasks(id) ON DELETE SET NULL,
        correlation_id TEXT NULL,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'orchestration_runtime',
        provenance TEXT NOT NULL DEFAULT 'knot_observed',
        title TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL DEFAULT 'info',
        data_json TEXT NULL,
        event_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 2. Check if old events table exists and migrate data
    const oldTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
      .get() as { name: string } | undefined;

    if (oldTableExists) {
      db.exec(`
        INSERT INTO events_v2 (
          id, project_id, session_id, task_id, correlation_id, event_type, actor,
          source, provenance, title, severity, data_json, event_timestamp, created_at
        )
        SELECT
          e.id,
          s.project_id,
          e.session_id,
          e.task_id,
          COALESCE(e.task_id, e.session_id, e.id),
          e.event_type,
          e.actor,
          CASE
            WHEN e.actor = 'chatgpt' THEN 'bridge'
            WHEN e.actor = 'antigravity' THEN 'antigravity_cli'
            WHEN e.actor = 'user' THEN 'user_ui'
            WHEN e.actor = 'git' THEN 'local_git'
            ELSE 'orchestration_runtime'
          END,
          CASE
            WHEN e.actor = 'chatgpt' THEN 'chatgpt_reported'
            WHEN e.actor = 'antigravity' THEN 'antigravity_reported'
            WHEN e.actor = 'user' THEN 'user_recorded'
            WHEN e.actor = 'git' THEN 'git_verified'
            ELSE 'knot_observed'
          END,
          REPLACE(e.event_type, '_', ' '),
          CASE
            WHEN e.event_type LIKE '%failed%' OR e.event_type LIKE '%denied%' OR e.event_type LIKE '%error%' THEN 'error'
            WHEN e.event_type LIKE '%warning%' OR e.event_type LIKE '%conflict%' OR e.event_type LIKE '%interrupted%' THEN 'warning'
            WHEN e.event_type LIKE '%completed%' OR e.event_type LIKE '%succeeded%' OR e.event_type LIKE '%approved%' THEN 'success'
            ELSE 'info'
          END,
          e.data_json,
          e.created_at,
          e.created_at
        FROM events e
        LEFT JOIN sessions s ON s.id = e.session_id;

        DROP TABLE events;
      `);
    }

    // 3. Rename events_v2 to events
    db.exec(`ALTER TABLE events_v2 RENAME TO events;`);

    // 4. Create performance indexes for timeline and trace queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_project_id_ts ON events(project_id, event_timestamp ASC);
      CREATE INDEX IF NOT EXISTS idx_events_session_id_ts ON events(session_id, event_timestamp ASC);
      CREATE INDEX IF NOT EXISTS idx_events_task_id_ts ON events(task_id, event_timestamp ASC);
      CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor);
      CREATE INDEX IF NOT EXISTS idx_events_provenance ON events(provenance);
      CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
    `);
  },
};
