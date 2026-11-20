import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { LogEntry, ProcessStatusInfo, ThreadlineApi } from '../shared/types.js';

const api: ThreadlineApi = {
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
};

contextBridge.exposeInMainWorld('threadlineApi', api);
