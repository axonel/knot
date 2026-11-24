import type { DatabaseSync } from 'node:sqlite';

export const migration002 = {
  version: 2,
  name: '002-agent-sessions',
  up: (db: DatabaseSync): void => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        agent_type TEXT NOT NULL,
        cli_conversation_id TEXT NULL,
        working_directory TEXT NOT NULL,
        status TEXT NOT NULL,
        execution_mode TEXT NOT NULL,
        model TEXT NULL,
        effort TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_started_at TEXT NULL,
        last_exit_code INTEGER NULL,
        metadata_json TEXT NULL,
        UNIQUE (session_id, agent_type)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_session_id ON agent_sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_cli_conv_id ON agent_sessions(cli_conversation_id);
    `);
  },
};
