export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

export type TaskStatus =
  | 'queued'
  | 'awaiting_approval'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'needs_attention';

export type MessageSender = 'user' | 'chatgpt' | 'antigravity' | 'system';

export interface ProjectRecord {
  id: string;
  name: string;
  repository_path: string | null;
  repository_remote: string | null;
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
  git_boundary_json?: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface EventRecord {
  id: string;
  session_id: string;
  task_id: string | null;
  event_type: string;
  actor: string;
  data_json: string | null;
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

