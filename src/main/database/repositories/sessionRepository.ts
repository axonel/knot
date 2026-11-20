import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Session, SessionStatus, CreateSessionInput } from '../../../shared/types.js';
import type { SessionRecord } from '../types.js';

export class SessionRepository {
  constructor(private db: DatabaseSync) {}

  private mapRow(row: SessionRecord): Session {
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
      projectId: row.project_id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      metadata,
    };
  }

  public create(data: CreateSessionInput): Session {
    const trimmedTitle = data.title ? data.title.trim() : '';
    if (!trimmedTitle) {
      throw new Error('Session title cannot be empty.');
    }

    // Verify parent project exists
    const projectCheck = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(data.projectId);
    if (!projectCheck) {
      throw new Error(`Project not found with id: ${data.projectId}`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, project_id, title, status, created_at, updated_at, last_activity_at, started_at, ended_at, metadata_json
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, NULL, ?)
    `);

    stmt.run(id, data.projectId, trimmedTitle, now, now, now, now, metadataJson);

    // Bump parent project's updated_at
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, data.projectId);

    return {
      id,
      projectId: data.projectId,
      title: trimmedTitle,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      startedAt: now,
      endedAt: null,
      metadata: data.metadata || null,
    };
  }

  public get(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as unknown as SessionRecord | undefined;
    return row ? this.mapRow(row) : null;
  }

  public listByProject(projectId: string, includeArchived = false): Session[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE project_id = ? AND (? OR status != 'archived')
      ORDER BY last_activity_at DESC
    `);

    const rows = (stmt.all(projectId, includeArchived ? 1 : 0) as unknown) as SessionRecord[];
    return rows.map((r) => this.mapRow(r));
  }

  public updateTitle(id: string, title: string): Session {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Session not found with id: ${id}`);
    }

    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error('Session title cannot be empty.');
    }

    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(trimmed, now, id);

    return {
      ...existing,
      title: trimmed,
      updatedAt: now,
    };
  }

  public updateStatus(id: string, newStatus: SessionStatus): Session {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Session not found with id: ${id}`);
    }

    if (existing.status === newStatus) {
      return existing;
    }

    // Validate transition
    const allowedTransitions: Record<SessionStatus, SessionStatus[]> = {
      active: ['paused', 'completed', 'archived'],
      paused: ['active', 'completed', 'archived'],
      completed: ['active', 'archived'],
      archived: ['active'],
    };

    if (!allowedTransitions[existing.status]?.includes(newStatus)) {
      throw new Error(`Invalid session status transition from '${existing.status}' to '${newStatus}'.`);
    }

    const now = new Date().toISOString();
    let endedAt = existing.endedAt;
    let startedAt = existing.startedAt;

    if (newStatus === 'completed' && !endedAt) {
      endedAt = now;
    } else if (newStatus === 'active') {
      if (!startedAt) startedAt = now;
      endedAt = null; // Reopened session
    }

    this.db.prepare(`
      UPDATE sessions
      SET status = ?, started_at = ?, ended_at = ?, updated_at = ?, last_activity_at = ?
      WHERE id = ?
    `).run(newStatus, startedAt, endedAt, now, now, id);

    // Update parent project activity
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, existing.projectId);

    return {
      ...existing,
      status: newStatus,
      startedAt,
      endedAt,
      updatedAt: now,
      lastActivityAt: now,
    };
  }

  public updateActivity(id: string): void {
    const existing = this.get(id);
    if (!existing) return;

    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET last_activity_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, existing.projectId);
  }
}
