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
};

contextBridge.exposeInMainWorld('knotApi', api);
