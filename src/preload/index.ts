import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  LogEntry,
  ProcessStatusInfo,
  KnotApi,
  CreateProjectInput,
  UpdateProjectInput,
  CreateSessionInput,
  SessionStatus,
  AppendMessageInput,
  PaginationOptions,
  CreateTaskInput,
  TaskStatus,
  AppendEventInput,
  EventFilterOptions,
} from '../shared/types.js';

const api: KnotApi = {
  // Desktop Commander API
  startDesktopCommander: () => ipcRenderer.invoke('desktop-commander:start'),
  stopDesktopCommander: () => ipcRenderer.invoke('desktop-commander:stop'),
  getStatus: () => ipcRenderer.invoke('desktop-commander:status'),
  getLogs: () => ipcRenderer.invoke('desktop-commander:logs'),
  clearLogs: () => ipcRenderer.invoke('desktop-commander:clearLogs'),

  onStatusChange: (callback: (status: ProcessStatusInfo) => void) => {
    const handler = (_event: IpcRendererEvent, status: ProcessStatusInfo) => callback(status);
    ipcRenderer.on('desktop-commander:status-changed', handler);
    return () => {
      ipcRenderer.removeListener('desktop-commander:status-changed', handler);
    };
  },

  onLog: (callback: (log: LogEntry) => void) => {
    const handler = (_event: IpcRendererEvent, log: LogEntry) => callback(log);
    ipcRenderer.on('desktop-commander:new-log', handler);
    return () => {
      ipcRenderer.removeListener('desktop-commander:new-log', handler);
    };
  },

  // Project Management API
  projects: {
    list: (includeArchived?: boolean) => ipcRenderer.invoke('projects:list', includeArchived),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    create: (data: CreateProjectInput) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: UpdateProjectInput) => ipcRenderer.invoke('projects:update', id, data),
    archive: (id: string) => ipcRenderer.invoke('projects:archive', id),
    unarchive: (id: string) => ipcRenderer.invoke('projects:unarchive', id),
    selectDirectory: () => ipcRenderer.invoke('projects:selectDirectory'),
  },

  // Session Management API
  sessions: {
    list: (projectId: string, includeArchived?: boolean) => ipcRenderer.invoke('sessions:list', projectId, includeArchived),
    get: (id: string) => ipcRenderer.invoke('sessions:get', id),
    create: (data: CreateSessionInput) => ipcRenderer.invoke('sessions:create', data),
    updateStatus: (id: string, status: SessionStatus) => ipcRenderer.invoke('sessions:updateStatus', id, status),
    updateTitle: (id: string, title: string) => ipcRenderer.invoke('sessions:updateTitle', id, title),
  },

  // Message Persistence API
  messages: {
    list: (sessionId: string, options?: PaginationOptions) => ipcRenderer.invoke('messages:list', sessionId, options),
    append: (data: AppendMessageInput) => ipcRenderer.invoke('messages:append', data),
  },

  // Task Management API
  tasks: {
    list: (sessionId: string, status?: TaskStatus) => ipcRenderer.invoke('tasks:list', sessionId, status),
    get: (id: string) => ipcRenderer.invoke('tasks:get', id),
    create: (data: CreateTaskInput) => ipcRenderer.invoke('tasks:create', data),
    updateStatus: (id: string, status: TaskStatus) => ipcRenderer.invoke('tasks:updateStatus', id, status),
  },

  // Event Audit Log API
  events: {
    list: (sessionId: string, options?: EventFilterOptions) => ipcRenderer.invoke('events:list', sessionId, options),
    append: (data: AppendEventInput) => ipcRenderer.invoke('events:append', data),
  },

  // ChatGPT ↔ Knot Filesystem Bridge API
  bridge: {
    getStatus: (sessionId?: string) => ipcRenderer.invoke('bridge:status', sessionId),
    initSessionBridge: (projectId: string, sessionId: string) =>
      ipcRenderer.invoke('bridge:initSessionBridge', projectId, sessionId),
    sendMessage: (projectId: string, sessionId: string, content: string) =>
      ipcRenderer.invoke('bridge:sendMessage', projectId, sessionId, content),
    startConnectionTest: (projectId: string, sessionId: string) =>
      ipcRenderer.invoke('bridge:startConnectionTest', projectId, sessionId),
    openDirectory: (dirPath: string) => ipcRenderer.invoke('bridge:openDirectory', dirPath),
    getInstructions: (projectId: string, sessionId: string) =>
      ipcRenderer.invoke('bridge:getInstructions', projectId, sessionId),
    onEvent: (callback: (event: any) => void) => {
      const handler = (_event: IpcRendererEvent, ev: any) => callback(ev);
      ipcRenderer.on('bridge:event', handler);
      return () => {
        ipcRenderer.removeListener('bridge:event', handler);
      };
    },
  },

  // Google Antigravity CLI Integration API
  antigravity: {
    detect: (customPath?: string) => ipcRenderer.invoke('antigravity:detect', customPath),
    getStatus: (sessionId: string) => ipcRenderer.invoke('antigravity:getStatus', sessionId),
    start: (sessionId: string, options?: any) =>
      ipcRenderer.invoke('antigravity:start', sessionId, options),
    sendMessage: (sessionId: string, prompt: string) =>
      ipcRenderer.invoke('antigravity:sendMessage', sessionId, prompt),
    stop: (sessionId: string) => ipcRenderer.invoke('antigravity:stop', sessionId),
    interrupt: (sessionId: string) => ipcRenderer.invoke('antigravity:interrupt', sessionId),
    resume: (sessionId: string) => ipcRenderer.invoke('antigravity:resume', sessionId),
    getHistory: (sessionId: string) => ipcRenderer.invoke('antigravity:getHistory', sessionId),
    onEvent: (callback: (event: any) => void) => {
      const handler = (_event: IpcRendererEvent, ev: any) => callback(ev);
      ipcRenderer.on('antigravity:event', handler);
      return () => {
        ipcRenderer.removeListener('antigravity:event', handler);
      };
    },
  },

  // ChatGPT-Led Orchestration API
  orchestration: {
    approveTask: (taskId: string) => ipcRenderer.invoke('orchestration:approve-task', taskId),
    rejectTask: (taskId: string, reason?: string) => ipcRenderer.invoke('orchestration:reject-task', taskId, reason),
    cancelTask: (taskId: string, reason?: string) => ipcRenderer.invoke('orchestration:cancel-task', taskId, reason),
    retryTask: (taskId: string) => ipcRenderer.invoke('orchestration:retry-task', taskId),
    listTasks: (sessionId: string, status?: TaskStatus) => ipcRenderer.invoke('orchestration:list-tasks', sessionId, status),
    listQueued: (sessionId?: string) => ipcRenderer.invoke('orchestration:list-queued', sessionId),
    getRunningTask: (sessionId: string) => ipcRenderer.invoke('orchestration:get-running-task', sessionId),
    dispatchNext: (sessionId: string) => ipcRenderer.invoke('orchestration:dispatch-next', sessionId),
    onEvent: (callback: (event: any) => void) => {
      const handler = (_event: IpcRendererEvent, ev: any) => callback(ev);
      ipcRenderer.on('orchestration:event', handler);
      return () => {
        ipcRenderer.removeListener('orchestration:event', handler);
      };
    },
  },

  // Read-Only Git Inspection API
  git: {
    getTaskDiff: (taskId: string) => ipcRenderer.invoke('git:get-task-diff', taskId),
    getFileDiff: (taskId: string, filePath: string) => ipcRenderer.invoke('git:get-file-diff', taskId, filePath),
    getRepoStatus: (projectId: string) => ipcRenderer.invoke('git:get-repo-status', projectId),
  },
};

contextBridge.exposeInMainWorld('knotApi', api);
