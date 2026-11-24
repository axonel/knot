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

export type MessageSender = 'user' | 'chatgpt' | 'antigravity' | 'system' | 'knot';

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
  id?: string;
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

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskApprovalStatus = 'approved' | 'awaiting_approval' | 'rejected';

export interface Task {
  id: string;
  sessionId: string;
  title: string;
  description: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  status: TaskStatus;
  approvalStatus: string | null;
  sourceMessageId?: string | null;
  resultMessageId?: string | null;
  dispatchedAt?: string | null;
  failureReason?: string | null;
  priority?: TaskPriority | string;
  executionMode?: string;
  acceptanceCriteria?: string[] | null;
  retryCount?: number;
  payload?: Record<string, unknown> | null;
  gitBoundary?: TaskGitBoundary | null;
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
  sourceMessageId?: string | null;
  resultMessageId?: string | null;
  dispatchedAt?: string | null;
  failureReason?: string | null;
  priority?: TaskPriority | string;
  executionMode?: string;
  acceptanceCriteria?: string[] | null;
  retryCount?: number;
  payload?: Record<string, unknown> | null;
  gitBoundary?: TaskGitBoundary | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assignedTo?: string | null;
  status?: TaskStatus;
  approvalStatus?: string | null;
  sourceMessageId?: string | null;
  resultMessageId?: string | null;
  dispatchedAt?: string | null;
  failureReason?: string | null;
  priority?: TaskPriority | string;
  executionMode?: string;
  acceptanceCriteria?: string[] | null;
  retryCount?: number;
  payload?: Record<string, unknown> | null;
  gitBoundary?: TaskGitBoundary | null;
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

// ==========================================
// ChatGPT ↔ Knot Filesystem Bridge Types
// ==========================================

export type BridgeProtocolVersion = 'v1';

export type BridgeMessageType =
  | 'message'
  | 'handshake_challenge'
  | 'handshake_response'
  | 'task_assignment'
  | 'activity'
  | 'task_result'
  | 'task_control';

export type HandshakeState =
  | 'not_configured'
  | 'workspace_ready'
  | 'awaiting_response'
  | 'verified'
  | 'error';

export interface KnotMessageMetadata {
  id: string;
  protocol: BridgeProtocolVersion;
  projectId: string;
  sessionId: string;
  sender: MessageSender;
  recipient: MessageSender | 'knot' | 'all';
  type: BridgeMessageType;
  challengeId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface SessionBridgePaths {
  projectDir: string;
  sessionDir: string;
  inboxDir: string;
  processedDir: string;
  rejectedDir: string;
  outboxDir: string;
  conversationFile: string;
}

export interface HandshakeChallenge {
  id: string;
  challengeId: string;
  projectId: string;
  sessionId: string;
  outboxFilePath: string;
  inboxExpectedFilePath: string;
  instructions: string;
  expiresAt: string;
  status: 'pending' | 'verified' | 'expired' | 'failed';
}

export interface TaskExecutionDetails {
  summary?: string;
  changedFiles?: string[];
  commandsExecuted?: Array<{
    command: string;
    exitCode?: number;
    output?: string;
  }>;
  testsExecuted?: Array<{
    command: string;
    outcome?: 'passed' | 'failed' | 'skipped';
    exitCode?: number;
  }>;
  commitHash?: string;
  errors?: string[];
  limitations?: string[];
}

export interface BridgeStatusInfo {
  workspaceInitialized: boolean;
  bridgeRoot: string;
  exists?: boolean;
  readable?: boolean;
  writable?: boolean;
  watcherActive?: boolean;
  watchedSessionsCount?: number;
  watchedSessionIds?: string[];
  desktopCommanderRunning: boolean;
  mcpPermissionConfigured: boolean;
  handshakeState: HandshakeState;
  activeProjectId: string | null;
  activeSessionId: string | null;
  lastInboundMessage: { id: string; timestamp: string; sender: string } | null;
  lastOutboundMessage: { id: string; timestamp: string; sender: string } | null;
  latestDispatchedTask?: { taskId: string; title: string; timestamp: string } | null;
  antigravityRunning?: boolean;
  latestPublishedResult?: { taskId: string; messageId: string; timestamp: string } | null;
  unreadResultsCount?: number;
  lastVerifiedAt?: string | null;
  activeChallenge?: HandshakeChallenge | null;
  sessionPaths?: SessionBridgePaths | null;
}

export interface BridgeInstructions {
  bridgeRoot: string;
  sessionDir: string;
  inboxDir: string;
  outboxDir: string;
  allowedDirectoriesConfig: string;
  chatgptPrompt: string;
}

export type BridgeEventType =
  | 'workspace-ready'
  | 'message-received'
  | 'message-published'
  | 'message-rejected'
  | 'connection-test-started'
  | 'connection-verified'
  | 'activity-received'
  | 'task-assignment-received'
  | 'workspace-index-updated'
  | 'error';

export interface BridgeEvent {
  type: BridgeEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface BridgeApi {
  getStatus: (sessionId?: string) => Promise<BridgeStatusInfo>;
  initSessionBridge: (projectId: string, sessionId: string) => Promise<SessionBridgePaths>;
  sendMessage: (projectId: string, sessionId: string, content: string) => Promise<Message>;
  startConnectionTest: (projectId: string, sessionId: string) => Promise<HandshakeChallenge>;
  openDirectory: (dirPath: string) => Promise<boolean>;
  getInstructions: (projectId: string, sessionId: string) => Promise<BridgeInstructions>;
  onEvent: (callback: (event: BridgeEvent) => void) => () => void;
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

  // ChatGPT ↔ Knot Filesystem Bridge API
  bridge: BridgeApi;

  // Google Antigravity CLI Integration API
  antigravity: AntigravityApi;

  // ChatGPT-Led Orchestration API
  orchestration: OrchestrationApi;

  // Read-Only Git Inspection API
  git: GitApi;
}

export interface OrchestrationEvent {
  type: 'task_created' | 'task_completed' | 'task_failed' | 'task_status_changed';
  data: Record<string, unknown>;
  timestamp: string;
}

export interface OrchestrationApi {
  approveTask: (taskId: string) => Promise<Task>;
  rejectTask: (taskId: string, reason?: string) => Promise<Task>;
  cancelTask: (taskId: string, reason?: string) => Promise<Task>;
  retryTask: (taskId: string) => Promise<Task>;
  listTasks: (sessionId: string, status?: TaskStatus) => Promise<Task[]>;
  listQueued: (sessionId?: string) => Promise<Task[]>;
  getRunningTask: (sessionId: string) => Promise<Task | null>;
  dispatchNext: (sessionId: string) => Promise<Task | null>;
  onEvent: (callback: (event: OrchestrationEvent) => void) => () => void;
}

// ==========================================
// Agent Session & Antigravity CLI Types
// ==========================================

export type AgentType = 'antigravity' | 'chatgpt';

export type AgentExecutionMode = 'default' | 'accept-edits' | 'auto' | 'plan';

export interface AgentSession {
  id: string;
  sessionId: string;
  agentType: string;
  cliConversationId: string | null;
  workingDirectory: string;
  status: string;
  executionMode: string;
  model: string | null;
  effort: string | null;
  createdAt: string;
  updatedAt: string;
  lastStartedAt: string | null;
  lastExitCode: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpsertAgentSessionInput {
  sessionId: string;
  agentType: string;
  workingDirectory: string;
  status?: string;
  executionMode?: string;
  cliConversationId?: string | null;
  model?: string | null;
  effort?: string | null;
  lastStartedAt?: string | null;
  lastExitCode?: number | null;
  metadata?: Record<string, unknown> | null;
}

export type AntigravityReadinessState =
  | 'not_installed'
  | 'installed'
  | 'auth_unverified'
  | 'ready'
  | 'auth_required'
  | 'error';

export type AntigravityExecutionMode = 'default' | 'accept-edits' | 'auto' | 'plan';

export type AntigravityProcessState =
  | 'unavailable'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'thinking'
  | 'stopping'
  | 'authentication_required'
  | 'needs_attention'
  | 'error';

export interface AntigravityCapabilities {
  installed: boolean;
  executablePath: string | null;
  version: string | null;
  supportedModes: AntigravityExecutionMode[];
  supportsStreaming: boolean;
  supportsResumption: boolean;
  readiness: AntigravityReadinessState;
  errorDetails?: string | null;
}

export interface AntigravityStatus {
  sessionId: string;
  state: AntigravityProcessState;
  pid: number | null;
  cliConversationId: string | null;
  workingDirectory: string;
  executionMode: AntigravityExecutionMode;
  model: string | null;
  effort: string | null;
  lastStartedAt: string | null;
  lastExitCode: number | null;
  capabilities: AntigravityCapabilities;
  currentTurnPending: boolean;
  lastResult?: {
    status: string;
    durationSeconds?: number;
    error?: string | null;
    numTurns?: number;
  } | null;
}

export interface StartAgentOptions {
  mode?: AntigravityExecutionMode;
  model?: string;
  effort?: string;
  resumeConversationId?: string;
  executablePath?: string;
}

export interface AntigravityToolCall {
  name: string;
  parameters: Record<string, unknown>;
  output?: string;
  status: 'active' | 'done' | 'denied' | 'error';
}

export interface AntigravityStep {
  stepIndex: number;
  state: 'ACTIVE' | 'DONE';
  stepType: string;
  textDelta?: string;
  tool?: AntigravityToolCall;
  subagentInfo?: Record<string, unknown>;
  durationSeconds?: number;
  usage?: Record<string, unknown>;
}

export interface AntigravityUiEvent {
  type:
    | 'status_changed'
    | 'text_delta'
    | 'tool_started'
    | 'tool_completed'
    | 'tool_denied'
    | 'turn_completed'
    | 'error'
    | 'auth_required';
  sessionId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface AntigravityApi {
  detect: (customPath?: string) => Promise<AntigravityCapabilities>;
  getStatus: (sessionId: string) => Promise<AntigravityStatus>;
  start: (sessionId: string, options?: StartAgentOptions) => Promise<void>;
  sendMessage: (sessionId: string, prompt: string) => Promise<void>;
  stop: (sessionId: string) => Promise<void>;
  interrupt: (sessionId: string) => Promise<void>;
  resume: (sessionId: string) => Promise<void>;
  getHistory: (sessionId: string) => Promise<Message[]>;
  onEvent: (callback: (event: AntigravityUiEvent) => void) => () => void;
}

// ==========================================
// Git Inspection & Diff Viewer Types
// ==========================================

export interface GitStatusSummary {
  head: string | null;
  branch: string | null;
  isClean: boolean;
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
}

export interface TaskGitBoundary {
  taskId: string;
  start: GitStatusSummary;
  end?: GitStatusSummary;
  reportedCommitHash?: string | null;
  verifiedCommitHash?: string | null;
  capturedAtStart: string;
  capturedAtEnd?: string;
}

export type FileChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
export type FileProvenance = 'git-derived' | 'antigravity-reported' | 'attribution-uncertain';

export interface DiffHunkLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffHunkLine[];
}

export interface FileDiffEntry {
  path: string;
  oldPath?: string;
  changeType: FileChangeType;
  additions: number;
  deletions: number;
  isStaged: boolean;
  isUntracked: boolean;
  provenance: FileProvenance;
  attributionReason?: string;
  diff?: string;
  hunks?: DiffHunk[];
  omittedReason?: 'binary' | 'large_file' | 'sensitive_file' | 'encoding_error' | 'empty';
}

export interface TaskGitInspectionResult {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  projectId: string;
  sessionId: string;
  repositoryPath: string;
  branch: string | null;
  startHead: string | null;
  endHead: string | null;
  currentHead: string | null;
  isCleanAtStart: boolean;
  isCleanAtEnd: boolean;
  repositoryChangedSinceCompletion: boolean;
  attributionConfidence: 'high' | 'medium' | 'low';
  attributionNotes: string[];
  reportedCommitHash?: string | null;
  verifiedCommitHash?: string | null;
  commitMetadata?: {
    hash: string;
    authorName?: string;
    authorEmail?: string;
    timestamp?: string;
    message?: string;
  } | null;
  files: FileDiffEntry[];
  summary: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    stagedCount: number;
    unstagedCount: number;
    untrackedCount: number;
    uncertainCount: number;
  };
}

export interface GitRepoStatusResult {
  repositoryPath: string;
  branch: string | null;
  head: string | null;
  isClean: boolean;
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
}

export interface GitApi {
  getTaskDiff: (taskId: string) => Promise<TaskGitInspectionResult>;
  getFileDiff: (taskId: string, filePath: string) => Promise<FileDiffEntry>;
  getRepoStatus: (projectId: string) => Promise<GitRepoStatusResult>;
}


