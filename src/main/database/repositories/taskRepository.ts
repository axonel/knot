import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Task, TaskStatus, CreateTaskInput, UpdateTaskInput, TaskGitBoundary, TaskContextReference } from '../../../shared/types.js';
import { assertLegalTaskTransition } from '../../../shared/taskStateModel.js';
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

    let acceptanceCriteria: string[] | null = null;
    if (row.acceptance_criteria_json) {
      try {
        acceptanceCriteria = JSON.parse(row.acceptance_criteria_json);
      } catch {
        acceptanceCriteria = null;
      }
    }

    let gitBoundary: TaskGitBoundary | null = null;
    if (row.git_boundary_json) {
      try {
        gitBoundary = JSON.parse(row.git_boundary_json);
      } catch {
        gitBoundary = null;
      }
    }

    let contextReferences: TaskContextReference[] | null = null;
    if (row.context_references_json) {
      try {
        contextReferences = JSON.parse(row.context_references_json);
      } catch {
        contextReferences = null;
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
      sourceMessageId: row.source_message_id || null,
      resultMessageId: row.result_message_id || null,
      dispatchedAt: row.dispatched_at || null,
      failureReason: row.failure_reason || null,
      priority: row.priority || 'normal',
      executionMode: row.execution_mode || 'default',
      acceptanceCriteria,
      retryCount: row.retry_count ?? 0,
      payload,
      gitBoundary,
      contextReferences,
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
    const acceptanceCriteriaJson = data.acceptanceCriteria ? JSON.stringify(data.acceptanceCriteria) : null;

    const gitBoundaryJson = data.gitBoundary ? JSON.stringify(data.gitBoundary) : null;
    const contextReferencesJson = data.contextReferences ? JSON.stringify(data.contextReferences) : null;

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, session_id, title, description, created_by, assigned_to, status, approval_status, payload_json,
        source_message_id, result_message_id, dispatched_at, failure_reason, priority, execution_mode,
        acceptance_criteria_json, retry_count, git_boundary_json, context_references_json,
        created_at, updated_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.sourceMessageId || null,
      data.resultMessageId || null,
      data.dispatchedAt || null,
      data.failureReason || null,
      data.priority || 'normal',
      data.executionMode || 'default',
      acceptanceCriteriaJson,
      data.retryCount ?? 0,
      gitBoundaryJson,
      contextReferencesJson,
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
      sourceMessageId: data.sourceMessageId || null,
      resultMessageId: data.resultMessageId || null,
      dispatchedAt: data.dispatchedAt || null,
      failureReason: data.failureReason || null,
      priority: data.priority || 'normal',
      executionMode: data.executionMode || 'default',
      acceptanceCriteria: data.acceptanceCriteria || null,
      retryCount: data.retryCount ?? 0,
      payload: data.payload || null,
      gitBoundary: data.gitBoundary || null,
      contextReferences: data.contextReferences || null,
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

  public getBySourceMessageId(sourceMessageId: string): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE source_message_id = ?');
    const row = stmt.get(sourceMessageId) as unknown as TaskRecord | undefined;
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

  public listQueued(sessionId?: string): Task[] {
    const query = `
      SELECT * FROM tasks
      WHERE status IN ('queued', 'awaiting_approval', 'approved')
      ${sessionId ? 'AND session_id = ?' : ''}
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END ASC,
        created_at ASC
    `;

    const stmt = this.db.prepare(query);
    const rows = (sessionId ? stmt.all(sessionId) : stmt.all()) as unknown as TaskRecord[];
    return rows.map((r) => this.mapRow(r));
  }

  public listRunning(sessionId?: string): Task[] {
    const query = `
      SELECT * FROM tasks
      WHERE status = 'running'
      ${sessionId ? 'AND session_id = ?' : ''}
      ORDER BY dispatched_at ASC
    `;

    const stmt = this.db.prepare(query);
    const rows = (sessionId ? stmt.all(sessionId) : stmt.all()) as unknown as TaskRecord[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Atomically claims the next executable task for a session using compare-and-swap.
   * Guarantees that at most one worker can claim and transition the task to 'running'.
   * Enforces:
   * 1. Session must not already have a task in 'running' state.
   * 2. Candidate task must be in 'queued' status with approval_status = 'approved'.
   * 3. Highest priority first (urgent > high > normal > low), then FIFO by created_at.
   */
  public claimNextExecutable(sessionId: string): Task | null {
    // Check if session already has a running task
    const running = this.db.prepare("SELECT id FROM tasks WHERE session_id = ? AND status = 'running'").get(sessionId);
    if (running) {
      return null;
    }

    // Find next candidate in deterministic priority order
    const candidateQuery = `
      SELECT id FROM tasks
      WHERE session_id = ? AND status = 'queued' AND approval_status = 'approved'
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END ASC,
        created_at ASC
      LIMIT 1
    `;
    const candidate = this.db.prepare(candidateQuery).get(sessionId) as { id: string } | undefined;
    if (!candidate) {
      return null;
    }

    // Atomic compare-and-swap claim
    const now = new Date().toISOString();
    const claimStmt = this.db.prepare(`
      UPDATE tasks
      SET status = 'running', dispatched_at = ?, started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ? AND status = 'queued' AND approval_status = 'approved'
    `);
    const info = claimStmt.run(now, now, now, candidate.id);
    if (info.changes === 0) {
      // Lost race to another worker
      return null;
    }

    return this.get(candidate.id);
  }

  public updateStatus(id: string, status: TaskStatus): Task {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Task not found with id: ${id}`);
    }

    if (status !== existing.status) {
      assertLegalTaskTransition(id, existing.status, status);
    }

    const now = new Date().toISOString();
    let startedAt = existing.startedAt;
    let completedAt = existing.completedAt;

    if (status === 'running' && !startedAt) {
      startedAt = now;
    } else if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(status) && !completedAt) {
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

  public updateExecution(
    id: string,
    updates: {
      status?: TaskStatus;
      dispatchedAt?: string | null;
      completedAt?: string | null;
      failureReason?: string | null;
      resultMessageId?: string | null;
      retryCount?: number;
      approvalStatus?: string | null;
      gitBoundary?: TaskGitBoundary | null;
    }
  ): Task {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Task not found with id: ${id}`);
    }

    const status = updates.status !== undefined ? updates.status : existing.status;
    if (updates.status !== undefined && updates.status !== existing.status) {
      assertLegalTaskTransition(id, existing.status, updates.status);
    }

    const now = new Date().toISOString();
    let startedAt = existing.startedAt;
    let completedAt = updates.completedAt !== undefined ? updates.completedAt : existing.completedAt;

    if (status === 'running' && !startedAt) {
      startedAt = now;
    } else if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(status) && !completedAt) {
      completedAt = now;
    }

    const dispatchedAt = updates.dispatchedAt !== undefined ? updates.dispatchedAt : existing.dispatchedAt;
    const failureReason = updates.failureReason !== undefined ? updates.failureReason : existing.failureReason;
    const resultMessageId = updates.resultMessageId !== undefined ? updates.resultMessageId : existing.resultMessageId;
    const retryCount = updates.retryCount !== undefined ? updates.retryCount : (existing.retryCount ?? 0);
    const approvalStatus = updates.approvalStatus !== undefined ? updates.approvalStatus : existing.approvalStatus;
    const gitBoundary = updates.gitBoundary !== undefined ? updates.gitBoundary : existing.gitBoundary;
    const gitBoundaryJson = gitBoundary ? JSON.stringify(gitBoundary) : null;

    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?, approval_status = ?, started_at = ?, completed_at = ?, dispatched_at = ?,
          failure_reason = ?, result_message_id = ?, retry_count = ?, git_boundary_json = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      status,
      approvalStatus ?? null,
      startedAt ?? null,
      completedAt ?? null,
      dispatchedAt ?? null,
      failureReason ?? null,
      resultMessageId ?? null,
      retryCount,
      gitBoundaryJson,
      now,
      id
    );

    return {
      ...existing,
      status,
      approvalStatus,
      startedAt,
      completedAt,
      dispatchedAt,
      failureReason,
      resultMessageId,
      retryCount,
      gitBoundary,
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
    if (data.status !== undefined && data.status !== existing.status) {
      assertLegalTaskTransition(id, existing.status, data.status);
    }
    const approvalStatus = data.approvalStatus !== undefined ? data.approvalStatus : existing.approvalStatus;
    const payload = data.payload !== undefined ? data.payload : existing.payload;
    const payloadJson = payload ? JSON.stringify(payload) : null;
    const sourceMessageId = data.sourceMessageId !== undefined ? data.sourceMessageId : existing.sourceMessageId;
    const resultMessageId = data.resultMessageId !== undefined ? data.resultMessageId : existing.resultMessageId;
    const dispatchedAt = data.dispatchedAt !== undefined ? data.dispatchedAt : existing.dispatchedAt;
    const failureReason = data.failureReason !== undefined ? data.failureReason : existing.failureReason;
    const priority = data.priority !== undefined ? data.priority : existing.priority;
    const executionMode = data.executionMode !== undefined ? data.executionMode : existing.executionMode;
    const acceptanceCriteria = data.acceptanceCriteria !== undefined ? data.acceptanceCriteria : existing.acceptanceCriteria;
    const acceptanceCriteriaJson = acceptanceCriteria ? JSON.stringify(acceptanceCriteria) : null;
    const retryCount = data.retryCount !== undefined ? data.retryCount : (existing.retryCount ?? 0);
    const gitBoundary = data.gitBoundary !== undefined ? data.gitBoundary : existing.gitBoundary;
    const gitBoundaryJson = gitBoundary ? JSON.stringify(gitBoundary) : null;
    const contextReferences = data.contextReferences !== undefined ? data.contextReferences : existing.contextReferences;
    const contextReferencesJson = contextReferences ? JSON.stringify(contextReferences) : null;

    const now = new Date().toISOString();
    let startedAt = existing.startedAt;
    let completedAt = existing.completedAt;

    if (status === 'running' && !startedAt) {
      startedAt = now;
    } else if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(status) && !completedAt) {
      completedAt = now;
    }

    const stmt = this.db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, assigned_to = ?, status = ?, approval_status = ?, payload_json = ?,
          source_message_id = ?, result_message_id = ?, dispatched_at = ?, failure_reason = ?,
          priority = ?, execution_mode = ?, acceptance_criteria_json = ?, retry_count = ?,
          git_boundary_json = ?, context_references_json = ?, started_at = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      title,
      description ?? null,
      assignedTo ?? null,
      status,
      approvalStatus ?? null,
      payloadJson ?? null,
      sourceMessageId ?? null,
      resultMessageId ?? null,
      dispatchedAt ?? null,
      failureReason ?? null,
      priority ?? 'normal',
      executionMode ?? 'default',
      acceptanceCriteriaJson ?? null,
      retryCount,
      gitBoundaryJson,
      contextReferencesJson,
      startedAt ?? null,
      completedAt ?? null,
      now,
      id
    );

    return {
      ...existing,
      title,
      description,
      assignedTo,
      status,
      approvalStatus,
      payload,
      sourceMessageId,
      resultMessageId,
      dispatchedAt,
      failureReason,
      priority,
      executionMode,
      acceptanceCriteria,
      retryCount,
      gitBoundary,
      contextReferences,
      startedAt,
      completedAt,
      updatedAt: now,
    };
  }
}
