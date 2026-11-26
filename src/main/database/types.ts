export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

export type TaskStatus =
  | 'queued'
  | 'awaiting_approval'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'needs_attention';

export type MessageSender = 'user' | 'chatgpt' | 'antigravity' | 'system';

export interface ProjectRecord {
  id: string;
  name: string;
  repository_path: string | null;
  repository_remote: string | null;
  trust_policy?: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface SessionRecord {
  id: string;
  project_id: string;
  title: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  started_at: string | null;
  ended_at: string | null;
  metadata_json: string | null;
}

export interface MessageRecord {
  id: string;
  session_id: string;
  sequence: number;
  sender: MessageSender;
  recipient: string | null;
  message_type: string;
  content_markdown: string;
  correlation_id: string | null;
  metadata_json: string | null;
  created_at: string;
}

export interface TaskRecord {
  id: string;
  session_id: string;
  title: string;
  description: string | null;
  created_by: string | null;
  assigned_to: string | null;
  status: TaskStatus;
  approval_status: string | null;
  payload_json: string | null;
  source_message_id?: string | null;
  result_message_id?: string | null;
  dispatched_at?: string | null;
  failure_reason?: string | null;
  priority?: string | null;
  execution_mode?: string | null;
  acceptance_criteria_json?: string | null;
  retry_count?: number | null;
  content_hash?: string | null;
  approved_content_hash?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  git_boundary_json?: string | null;
  context_references_json?: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface EventRecord {
  id: string;
  project_id: string | null;
  session_id: string | null;
  task_id: string | null;
  correlation_id: string | null;
  event_type: string;
  actor: string;
  source: string;
  provenance: string;
  title: string;
  severity: string;
  data_json: string | null;
  event_timestamp: string;
  created_at: string;
}

export interface AgentSessionRecord {
  id: string;
  session_id: string;
  agent_type: string;
  cli_conversation_id: string | null;
  working_directory: string;
  status: string;
  execution_mode: string;
  model: string | null;
  effort: string | null;
  created_at: string;
  updated_at: string;
  last_started_at: string | null;
  last_exit_code: number | null;
  metadata_json: string | null;
}

export interface ContextDocumentRecord {
  id: string;
  project_id: string;
  session_id: string | null;
  scope: string;
  category: string;
  title: string;
  content_markdown: string;
  author: string;
  provenance: string;
  content_hash: string;
  current_revision: number;
  is_archived: number;
  requires_verification: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ContextRevisionRecord {
  id: string;
  context_id: string;
  revision: number;
  title: string;
  content_markdown: string;
  content_hash: string;
  author: string;
  provenance: string;
  requires_verification: number;
  change_summary: string | null;
  created_at: string;
}

export interface ContextConflictRecord {
  id: string;
  context_id: string;
  project_id: string;
  session_id: string | null;
  expected_revision: number | null;
  actual_revision: number;
  incoming_title: string;
  incoming_content: string;
  incoming_author: string;
  conflict_reason: string;
  is_resolved: number;
  resolved_at: string | null;
  created_at: string;
}

export interface ReconciliationHistoryRecord {
  id: string;
  reconciled_at: string;
  duration_ms: number;
  tasks_reconciled: number;
  bridge_files_reconciled: number;
  context_docs_reconciled: number;
  results_reconciled: number;
  issues_detected: number;
  issues_repaired: number;
  details_json: string | null;
}
