import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { EventItem, AppendEventInput, EventFilterOptions } from '../../../shared/types.js';
import type { EventRecord } from '../types.js';

export class EventRepository {
  constructor(private db: DatabaseSync) {}

  private mapRow(row: EventRecord): EventItem {
    let data: Record<string, unknown> | null = null;
    if (row.data_json) {
      try {
        data = JSON.parse(row.data_json);
      } catch {
        data = null;
      }
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      taskId: row.task_id,
      eventType: row.event_type,
      actor: row.actor,
      data,
      createdAt: row.created_at,
    };
  }

  public append(data: AppendEventInput): EventItem {
    if (!data.sessionId) {
      throw new Error('Event must belong to a session.');
    }
    if (!data.eventType || !data.eventType.trim()) {
      throw new Error('Event type cannot be empty.');
    }
    if (!data.actor || !data.actor.trim()) {
      throw new Error('Event actor cannot be empty.');
    }

    // Verify session exists
    const sessionExists = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(data.sessionId);
    if (!sessionExists) {
      throw new Error(`Session not found with id: ${data.sessionId}`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const dataJson = data.data ? JSON.stringify(data.data) : null;

    const stmt = this.db.prepare(`
      INSERT INTO events (id, session_id, task_id, event_type, actor, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, data.sessionId, data.taskId || null, data.eventType.trim(), data.actor.trim(), dataJson, now);

    return {
      id,
      sessionId: data.sessionId,
      taskId: data.taskId || null,
      eventType: data.eventType.trim(),
      actor: data.actor.trim(),
      data: data.data || null,
      createdAt: now,
    };
  }

  public listBySession(sessionId: string, options: EventFilterOptions = {}): EventItem[] {
    const limit = options.limit !== undefined ? Math.max(1, options.limit) : 100;
    const offset = options.offset !== undefined ? Math.max(0, options.offset) : 0;

    let query = 'SELECT * FROM events WHERE session_id = ?';
    const params: (string | number)[] = [sessionId];

    if (options.taskId) {
      query += ' AND task_id = ?';
      params.push(options.taskId);
    }

    if (options.eventType) {
      query += ' AND event_type = ?';
      params.push(options.eventType);
    }

    query += ' ORDER BY created_at ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = (stmt.all(...(params as [string, ...number[]])) as unknown) as EventRecord[];
    return rows.map((r) => this.mapRow(r));
  }
}
