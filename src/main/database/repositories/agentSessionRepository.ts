import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { AgentSession, UpsertAgentSessionInput } from '../../../shared/types.js';
import type { AgentSessionRecord } from '../types.js';

export class AgentSessionRepository {
  constructor(private db: DatabaseSync) {}

  private mapRow(row: AgentSessionRecord): AgentSession {
    let metadata: Record<string, unknown> | null = null;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json);
      } catch {
        metadata = null;
      }
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      agentType: row.agent_type,
      cliConversationId: row.cli_conversation_id,
      workingDirectory: row.working_directory,
      status: row.status,
      executionMode: row.execution_mode,
      model: row.model,
      effort: row.effort,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastStartedAt: row.last_started_at,
      lastExitCode: row.last_exit_code,
      metadata,
    };
  }

  public getBySession(sessionId: string, agentType = 'antigravity'): AgentSession | null {
    const row = this.db
      .prepare('SELECT * FROM agent_sessions WHERE session_id = ? AND agent_type = ?')
      .get(sessionId, agentType) as unknown as AgentSessionRecord | undefined;

    return row ? this.mapRow(row) : null;
  }

  public getById(id: string): AgentSession | null {
    const row = this.db
      .prepare('SELECT * FROM agent_sessions WHERE id = ?')
      .get(id) as unknown as AgentSessionRecord | undefined;

    return row ? this.mapRow(row) : null;
  }

  public list(sessionId: string): AgentSession[] {
    const rows = (this.db
      .prepare('SELECT * FROM agent_sessions WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as unknown) as AgentSessionRecord[];

    return rows.map((r) => this.mapRow(r));
  }

  public upsert(data: UpsertAgentSessionInput): AgentSession {
    const existing = this.getBySession(data.sessionId, data.agentType);
    const now = new Date().toISOString();
    const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

    if (existing) {
      const updatedStatus = data.status || existing.status;
      const updatedMode = data.executionMode || existing.executionMode;
      const updatedConvId =
        data.cliConversationId !== undefined ? data.cliConversationId : existing.cliConversationId;
      const updatedModel = data.model !== undefined ? data.model : existing.model;
      const updatedEffort = data.effort !== undefined ? data.effort : existing.effort;
      const updatedStarted =
        data.lastStartedAt !== undefined ? data.lastStartedAt : existing.lastStartedAt;
      const updatedExitCode =
        data.lastExitCode !== undefined ? data.lastExitCode : existing.lastExitCode;
      const updatedMetadata =
        metadataJson !== null ? metadataJson : existing.metadata ? JSON.stringify(existing.metadata) : null;

      const stmt = this.db.prepare(`
        UPDATE agent_sessions
        SET working_directory = ?,
            status = ?,
            execution_mode = ?,
            cli_conversation_id = ?,
            model = ?,
            effort = ?,
            last_started_at = ?,
            last_exit_code = ?,
            metadata_json = ?,
            updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        data.workingDirectory,
        updatedStatus,
        updatedMode,
        updatedConvId,
        updatedModel,
        updatedEffort,
        updatedStarted,
        updatedExitCode,
        updatedMetadata,
        now,
        existing.id
      );

      return this.getById(existing.id)!;
    }

    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO agent_sessions (
        id, session_id, agent_type, cli_conversation_id, working_directory,
        status, execution_mode, model, effort, created_at, updated_at,
        last_started_at, last_exit_code, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.sessionId,
      data.agentType,
      data.cliConversationId || null,
      data.workingDirectory,
      data.status || 'stopped',
      data.executionMode || 'default',
      data.model || null,
      data.effort || null,
      now,
      now,
      data.lastStartedAt || null,
      data.lastExitCode ?? null,
      metadataJson
    );

    return this.getById(id)!;
  }

  public updateStatus(id: string, status: string, lastExitCode: number | null = null): AgentSession {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE agent_sessions
      SET status = ?, last_exit_code = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(status, lastExitCode, now, id);
    const updated = this.getById(id);
    if (!updated) {
      throw new Error(`Agent session not found: ${id}`);
    }
    return updated;
  }

  public updateStatusBySession(sessionId: string, agentType: string, status: string, lastExitCode: number | null = null): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE agent_sessions
      SET status = ?, last_exit_code = ?, updated_at = ?
      WHERE session_id = ? AND agent_type = ?
    `).run(status, lastExitCode, now, sessionId, agentType);
  }

  public updateConversationId(id: string, cliConversationId: string): AgentSession {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE agent_sessions
      SET cli_conversation_id = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(cliConversationId, now, id);
    const updated = this.getById(id);
    if (!updated) {
      throw new Error(`Agent session not found: ${id}`);
    }
    return updated;
  }

  public updateConversationIdBySession(sessionId: string, agentType: string, cliConversationId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE agent_sessions
      SET cli_conversation_id = ?, updated_at = ?
      WHERE session_id = ? AND agent_type = ?
    `).run(cliConversationId, now, sessionId, agentType);
  }
}
