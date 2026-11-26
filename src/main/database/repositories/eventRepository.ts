import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  EventItem,
  AppendEventInput,
  EventFilterOptions,
  TaskExecutionTrace,
  TaskTraceStage,
  TaskTraceStageName,
  Task,
  EventActor,
  EventProvenance,
  EventSource,
  EventSeverity,
} from '../../../shared/types.js';
import type { EventRecord, TaskRecord } from '../types.js';
import { sanitizeLogOutput, sanitizeObject } from '../../logSanitizer.js';

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
      projectId: row.project_id || null,
      sessionId: row.session_id || null,
      taskId: row.task_id || null,
      correlationId: row.correlation_id || null,
      eventType: row.event_type,
      actor: (row.actor as EventActor) || row.actor,
      source: (row.source as EventSource) || row.source,
      provenance: (row.provenance as EventProvenance) || row.provenance,
      title: row.title || this.formatTitleFromEventType(row.event_type),
      severity: (row.severity as EventSeverity) || 'info',
      data,
      timestamp: row.event_timestamp || row.created_at,
      createdAt: row.created_at,
    };
  }

  private formatTitleFromEventType(eventType: string): string {
    return eventType
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private resolveSeverity(eventType: string, fallback?: EventSeverity): EventSeverity {
    if (fallback) return fallback;
    const lower = eventType.toLowerCase();
    if (lower.includes('fail') || lower.includes('denied') || lower.includes('error')) {
      return 'error';
    }
    if (
      lower.includes('warning') ||
      lower.includes('conflict') ||
      lower.includes('interrupted') ||
      lower.includes('approval_requested') ||
      lower.includes('cancelled')
    ) {
      return 'warning';
    }
    if (
      lower.includes('complete') ||
      lower.includes('succeed') ||
      lower.includes('approved') ||
      lower.includes('verified')
    ) {
      return 'success';
    }
    return 'info';
  }

  private resolveSource(actor: string, fallback?: EventSource | string): EventSource | string {
    if (fallback) return fallback;
    switch (actor.toLowerCase()) {
      case 'chatgpt':
        return 'bridge';
      case 'antigravity':
        return 'antigravity_cli';
      case 'user':
        return 'user_ui';
      case 'git':
        return 'local_git';
      case 'knot':
      case 'system':
      default:
        return 'orchestration_runtime';
    }
  }

  private resolveProvenance(actor: string, fallback?: EventProvenance | string): EventProvenance | string {
    if (fallback) return fallback;
    switch (actor.toLowerCase()) {
      case 'chatgpt':
        return 'chatgpt_reported';
      case 'antigravity':
        return 'antigravity_reported';
      case 'user':
        return 'user_recorded';
      case 'git':
        return 'git_verified';
      case 'knot':
      case 'system':
      default:
        return 'knot_observed';
    }
  }

  public append(data: AppendEventInput): EventItem {
    if (!data.eventType || !data.eventType.trim()) {
      throw new Error('Event type cannot be empty.');
    }
    if (!data.actor || !data.actor.trim()) {
      throw new Error('Event actor cannot be empty.');
    }

    const eventId = data.id || randomUUID();

    // Idempotent insertion check: if ID already exists, return existing event
    const existing = this.get(eventId);
    if (existing) {
      return existing;
    }

    // Verify session exists if sessionId provided
    let projectId = data.projectId || null;
    if (data.sessionId) {
      const sessionRow = this.db
        .prepare('SELECT id, project_id FROM sessions WHERE id = ?')
        .get(data.sessionId) as { id: string; project_id: string } | undefined;

      if (!sessionRow) {
        throw new Error(`Session not found with id: ${data.sessionId}`);
      }
      if (!projectId) {
        projectId = sessionRow.project_id;
      }
    } else if (data.taskId && !projectId) {
      const taskRow = this.db
        .prepare(`
          SELECT s.project_id
          FROM tasks t
          JOIN sessions s ON s.id = t.session_id
          WHERE t.id = ?
        `)
        .get(data.taskId) as { project_id: string } | undefined;

      if (taskRow) {
        projectId = taskRow.project_id;
      }
    }

    const now = new Date().toISOString();
    const eventTimestamp = data.timestamp || now;
    const actor = data.actor.trim();
    const eventType = data.eventType.trim();
    const source = this.resolveSource(actor, data.source);
    const provenance = this.resolveProvenance(actor, data.provenance);
    const rawTitle = data.title?.trim() || this.formatTitleFromEventType(eventType);
    const title = sanitizeLogOutput(rawTitle);
    const severity = this.resolveSeverity(eventType, data.severity);
    const correlationId = data.correlationId || data.taskId || data.sessionId || eventId;
    const sanitizedData = data.data ? sanitizeObject(data.data as Record<string, unknown>) : null;
    const dataJson = sanitizedData ? JSON.stringify(sanitizedData) : null;

    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, project_id, session_id, task_id, correlation_id,
        event_type, actor, source, provenance, title, severity,
        data_json, event_timestamp, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);

    const info = stmt.run(
      eventId,
      projectId,
      data.sessionId || null,
      data.taskId || null,
      correlationId,
      eventType,
      actor,
      source,
      provenance,
      title,
      severity,
      dataJson,
      eventTimestamp,
      now
    );

    if (info.changes === 0) {
      // Event already inserted concurrently with this ID
      const existingConflict = this.get(eventId);
      if (existingConflict) {
        return existingConflict;
      }
    }

    return {
      id: eventId,
      projectId,
      sessionId: data.sessionId || null,
      taskId: data.taskId || null,
      correlationId,
      eventType,
      actor,
      source,
      provenance,
      title,
      severity,
      data: data.data || null,
      timestamp: eventTimestamp,
      createdAt: now,
    };
  }

  public get(id: string): EventItem | null {
    const stmt = this.db.prepare('SELECT * FROM events WHERE id = ?');
    const row = stmt.get(id) as unknown as EventRecord | undefined;
    return row ? this.mapRow(row) : null;
  }

  public list(options: EventFilterOptions = {}): EventItem[] {
    const limit = options.limit !== undefined ? Math.max(1, options.limit) : 100;
    const offset = options.offset !== undefined ? Math.max(0, options.offset) : 0;
    const order = options.order === 'DESC' ? 'DESC' : 'ASC';

    let query = 'SELECT * FROM events WHERE 1=1';
    const params: (string | number)[] = [];

    if (options.projectId) {
      query += ' AND project_id = ?';
      params.push(options.projectId);
    }

    if (options.sessionId) {
      query += ' AND session_id = ?';
      params.push(options.sessionId);
    }

    if (options.taskId) {
      query += ' AND (task_id = ? OR correlation_id = ?)';
      params.push(options.taskId, options.taskId);
    }

    if (options.correlationId) {
      query += ' AND correlation_id = ?';
      params.push(options.correlationId);
    }

    if (options.actor) {
      query += ' AND actor = ?';
      params.push(options.actor);
    }

    if (options.provenance) {
      query += ' AND provenance = ?';
      params.push(options.provenance);
    }

    if (options.source) {
      query += ' AND source = ?';
      params.push(options.source);
    }

    if (options.severity) {
      query += ' AND severity = ?';
      params.push(options.severity);
    }

    if (options.eventType) {
      if (Array.isArray(options.eventType)) {
        if (options.eventType.length > 0) {
          const placeholders = options.eventType.map(() => '?').join(', ');
          query += ` AND event_type IN (${placeholders})`;
          params.push(...options.eventType);
        }
      } else {
        query += ' AND event_type = ?';
        params.push(options.eventType);
      }
    }

    if (options.fromTimestamp) {
      query += ' AND event_timestamp >= ?';
      params.push(options.fromTimestamp);
    }

    if (options.toTimestamp) {
      query += ' AND event_timestamp <= ?';
      params.push(options.toTimestamp);
    }

    if (options.searchQuery && options.searchQuery.trim()) {
      const term = `%${options.searchQuery.trim().toLowerCase()}%`;
      query += ' AND (LOWER(title) LIKE ? OR LOWER(event_type) LIKE ? OR LOWER(COALESCE(data_json, "")) LIKE ?)';
      params.push(term, term, term);
    }

    // Deterministic ordering using tie-breakers
    query += ` ORDER BY event_timestamp ${order}, created_at ${order}, id ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = (stmt.all(...params) as unknown) as EventRecord[];
    return rows.map((r) => this.mapRow(r));
  }

  public listBySession(sessionId: string, options: EventFilterOptions = {}): EventItem[] {
    return this.list({ ...options, sessionId });
  }

  public listByProject(projectId: string, options: EventFilterOptions = {}): EventItem[] {
    return this.list({ ...options, projectId });
  }

  public listByTask(taskId: string, options: EventFilterOptions = {}): EventItem[] {
    return this.list({ ...options, taskId });
  }

  public getTaskTrace(taskId: string): TaskExecutionTrace {
    const taskStmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const taskRow = taskStmt.get(taskId) as unknown as TaskRecord | undefined;
    if (!taskRow) {
      throw new Error(`Task not found with id: ${taskId}`);
    }

    // Map task
    const task: Task = {
      id: taskRow.id,
      sessionId: taskRow.session_id,
      title: taskRow.title,
      description: taskRow.description || null,
      createdBy: taskRow.created_by || null,
      assignedTo: taskRow.assigned_to || null,
      status: taskRow.status,
      approvalStatus: (taskRow.approval_status as any) || null,
      sourceMessageId: taskRow.source_message_id || null,
      resultMessageId: taskRow.result_message_id || null,
      dispatchedAt: taskRow.dispatched_at || null,
      failureReason: taskRow.failure_reason || null,
      priority: (taskRow.priority as any) || 'normal',
      executionMode: taskRow.execution_mode || 'default',
      acceptanceCriteria: taskRow.acceptance_criteria_json ? JSON.parse(taskRow.acceptance_criteria_json) : null,
      retryCount: taskRow.retry_count ?? 0,
      payload: taskRow.payload_json ? JSON.parse(taskRow.payload_json) : null,
      gitBoundary: taskRow.git_boundary_json ? JSON.parse(taskRow.git_boundary_json) : null,
      contextReferences: taskRow.context_references_json ? JSON.parse(taskRow.context_references_json) : null,
      createdAt: taskRow.created_at,
      updatedAt: taskRow.updated_at,
      startedAt: taskRow.started_at,
      completedAt: taskRow.completed_at,
    };

    // Retrieve all events for this task (including subsequent verification activities)
    const eventQuery = `
      SELECT * FROM events
      WHERE task_id = ?
         OR correlation_id = ?
         OR (data_json LIKE ? AND (event_type LIKE 'chatgpt_%' OR event_type LIKE '%verification%'))
      ORDER BY event_timestamp ASC, created_at ASC, id ASC
    `;
    const rows = (this.db
      .prepare(eventQuery)
      .all(taskId, taskId, `%"taskId":"${taskId}"%`) as unknown) as EventRecord[];

    const events = rows.map((r) => this.mapRow(r));

    // Group events into 7 distinct lifecycle stages
    const stages: Record<TaskTraceStageName, EventItem[]> = {
      assignment: [],
      queue: [],
      approval: [],
      execution: [],
      git: [],
      completion: [],
      verification: [],
    };

    for (const ev of events) {
      const type = ev.eventType.toLowerCase();
      if (type === 'task_received' || type === 'task_created' || type === 'task_assigned') {
        stages.assignment.push(ev);
      } else if (type === 'task_queued' || type === 'task_retried' || type === 'task_retry_requested') {
        stages.queue.push(ev);
      } else if (
        type.includes('approval') ||
        type === 'task_approved' ||
        type === 'task_rejected'
      ) {
        stages.approval.push(ev);
      } else if (
        type.includes('agent_') ||
        type.includes('tool_') ||
        type === 'task_dispatched' ||
        type.startsWith('antigravity_') &&
          !type.includes('turn_completed') &&
          !type.includes('turn_failed')
      ) {
        stages.execution.push(ev);
      } else if (type.includes('git_') || type.includes('boundary')) {
        stages.git.push(ev);
      } else if (
        type === 'task_completed' ||
        type === 'task_succeeded' ||
        type === 'task_failed' ||
        type === 'task_cancelled' ||
        type === 'task_result_published' ||
        type.includes('turn_completed') ||
        type.includes('turn_failed')
      ) {
        stages.completion.push(ev);
      } else if (
        type === 'chatgpt_verification' ||
        (ev.actor === 'chatgpt' && (ev.data?.category === 'verification' || type.includes('verify')))
      ) {
        stages.verification.push(ev);
      } else {
        // Default based on actor/phase
        if (ev.actor === 'antigravity') {
          stages.execution.push(ev);
        } else if (ev.actor === 'chatgpt') {
          stages.assignment.push(ev);
        } else {
          stages.completion.push(ev);
        }
      }
    }

    const assignedAt = task.createdAt;
    const dispatchedAt = task.dispatchedAt || null;
    const completedAt = task.completedAt || null;

    let queueDurationMs: number | null = null;
    if (assignedAt && dispatchedAt) {
      queueDurationMs = Math.max(0, new Date(dispatchedAt).getTime() - new Date(assignedAt).getTime());
    }

    let executionDurationMs: number | null = null;
    if (dispatchedAt && completedAt) {
      executionDurationMs = Math.max(0, new Date(completedAt).getTime() - new Date(dispatchedAt).getTime());
    }

    let totalDurationMs: number | null = null;
    if (assignedAt && completedAt) {
      totalDurationMs = Math.max(0, new Date(completedAt).getTime() - new Date(assignedAt).getTime());
    }

    const approvalEvents = stages.approval;
    const isApproved =
      task.approvalStatus === 'approved' ||
      approvalEvents.some((e) => e.eventType === 'approval_granted' || e.eventType === 'task_approved');

    const approverEvent =
      approvalEvents.find(
        (e) => (e.eventType === 'approval_granted' || e.eventType === 'task_approved') && Boolean(e.data?.approvedBy)
      ) ||
      approvalEvents.find(
        (e) => e.eventType === 'approval_granted' || e.eventType === 'task_approved'
      );
    const approver = approverEvent
      ? (approverEvent.data?.approvedBy as string) ||
        (approverEvent.data?.actor as string) ||
        approverEvent.actor
      : null;

    const commitEvent = events.find(
      (e) => e.data && (e.data.verifiedCommitHash || e.data.verifiedCommit)
    );
    const verifiedCommit =
      task.gitBoundary?.verifiedCommitHash ||
      (commitEvent?.data?.verifiedCommitHash as string) ||
      (commitEvent?.data?.verifiedCommit as string) ||
      null;
    const hasGitVerification = Boolean(verifiedCommit);

    const verificationEvents = stages.verification;
    const hasChatGptVerification = verificationEvents.length > 0;
    const chatGptVerificationSummary = hasChatGptVerification
      ? String(verificationEvents[0].data?.summary || verificationEvents[0].title)
      : null;

    const formattedStages: TaskTraceStage[] = [
      {
        name: 'assignment',
        label: '1. Task Assignment',
        description: 'ChatGPT formulation, prompt specifications, and context references',
        events: stages.assignment,
        status: stages.assignment.length > 0 ? 'completed' : 'pending',
      },
      {
        name: 'queue',
        label: '2. Task Queue',
        description: 'FIFO priority queue scheduling and session concurrency lock',
        events: stages.queue,
        status: stages.queue.length > 0 ? 'completed' : 'pending',
      },
      {
        name: 'approval',
        label: '3. Safety & Approval',
        description: 'Human approval policy evaluation and gate resolution',
        events: stages.approval,
        status:
          task.approvalStatus === 'rejected'
            ? 'failed'
            : task.approvalStatus === 'approved' || !task.approvalStatus
            ? 'completed'
            : 'active',
      },
      {
        name: 'execution',
        label: '4. Antigravity Execution',
        description: 'Local CLI process turn, NDJSON streaming, and tool actions',
        events: stages.execution,
        status:
          task.status === 'running'
            ? 'active'
            : stages.execution.length > 0
            ? 'completed'
            : 'pending',
      },
      {
        name: 'git',
        label: '5. Git Repository Baseline & Verification',
        description: 'Local repository start baseline, commit hash, and working-tree state',
        events: stages.git,
        status: stages.git.length > 0 ? 'completed' : 'skipped',
      },
      {
        name: 'completion',
        label: '6. Result Publication & Completion',
        description: 'Structured outbox publication, status transition, and metrics capture',
        events: stages.completion,
        status:
          task.status === 'succeeded'
            ? 'completed'
            : task.status === 'failed'
            ? 'failed'
            : task.status === 'cancelled'
            ? 'failed'
            : 'pending',
      },
      {
        name: 'verification',
        label: '7. ChatGPT Verification',
        description: 'Subsequent review and independent verification reported by ChatGPT',
        events: stages.verification,
        status: stages.verification.length > 0 ? 'completed' : 'pending',
      },
    ];

    return {
      task,
      events,
      stages: formattedStages,
      summary: {
        taskId: task.id,
        taskTitle: task.title,
        status: task.status,
        priority: task.priority || 'normal',
        executionMode: task.executionMode || 'default',
        assignedAt,
        dispatchedAt,
        completedAt,
        totalDurationMs,
        queueDurationMs,
        executionDurationMs,
        isApproved,
        approver,
        hasGitVerification,
        verifiedCommit,
        hasChatGptVerification,
        chatGptVerificationSummary,
      },
    };
  }

  public exportTaskTrace(taskId: string, format: 'markdown' | 'json'): string {
    const trace = this.getTaskTrace(taskId);

    if (format === 'json') {
      const sanitized = JSON.parse(sanitizeLogOutput(JSON.stringify(trace, null, 2)));
      return JSON.stringify(sanitized, null, 2);
    }

    // Markdown export
    const { task, summary, stages, events } = trace;
    let md = `# Knot Task Execution Trace: ${task.title}\n\n`;
    md += `**Task ID:** \`${task.id}\`\n`;
    md += `**Status:** \`${summary.status}\`\n`;
    md += `**Priority:** \`${summary.priority}\`\n`;
    md += `**Assigned At:** ${summary.assignedAt}\n`;
    md += `**Dispatched At:** ${summary.dispatchedAt || 'N/A'}\n`;
    md += `**Completed At:** ${summary.completedAt || 'N/A'}\n`;
    md += `**Total Duration:** ${summary.totalDurationMs !== null ? `${summary.totalDurationMs} ms` : 'N/A'}\n`;
    md += `**Git Verification:** ${summary.hasGitVerification ? `Verified (Commit: \`${summary.verifiedCommit}\`)` : 'None / Working Tree Only'}\n`;
    md += `**ChatGPT Verification:** ${summary.hasChatGptVerification ? `Yes (${summary.chatGptVerificationSummary})` : 'Unverified'}\n\n`;

    md += `---\n\n`;
    md += `## Lifecycle Stages Summary\n\n`;
    for (const stage of stages) {
      md += `### ${stage.label} [${stage.status.toUpperCase()}]\n`;
      md += `*${stage.description}*\n\n`;
      if (stage.events.length === 0) {
        md += `*No events recorded in this stage.*\n\n`;
      } else {
        for (const ev of stage.events) {
          md += `- **[${ev.timestamp}]** \`${ev.actor}\` (${ev.provenance}): **${ev.title}**\n`;
          if (ev.data && Object.keys(ev.data).length > 0) {
            md += `  \`\`\`json\n  ${JSON.stringify(ev.data, null, 2).replace(/\n/g, '\n  ')}\n  \`\`\`\n`;
          }
        }
        md += `\n`;
      }
    }

    md += `---\n\n`;
    md += `## Complete Chronological Audit Trail (${events.length} Events)\n\n`;
    md += `| Timestamp | Actor | Provenance | Event Type | Details |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    for (const ev of events) {
      const summaryDetail = ev.data?.summary || ev.data?.reason || ev.data?.error || ev.title;
      const cleanSummary = String(summaryDetail).replace(/\|/g, '\\|').slice(0, 80);
      md += `| ${ev.timestamp} | \`${ev.actor}\` | \`${ev.provenance}\` | \`${ev.eventType}\` | ${cleanSummary} |\n`;
    }

    return sanitizeLogOutput(md);
  }
}
