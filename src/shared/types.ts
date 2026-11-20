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

export interface KnotApi {
  startDesktopCommander: () => Promise<{ success: boolean; message?: string }>;
  stopDesktopCommander: () => Promise<{ success: boolean; message?: string }>;
  getStatus: () => Promise<ProcessStatusInfo>;
  getLogs: () => Promise<LogEntry[]>;
  clearLogs: () => Promise<void>;
  onStatusChange: (callback: (status: ProcessStatusInfo) => void) => () => void;
  onLog: (callback: (log: LogEntry) => void) => () => void;
}
