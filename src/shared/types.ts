export type ProcessState = 'Stopped' | 'Starting' | 'Running' | 'Stopping' | 'Error';

export type RemoteConnectionState = 'unverified' | 'pairing_required' | 'connected' | 'disconnected';

export interface ProcessStatusInfo {
  state: ProcessState;
  connectionState: RemoteConnectionState;
  connectionVerified: boolean;
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  exitCode: number | null;
  errorMessage: string | null;
}

export type LogLevel = 'stdout' | 'stderr' | 'system';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

// ==========================================
// Project, Session, Message, Task & Event Types
// ==========================================

export interface Project {
  id: string;
  name: string;
  repositoryPath: string | null;
  repositoryRemote: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  sessionCount?: number;
}

export interface CreateProjectInput {
  name: string;
  repositoryPath?: string | null;
  repositoryRemote?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  repositoryPath?: string | null;
  repositoryRemote?: string | null;
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface Session {
  id: string;
  projectId: string;
  title: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  startedAt: string | null;
  endedAt: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateSessionInput {
  projectId: string;
  title: string;
  metadata?: Record<string, unknown> | null;
}

export type MessageSender = 'user' | 'chatgpt' | 'antigravity' | 'system';

export interface Message {
  id: string;
  sessionId: string;
  sequence: number;
  sender: MessageSender;
  recipient: string | null;
  messageType: string;
  contentMarkdown: string;
  correlationId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AppendMessageInput {
  sessionId: string;
  sender: MessageSender;
  contentMarkdown: string;
  messageType?: string;
  recipient?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export type TaskStatus =
  | 'queued'
  | 'awaiting_approval'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'needs_attention';

export interface Task {
  id: string;
  sessionId: string;
  title: string;
  description: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  status: TaskStatus;
  approvalStatus: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateTaskInput {
  sessionId: string;
  title: string;
  description?: string | null;
  createdBy?: string | null;
  assignedTo?: string | null;
  status?: TaskStatus;
  approvalStatus?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assignedTo?: string | null;
  status?: TaskStatus;
  approvalStatus?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface EventItem {
  id: string;
  sessionId: string;
  taskId: string | null;
  eventType: string;
  actor: string;
  data?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AppendEventInput {
  sessionId: string;
  eventType: string;
  actor: string;
  taskId?: string | null;
  data?: Record<string, unknown> | null;
}

export interface EventFilterOptions extends PaginationOptions {
  taskId?: string;
  eventType?: string;
}

// ==========================================
// Preload Window API Bridge Definition
// ==========================================

export interface ProjectsApi {
  list: (includeArchived?: boolean) => Promise<Project[]>;
  get: (id: string) => Promise<Project | null>;
  create: (data: CreateProjectInput) => Promise<Project>;
  update: (id: string, data: UpdateProjectInput) => Promise<Project>;
  archive: (id: string) => Promise<Project>;
  unarchive: (id: string) => Promise<Project>;
  selectDirectory: () => Promise<string | null>;
}

export interface SessionsApi {
  list: (projectId: string, includeArchived?: boolean) => Promise<Session[]>;
  get: (id: string) => Promise<Session | null>;
  create: (data: CreateSessionInput) => Promise<Session>;
  updateStatus: (id: string, status: SessionStatus) => Promise<Session>;
  updateTitle: (id: string, title: string) => Promise<Session>;
}

export interface MessagesApi {
  list: (sessionId: string, options?: PaginationOptions) => Promise<Message[]>;
  append: (data: AppendMessageInput) => Promise<Message>;
}

export interface TasksApi {
  list: (sessionId: string, status?: TaskStatus) => Promise<Task[]>;
  get: (id: string) => Promise<Task | null>;
  create: (data: CreateTaskInput) => Promise<Task>;
  updateStatus: (id: string, status: TaskStatus) => Promise<Task>;
}

export interface EventsApi {
  list: (sessionId: string, options?: EventFilterOptions) => Promise<EventItem[]>;
  append: (data: AppendEventInput) => Promise<EventItem>;
}

export interface KnotApi {
  // Desktop Commander API
  startDesktopCommander: () => Promise<{ success: boolean; message?: string }>;
  stopDesktopCommander: () => Promise<{ success: boolean; message?: string }>;
  getStatus: () => Promise<ProcessStatusInfo>;
  getLogs: () => Promise<LogEntry[]>;
  clearLogs: () => Promise<void>;
  onStatusChange: (callback: (status: ProcessStatusInfo) => void) => () => void;
  onLog: (callback: (log: LogEntry) => void) => () => void;

  // Project, Session, Message, Task & Event APIs
  projects: ProjectsApi;
  sessions: SessionsApi;
  messages: MessagesApi;
  tasks: TasksApi;
  events: EventsApi;
}
