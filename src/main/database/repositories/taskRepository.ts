import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '../../../shared/types.js';
import type { TaskRecord } from '../types.js';

export class TaskRepository {
  constructor(private db: DatabaseSync) {}

  private mapRow(row: TaskRecord): Task {
    let payload: Record<string, unknown> | null = null;
    if (row.payload_json) {
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        payload = null;
      }
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      title: row.title,
      description: row.description,
      createdBy: row.created_by,
      assignedTo: row.assigned_to,
      status: row.status,
      approvalStatus: row.approval_status,
      payload,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  public create(data: CreateTaskInput): Task {
    if (!data.sessionId) {
      throw new Error('Task must belong to a session.');
    }
    const trimmedTitle = data.title ? data.title.trim() : '';
    if (!trimmedTitle) {
      throw new Error('Task title cannot be empty.');
    }

    // Verify session exists
    const sessionExists = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(data.sessionId);
    if (!sessionExists) {
      throw new Error(`Session not found with id: ${data.sessionId}`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const status: TaskStatus = data.status || 'queued';
    const startedAt = status === 'running' ? now : null;
    const completedAt = ['succeeded', 'failed', 'cancelled'].includes(status) ? now : null;
    const payloadJson = data.payload ? JSON.stringify(data.payload) : null;

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, session_id, title, description, created_by, assigned_to, status, approval_status, payload_json,
        created_at, updated_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.sessionId,
      trimmedTitle,
      data.description || null,
      data.createdBy || null,
      data.assignedTo || null,
      status,
      data.approvalStatus || null,
      payloadJson,
      now,
      now,
      startedAt,
      completedAt
    );

    return {
      id,
      sessionId: data.sessionId,
      title: trimmedTitle,
      description: data.description || null,
      createdBy: data.createdBy || null,
      assignedTo: data.assignedTo || null,
      status,
      approvalStatus: data.approvalStatus || null,
      payload: data.payload || null,
      createdAt: now,
      updatedAt: now,
      startedAt,
      completedAt,
    };
  }

  public get(id: string): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as unknown as TaskRecord | undefined;
    return row ? this.mapRow(row) : null;
  }

  public listBySession(sessionId: string, statusFilter?: TaskStatus): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE session_id = ? AND (? OR status = ?)
      ORDER BY created_at DESC
    `);

    const rows = (stmt.all(sessionId, statusFilter ? 0 : 1, statusFilter || '') as unknown) as TaskRecord[];
    return rows.map((r) => this.mapRow(r));
  }

  public updateStatus(id: string, status: TaskStatus): Task {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Task not found with id: ${id}`);
    }

    const now = new Date().toISOString();
    let startedAt = existing.startedAt;
    let completedAt = existing.completedAt;

    if (status === 'running' && !startedAt) {
      startedAt = now;
    } else if (['succeeded', 'failed', 'cancelled'].includes(status) && !completedAt) {
      completedAt = now;
    }

    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?, started_at = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(status, startedAt, completedAt, now, id);

    return {
      ...existing,
      status,
      startedAt,
      completedAt,
      updatedAt: now,
    };
  }

  public update(id: string, data: UpdateTaskInput): Task {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Task not found with id: ${id}`);
    }

    const title = data.title !== undefined ? data.title.trim() : existing.title;
    if (!title) {
      throw new Error('Task title cannot be empty.');
    }

    const description = data.description !== undefined ? data.description : existing.description;
    const assignedTo = data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo;
    const status = data.status !== undefined ? data.status : existing.status;
    const approvalStatus = data.approvalStatus !== undefined ? data.approvalStatus : existing.approvalStatus;
    const payload = data.payload !== undefined ? data.payload : existing.payload;
    const payloadJson = payload ? JSON.stringify(payload) : null;

    const now = new Date().toISOString();
    let startedAt = existing.startedAt;
    let completedAt = existing.completedAt;

    if (status === 'running' && !startedAt) {
      startedAt = now;
    } else if (['succeeded', 'failed', 'cancelled'].includes(status) && !completedAt) {
      completedAt = now;
    }

    const stmt = this.db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, assigned_to = ?, status = ?, approval_status = ?, payload_json = ?,
          started_at = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(title, description, assignedTo, status, approvalStatus, payloadJson, startedAt, completedAt, now, id);

    return {
      ...existing,
      title,
      description,
      assignedTo,
      status,
      approvalStatus,
      payload,
      startedAt,
      completedAt,
      updatedAt: now,
    };
  }
}
