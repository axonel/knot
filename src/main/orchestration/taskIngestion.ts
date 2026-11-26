import type { DatabaseService } from '../database/index.js';
import type { ParsedBridgeMessage } from '../bridge/types.js';
import type { Task, TaskPriority } from '../../shared/types.js';
import { TaskPolicy } from './TaskPolicy.js';

export interface IngestTaskResult {
  task: Task;
  isDuplicate: boolean;
}

export function extractTaskTitle(markdown: string, metaTitle?: string): string {
  if (metaTitle && typeof metaTitle === 'string' && metaTitle.trim()) {
    return metaTitle.trim();
  }

  const safeMarkdown = markdown || '';

  // Look for first markdown heading (# Title or ## Title)
  const headingMatch = safeMarkdown.match(/^#{1,3}\s+(.+)$/m);
  if (headingMatch && headingMatch[1].trim()) {
    return headingMatch[1].trim();
  }

  // Fallback to first non-empty line
  const lines = safeMarkdown.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const firstLine = lines[0].replace(/^[#*-]\s+/, '').trim();
    if (firstLine.length > 60) {
      return firstLine.slice(0, 57) + '...';
    }
    return firstLine;
  }

  return 'Untitled Task';
}

export function extractAcceptanceCriteria(markdown: string, metaCriteria?: unknown): string[] {
  if (Array.isArray(metaCriteria) && metaCriteria.every((c) => typeof c === 'string')) {
    return metaCriteria;
  }

  if (!markdown) {
    return [];
  }

  const criteria: string[] = [];
  const sectionRegex = /##+\s+Acceptance Criteria\s*\r?\n([\s\S]*?)(?=\n##+|$)/i;
  const match = markdown.match(sectionRegex);
  if (match) {
    const listLines = match[1].split(/\r?\n/);
    for (const line of listLines) {
      const itemMatch = line.match(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?(.+)$/);
      if (itemMatch && itemMatch[1].trim()) {
        criteria.push(itemMatch[1].trim());
      }
    }
  }

  return criteria;
}

export function ingestTaskAssignment(
  parsedMessage: ParsedBridgeMessage,
  dbService: DatabaseService
): IngestTaskResult {
  const { id: sourceMessageId, sessionId } = parsedMessage.metadata;

  // 1. Idempotency check: if task for this inbound message ID already exists, return existing task
  const existing = dbService.tasks.getBySourceMessageId(sourceMessageId);
  if (existing) {
    return {
      task: existing,
      isDuplicate: true,
    };
  }

  // 2. Validate session and project exist
  const session = dbService.sessions.get(sessionId);
  if (!session) {
    throw new Error(`Cannot ingest task: Session "${sessionId}" not found.`);
  }

  const project = dbService.projects.get(session.projectId);
  const projectTrustPolicy = project?.trustPolicy || 'approval_required';

  const metadata = (parsedMessage.metadata.metadata || {}) as Record<string, unknown>;
  const rawTitle = metadata.title as string | undefined;
  const title = extractTaskTitle(parsedMessage.bodyMarkdown, rawTitle);
  const acceptanceCriteria = extractAcceptanceCriteria(
    parsedMessage.bodyMarkdown,
    metadata.acceptanceCriteria
  );

  const priority = (metadata.priority as TaskPriority) || 'normal';
  const executionMode = (metadata.executionMode as string) || 'default';
  const explicitApproval = metadata.requiresApproval === true;

  let contextReferences: any[] | null = null;
  if (Array.isArray(metadata.contextReferences)) {
    contextReferences = metadata.contextReferences.filter(
      (ref: any) => typeof ref === 'object' && ref !== null && typeof ref.contextId === 'string'
    );
  }

  // 3. Safety policy evaluation against project trust mode (fail-safe)
  const policy = TaskPolicy.evaluate(title, parsedMessage.bodyMarkdown, {
    priority,
    executionMode,
    explicitApprovalRequested: explicitApproval,
    projectTrustPolicy,
  });

  const approvalStatus = policy.requiresApproval ? 'awaiting_approval' : 'approved';
  const initialStatus = policy.requiresApproval ? 'awaiting_approval' : 'queued';

  // 4. Create persistent task record
  const task = dbService.tasks.create({
    sessionId,
    title,
    description: parsedMessage.bodyMarkdown,
    createdBy: 'chatgpt',
    assignedTo: 'antigravity',
    status: initialStatus,
    approvalStatus,
    sourceMessageId,
    priority,
    executionMode,
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : null,
    contextReferences: contextReferences && contextReferences.length > 0 ? contextReferences : null,
    payload: {
      inboundMessageId: sourceMessageId,
      policyCategory: policy.category,
      policyReason: policy.reason || null,
      ...metadata,
    },
  });

  // 5. Append auditable lifecycle events
  // 5a. Original ChatGPT assignment (reported)
  dbService.events.append({
    sessionId,
    taskId: task.id,
    correlationId: task.id,
    eventType: 'task_received',
    actor: 'chatgpt',
    source: 'bridge',
    provenance: 'chatgpt_reported',
    title: `Task Received from ChatGPT: ${task.title}`,
    data: {
      taskId: task.id,
      title: task.title,
      sourceMessageId,
      priority,
      executionMode,
    },
  });

  // 5b. Knot database creation (observed)
  dbService.events.append({
    sessionId,
    taskId: task.id,
    correlationId: task.id,
    eventType: 'task_created',
    actor: 'knot',
    source: 'orchestration_runtime',
    provenance: 'knot_observed',
    title: `Task Created in Queue: ${task.title}`,
    data: {
      taskId: task.id,
      status: task.status,
      requiresApproval: policy.requiresApproval,
      priority,
    },
  });

  // 5c. Legacy event compatibility
  dbService.events.append({
    sessionId,
    taskId: task.id,
    correlationId: task.id,
    eventType: 'task_assigned',
    actor: 'chatgpt',
    source: 'bridge',
    provenance: 'chatgpt_reported',
    title: `Task Assigned: ${task.title}`,
    data: {
      taskId: task.id,
      title: task.title,
      sourceMessageId,
      priority,
      executionMode,
      requiresApproval: policy.requiresApproval,
      approvalStatus,
      status: task.status,
    },
  });

  // 5d. Queue / Approval state event
  if (policy.requiresApproval) {
    dbService.events.append({
      sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'approval_requested',
      actor: 'knot',
      source: 'orchestration_runtime',
      provenance: 'knot_observed',
      severity: 'warning',
      title: `Approval Requested: ${task.title}`,
      data: {
        taskId: task.id,
        policyCategory: policy.category,
        reason: policy.reason,
      },
    });
  } else {
    dbService.events.append({
      sessionId,
      taskId: task.id,
      correlationId: task.id,
      eventType: 'task_queued',
      actor: 'knot',
      source: 'orchestration_runtime',
      provenance: 'knot_observed',
      title: `Task Queued for Execution: ${task.title}`,
      data: {
        taskId: task.id,
        priority,
      },
    });
  }

  return {
    task,
    isDuplicate: false,
  };
}
