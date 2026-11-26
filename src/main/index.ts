import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DesktopCommanderManager } from './desktopCommanderManager.js';
import { logger } from './diagnosticLogger.js';
import { initDatabaseService, DatabaseService } from './database/index.js';
import { BridgeService } from './bridge/index.js';
import { AntigravityManager } from './antigravity/index.js';
import { Orchestrator } from './orchestration/index.js';
import { GitService } from './git/gitService.js';
import { ReconciliationService } from './reliability/index.js';
import type {
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
  CreateContextInput,
  UpdateContextInput,
  ContextFilterOptions,
  ProjectTrustPolicy,
  SecurityDiagnostics,
} from '../shared/types.js';

let mainWindow: BrowserWindow | null = null;
const manager = new DesktopCommanderManager();
let dbService: DatabaseService | null = null;
let bridgeService: BridgeService | null = null;
let antigravityManager: AntigravityManager | null = null;
let orchestrator: Orchestrator | null = null;
let gitService: GitService | null = null;
let reconciliationService: ReconciliationService | null = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Global process exception handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception in Main Process', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection in Main Process', reason);
});

// Align application identity for Wayland/X11 window association
app.name = 'knot';
if (process.platform === 'linux') {
  app.setAppUserModelId('knot');
}

// 1. Handle CLI flags (--version, --help) when run directly from terminal
const args = process.argv.slice(1);
if (args.includes('--version') || args.includes('-v')) {
  console.log('Knot v1.0.0');
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Knot — Where AI agents work together.

Usage:
  knot [options]

Options:
  -v, --version    Show application version
  -h, --help       Show help text
`);
  process.exit(0);
}

// 2. Single Instance Lock: Prevent duplicate GUI processes
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.info('Duplicate Knot process launch detected. Transferring focus to existing instance and terminating duplicate.');
  app.exit(0);
} else {
  app.on('second-instance', (_event, commandLine) => {
    logger.info('Second instance launch requested with command line', commandLine);
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

function resolveIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, 'icons/128x128.png'),
    path.join(__dirname, '../renderer/icons/128x128.png'),
    path.join(process.resourcesPath, 'build/icons/128x128.png'),
    path.join(process.resourcesPath, 'icons/128x128.png'),
    path.join(__dirname, '../../build/icons/128x128.png'),
    path.join(__dirname, '../../build/icon.png'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function getErrorHtml(title: string, details: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Knot — ${title}</title>
  <style>
    body {
      background-color: #090B0D;
      color: #F9F9F9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    .card {
      background-color: #092634;
      border: 1px solid rgba(255, 110, 66, 0.4);
      border-radius: 8px;
      padding: 32px;
      max-width: 680px;
      width: 100%;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    h1 {
      color: #FF6E42;
      font-size: 20px;
      margin-top: 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    p {
      color: #F9F9F9;
      line-height: 1.6;
      font-size: 14px;
    }
    pre {
      background-color: #090B0D;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      padding: 16px;
      color: #FF6E42;
      font-size: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: rgba(249, 249, 249, 0.6);
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚠️ ${title}</h1>
    <p>The Knot desktop workspace encountered an initialization issue:</p>
    <pre>${details}</pre>
    <p>Diagnostic telemetry has been recorded to <code>~/.local/state/knot/logs/main.log</code>.</p>
    <div class="footer">Knot Desktop Workspace • Exit code details recorded</div>
  </div>
</body>
</html>`;
}

function createWindow(): void {
  logger.info('Creating primary BrowserWindow...');
  logger.info('Environment telemetry', {
    DISPLAY: process.env.DISPLAY,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
    XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE,
    node: process.versions.node,
    electron: process.versions.electron,
    arch: process.arch,
    platform: process.platform,
    isPackaged: app.isPackaged,
  });

  const iconPath = resolveIconPath();
  const preloadPath = path.join(__dirname, '../preload/index.js');
  const preloadExists = fs.existsSync(preloadPath);

  if (!preloadExists) {
    logger.error(`Critical: Preload script not found at expected path: ${preloadPath}`);
  } else {
    logger.info(`Preload script verified at ${preloadPath}`);
  }

  mainWindow = new BrowserWindow({
    title: 'Knot',
    width: 1140,
    height: 780,
    minWidth: 840,
    minHeight: 620,
    icon: iconPath,
    backgroundColor: '#090B0D',
    show: false,
    webPreferences: {
      preload: preloadExists ? preloadPath : undefined,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Navigation Hardening: Restrict will-navigate to dev server or local bundle
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const devUrl = process.env.VITE_DEV_SERVER_URL;
      const isDevUrl = devUrl && navigationUrl.startsWith(devUrl);
      const isLocalFile = parsed.protocol === 'file:';
      if (!isDevUrl && !isLocalFile) {
        logger.warn('Prevented untrusted navigation attempt', { navigationUrl });
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Window Open Hardening: Deny child windows and restrict external URLs to http/https
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url).catch((err) => {
          logger.error('Failed to open external URL in system browser', err);
        });
      } else {
        logger.warn('Blocked opening non-HTTP(S) external URL', { url });
      }
    } catch {
      logger.warn('Invalid URL passed to window open handler', { url });
    }
    return { action: 'deny' };
  });

  // Ensure window becomes visible once ready
  mainWindow.once('ready-to-show', () => {
    logger.info('Window emitted ready-to-show event. Displaying window.');
    mainWindow?.show();
  });

  // Fallback visibility trigger in case ready-to-show is delayed or missed
  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('WebContents emitted did-finish-load.');
    if (mainWindow && !mainWindow.isVisible()) {
      logger.info('Displaying window via did-finish-load fallback.');
      mainWindow.show();
    }
  });

  // Capture failed loads
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logger.error('WebContents failed to load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    });

    if (isMainFrame && mainWindow) {
      const errorPage = getErrorHtml(
        'Renderer Loading Failed',
        `Failed to load URL: ${validatedURL}\nError code: ${errorCode} (${errorDescription})`
      );
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage)}`).catch((err) => {
        logger.error('Failed to load fallback error page', err);
      });
      mainWindow.show();
    }
  });

  // Capture renderer process crashes or exits
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Renderer process gone', details);
  });

  // Forward renderer console messages to diagnostic logger
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      // 2 = WARNING, 3 = ERROR
      logger.warn(`Renderer Console [level ${level}]: ${message} (${sourceId}:${line})`);
    }
  });

  // Forward Desktop Commander status and logs to renderer
  manager.on('statusChange', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop-commander:status-changed', status);
    }
  });

  manager.on('log', (logEntry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop-commander:new-log', logEntry);
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (isDev && devServerUrl) {
    logger.info(`Loading renderer from Vite Dev Server at ${devServerUrl}`);
    mainWindow.loadURL(devServerUrl).catch((err) => {
      logger.error(`Failed to load dev server URL: ${devServerUrl}`, err);
      if (mainWindow) {
        mainWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(
            getErrorHtml('Dev Server Unreachable', `Could not connect to Vite dev server at ${devServerUrl}.\n${err.message}`)
          )}`
        );
        mainWindow.show();
      }
    });
  } else {
    const rendererPath = path.join(__dirname, '../renderer/index.html');
    logger.info(`Loading production renderer from ${rendererPath}`);

    if (!fs.existsSync(rendererPath)) {
      logger.error(`Renderer HTML not found at path: ${rendererPath}`);
      mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          getErrorHtml('Missing Production Bundle', `Renderer entrypoint missing at: ${rendererPath}\nRun "npm run build" first.`)
        )}`
      );
      mainWindow.show();
    } else {
      mainWindow.loadFile(rendererPath).catch((err) => {
        logger.error(`Failed to load file ${rendererPath}`, err);
        if (mainWindow) {
          mainWindow.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(
              getErrorHtml('Load Failure', `Failed to load ${rendererPath}: ${err.message}`)
            )}`
          );
          mainWindow.show();
        }
      });
    }
  }

  mainWindow.on('closed', () => {
    logger.info('Main window closed.');
    mainWindow = null;
  });
}

// Security Boundary: Validate IPC Sender Frame to prevent unauthorized IPC invocation
function validateIpcSender(event: Electron.IpcMainInvokeEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (event.senderFrame && event.senderFrame !== mainWindow.webContents.mainFrame) {
      logger.warn('Unauthorized IPC invocation attempt from untrusted frame', {
        processId: event.processId,
        frameId: event.frameId,
      });
      throw new Error('Forbidden: Unauthorized IPC sender frame.');
    }
  }
}

// Security Boundary: Validate directory open requests stay within authorized roots
function isPathAllowedForOpen(dirPath: string): boolean {
  if (!dirPath || typeof dirPath !== 'string') return false;
  const resolvedTarget = path.resolve(dirPath);

  // 1. Allow within bridge root
  if (bridgeService) {
    const bridgeRoot = path.resolve(bridgeService.getBridgeRoot());
    const rel = path.relative(bridgeRoot, resolvedTarget);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return true;
    }
  }

  // 2. Allow within any registered project repository directory
  if (dbService) {
    const projects = dbService.projects.list(true);
    for (const project of projects) {
      if (project.repositoryPath) {
        const repoRoot = path.resolve(project.repositoryPath);
        const rel = path.relative(repoRoot, resolvedTarget);
        if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
          return true;
        }
      }
    }
  }

  return false;
}

// Register IPC handlers
ipcMain.handle('desktop-commander:start', async (event) => {
  validateIpcSender(event);
  return await manager.start();
});

ipcMain.handle('desktop-commander:stop', async (event) => {
  validateIpcSender(event);
  return await manager.stop();
});

ipcMain.handle('desktop-commander:status', (event) => {
  validateIpcSender(event);
  return manager.getStatus();
});

ipcMain.handle('desktop-commander:logs', (event) => {
  validateIpcSender(event);
  return manager.getLogs();
});

ipcMain.handle('desktop-commander:clearLogs', (event) => {
  validateIpcSender(event);
  manager.clearLogs();
  return { success: true };
});

// Register Project Management IPC handlers
ipcMain.handle('projects:list', (event, includeArchived?: boolean) => {
  validateIpcSender(event);
  if (!dbService) throw new Error('Database not initialized');
  return dbService.projects.list(Boolean(includeArchived));
});

ipcMain.handle('projects:get', (event, id: string) => {
  validateIpcSender(event);
  if (!dbService) throw new Error('Database not initialized');
  return dbService.projects.get(id);
});

ipcMain.handle('projects:create', (event, data: CreateProjectInput) => {
  validateIpcSender(event);
  if (!dbService) throw new Error('Database not initialized');
  return dbService.projects.create(data);
});

ipcMain.handle('projects:update', (event, id: string, data: UpdateProjectInput) => {
  validateIpcSender(event);
  if (!dbService) throw new Error('Database not initialized');
  return dbService.projects.update(id, data);
});

ipcMain.handle('projects:updateTrustPolicy', (event, id: string, policy: ProjectTrustPolicy) => {
  validateIpcSender(event);
  if (!dbService) throw new Error('Database not initialized');
  return dbService.projects.updateTrustPolicy(id, policy);
});

ipcMain.handle('projects:archive', (event, id: string) => {
  validateIpcSender(event);
  if (!dbService) throw new Error('Database not initialized');
  return dbService.projects.archive(id);
});

ipcMain.handle('projects:unarchive', (event, id: string) => {
  validateIpcSender(event);
  if (!dbService) throw new Error('Database not initialized');
  return dbService.projects.unarchive(id);
});

ipcMain.handle('projects:selectDirectory', async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow;
  const dialogOptions = {
    title: 'Select Project Repository Directory',
    properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
  };
  const result = focusedWindow
    ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const chosenPath = result.filePaths[0];
  if (fs.existsSync(chosenPath) && fs.statSync(chosenPath).isDirectory()) {
    return chosenPath;
  }
  throw new Error('Selected path is not a valid directory.');
});

// Register Session Management IPC handlers
ipcMain.handle('sessions:list', (_event, projectId: string, includeArchived?: boolean) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.sessions.listByProject(projectId, Boolean(includeArchived));
});

ipcMain.handle('sessions:get', (_event, id: string) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.sessions.get(id);
});

ipcMain.handle('sessions:create', (_event, data: CreateSessionInput) => {
  if (!dbService) throw new Error('Database not initialized');
  const session = dbService.sessions.create(data);
  if (bridgeService) {
    try {
      bridgeService.initSessionBridge(session.projectId, session.id);
    } catch (err) {
      logger.error('Failed to initialize session bridge workspace on session create', err);
    }
  }
  return session;
});

ipcMain.handle('sessions:updateStatus', (_event, id: string, status: SessionStatus) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.sessions.updateStatus(id, status);
});

ipcMain.handle('sessions:updateTitle', (_event, id: string, title: string) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.sessions.updateTitle(id, title);
});

// Register Message Persistence IPC handlers
ipcMain.handle('messages:list', (_event, sessionId: string, options?: PaginationOptions) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.messages.listBySession(sessionId, options);
});

ipcMain.handle('messages:append', (_event, data: AppendMessageInput) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.messages.append(data);
});

// Register Task Management IPC handlers
ipcMain.handle('tasks:list', (_event, sessionId: string, status?: TaskStatus) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.tasks.listBySession(sessionId, status);
});

ipcMain.handle('tasks:get', (_event, id: string) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.tasks.get(id);
});

ipcMain.handle('tasks:create', (_event, data: CreateTaskInput) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.tasks.create(data);
});

ipcMain.handle('tasks:updateStatus', (_event, id: string, status: TaskStatus) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.tasks.updateStatus(id, status);
});

// Register Event Audit Log IPC handlers
ipcMain.handle(
  'events:list',
  (_event, sessionIdOrFilter?: string | EventFilterOptions, options?: EventFilterOptions) => {
    if (!dbService) throw new Error('Database not initialized');
    if (typeof sessionIdOrFilter === 'object' && sessionIdOrFilter !== null) {
      return dbService.events.list(sessionIdOrFilter);
    }
    if (typeof sessionIdOrFilter === 'string') {
      return dbService.events.listBySession(sessionIdOrFilter, options);
    }
    return dbService.events.list(options || {});
  }
);

ipcMain.handle('events:append', (_event, data: AppendEventInput) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.events.append(data);
});

ipcMain.handle('events:getTaskTrace', (_event, taskId: string) => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.events.getTaskTrace(taskId);
});

ipcMain.handle('events:exportTaskTrace', (_event, taskId: string, format: 'markdown' | 'json') => {
  if (!dbService) throw new Error('Database not initialized');
  return dbService.events.exportTaskTrace(taskId, format);
});

// Register ChatGPT Bridge IPC handlers
ipcMain.handle('bridge:status', (_event, sessionId?: string) => {
  if (!bridgeService) throw new Error('Bridge service not initialized');
  return bridgeService.getStatus(sessionId);
});

ipcMain.handle('bridge:initSessionBridge', (_event, projectId: string, sessionId: string) => {
  if (!bridgeService) throw new Error('Bridge service not initialized');
  return bridgeService.initSessionBridge(projectId, sessionId);
});

ipcMain.handle(
  'bridge:sendMessage',
  (_event, projectId: string, sessionId: string, content: string) => {
    if (!bridgeService) throw new Error('Bridge service not initialized');
    return bridgeService.sendMessage(projectId, sessionId, content);
  }
);

ipcMain.handle(
  'bridge:startConnectionTest',
  (_event, projectId: string, sessionId: string) => {
    if (!bridgeService) throw new Error('Bridge service not initialized');
    return bridgeService.startConnectionTest(projectId, sessionId);
  }
);

ipcMain.handle('bridge:openDirectory', async (event, dirPath: string) => {
  validateIpcSender(event);
  if (!dirPath || typeof dirPath !== 'string') {
    throw new Error('Directory path must be a non-empty string.');
  }
  if (!isPathAllowedForOpen(dirPath)) {
    logger.warn('Forbidden: Directory access outside allowed project or bridge boundaries attempted', { dirPath });
    throw new Error('Access denied: Selected path is outside project and bridge directories.');
  }
  if (fs.existsSync(dirPath)) {
    await shell.openPath(dirPath);
    return true;
  }
  return false;
});

ipcMain.handle(
  'bridge:getInstructions',
  (_event, projectId: string, sessionId: string) => {
    if (!bridgeService) throw new Error('Bridge service not initialized');
    return bridgeService.getInstructions(projectId, sessionId);
  }
);

// Antigravity CLI Integration IPC Handlers
ipcMain.handle('antigravity:detect', async (event, customPath?: string) => {
  validateIpcSender(event);
  if (!antigravityManager) throw new Error('Antigravity manager not initialized');
  return antigravityManager.detect(customPath);
});

ipcMain.handle('antigravity:getStatus', async (event, sessionId: string) => {
  validateIpcSender(event);
  if (!antigravityManager) throw new Error('Antigravity manager not initialized');
  return antigravityManager.getStatus(sessionId);
});

ipcMain.handle('antigravity:start', async (event, sessionId: string, options?: any) => {
  validateIpcSender(event);
  if (!antigravityManager) throw new Error('Antigravity manager not initialized');
  const safeOptions = { ...options };
  delete safeOptions.executablePath;
  return antigravityManager.start(sessionId, safeOptions);
});

ipcMain.handle('antigravity:sendMessage', async (event, sessionId: string, prompt: string) => {
  validateIpcSender(event);
  if (!antigravityManager) throw new Error('Antigravity manager not initialized');
  return antigravityManager.sendMessage(sessionId, prompt);
});

ipcMain.handle('antigravity:stop', async (event, sessionId: string) => {
  validateIpcSender(event);
  if (!antigravityManager) throw new Error('Antigravity manager not initialized');
  return antigravityManager.stop(sessionId);
});

ipcMain.handle('antigravity:interrupt', async (event, sessionId: string) => {
  validateIpcSender(event);
  if (!antigravityManager) throw new Error('Antigravity manager not initialized');
  return antigravityManager.interrupt(sessionId);
});

ipcMain.handle('antigravity:resume', async (event, sessionId: string) => {
  validateIpcSender(event);
  if (!antigravityManager) throw new Error('Antigravity manager not initialized');
  return antigravityManager.resume(sessionId);
});

ipcMain.handle('antigravity:getHistory', async (event, sessionId: string) => {
  validateIpcSender(event);
  if (!antigravityManager) throw new Error('Antigravity manager not initialized');
  return antigravityManager.getHistory(sessionId);
});

// ChatGPT-Led Orchestration IPC handlers
ipcMain.handle('orchestration:approve-task', async (event, taskId: string) => {
  validateIpcSender(event);
  if (!orchestrator) throw new Error('Orchestrator not initialized');
  return await orchestrator.approveTask(taskId);
});

ipcMain.handle('orchestration:reject-task', async (event, taskId: string, reason?: string) => {
  validateIpcSender(event);
  if (!orchestrator) throw new Error('Orchestrator not initialized');
  return orchestrator.rejectTask(taskId, reason);
});

ipcMain.handle('orchestration:cancel-task', async (event, taskId: string, reason?: string) => {
  validateIpcSender(event);
  if (!orchestrator) throw new Error('Orchestrator not initialized');
  return orchestrator.cancelTask(taskId, reason);
});

ipcMain.handle('orchestration:retry-task', async (event, taskId: string) => {
  validateIpcSender(event);
  if (!orchestrator) throw new Error('Orchestrator not initialized');
  return await orchestrator.retryTask(taskId);
});

ipcMain.handle('orchestration:list-tasks', (_event, sessionId: string, status?: TaskStatus) => {
  if (!orchestrator) throw new Error('Orchestrator not initialized');
  return orchestrator.listTasks(sessionId, status);
});

ipcMain.handle('orchestration:list-queued', (_event, sessionId?: string) => {
  if (!orchestrator) throw new Error('Orchestrator not initialized');
  return orchestrator.getQueue().listQueuedTasks(sessionId);
});

ipcMain.handle('orchestration:get-running-task', (_event, sessionId: string) => {
  if (!orchestrator) throw new Error('Orchestrator not initialized');
  return orchestrator.getQueue().getRunningTask(sessionId);
});

ipcMain.handle('orchestration:dispatch-next', async (_event, sessionId: string) => {
  if (!orchestrator) throw new Error('Orchestrator not initialized');
  return await orchestrator.getDispatcher().dispatchNext(sessionId);
});

// Read-Only Git Inspection IPC Handlers
ipcMain.handle('git:get-task-diff', async (_event, taskId: string) => {
  if (!gitService) throw new Error('Git inspection service not initialized');
  if (!taskId || typeof taskId !== 'string') {
    throw new Error('Task ID must be a non-empty string.');
  }
  return await gitService.getTaskDiff(taskId);
});

ipcMain.handle('git:get-file-diff', async (_event, taskId: string, filePath: string) => {
  if (!gitService) throw new Error('Git inspection service not initialized');
  if (!taskId || typeof taskId !== 'string') {
    throw new Error('Task ID must be a non-empty string.');
  }
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('File path must be a non-empty string.');
  }
  return await gitService.getFileDiff(taskId, filePath);
});

ipcMain.handle('git:get-repo-status', async (_event, projectId: string) => {
  if (!gitService) throw new Error('Git inspection service not initialized');
  if (!dbService) throw new Error('Database service not initialized');
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Project ID must be a non-empty string.');
  }
  const project = dbService.projects.get(projectId);
  if (!project) throw new Error(`Project not found with id: "${projectId}".`);
  if (!project.repositoryPath) throw new Error(`Project "${project.name}" has no repository path configured.`);
  return await gitService.getRepoStatus(project.repositoryPath, project.repositoryPath);
});

// Context Vault IPC Handlers
ipcMain.handle('context:list', (_event, filter: ContextFilterOptions) => {
  if (!dbService) throw new Error('Database service not initialized');
  return dbService.context.list(filter);
});

ipcMain.handle('context:get', (_event, id: string) => {
  if (!dbService) throw new Error('Database service not initialized');
  return dbService.context.get(id);
});

ipcMain.handle('context:create', (_event, input: CreateContextInput) => {
  if (!dbService) throw new Error('Database service not initialized');
  const doc = dbService.context.create(input);
  dbService.events.append({
    projectId: doc.projectId,
    sessionId: doc.sessionId || undefined,
    eventType: 'context_created',
    actor: (input.author as any) || 'user',
    source: 'context_vault',
    provenance: (input.provenance as any) || 'user_recorded',
    title: `Context document created: ${doc.title}`,
    data: { contextId: doc.id, title: doc.title, revision: doc.currentRevision, category: doc.category, scope: doc.scope },
  });
  if (bridgeService && doc.projectId) {
    bridgeService.syncContextWorkspace(doc.projectId);
  }
  return doc;
});

ipcMain.handle('context:update', (_event, id: string, input: UpdateContextInput) => {
  if (!dbService) throw new Error('Database service not initialized');
  const doc = dbService.context.update(id, input);
  dbService.events.append({
    projectId: doc.projectId,
    sessionId: doc.sessionId || undefined,
    eventType: 'context_updated',
    actor: (input.author as any) || 'user',
    source: 'context_vault',
    provenance: (input.provenance as any) || 'user_recorded',
    title: `Context document updated: ${doc.title}`,
    data: { contextId: doc.id, title: doc.title, revision: doc.currentRevision, category: doc.category, scope: doc.scope },
  });
  if (bridgeService && doc.projectId) {
    bridgeService.syncContextWorkspace(doc.projectId);
  }
  return doc;
});

ipcMain.handle('context:archive', (_event, id: string) => {
  if (!dbService) throw new Error('Database service not initialized');
  const doc = dbService.context.archive(id);
  dbService.events.append({
    projectId: doc.projectId,
    sessionId: doc.sessionId || undefined,
    eventType: 'context_archived',
    actor: 'user',
    source: 'context_vault',
    provenance: 'user_recorded',
    title: `Archived context document: ${doc.title}`,
    data: { contextId: doc.id, title: doc.title, revision: doc.currentRevision },
  });
  if (bridgeService && doc.projectId) {
    bridgeService.syncContextWorkspace(doc.projectId);
  }
  return doc;
});

ipcMain.handle('context:restore', (_event, id: string) => {
  if (!dbService) throw new Error('Database service not initialized');
  const doc = dbService.context.restore(id);
  dbService.events.append({
    projectId: doc.projectId,
    sessionId: doc.sessionId || undefined,
    eventType: 'context_restored',
    actor: 'user',
    source: 'context_vault',
    provenance: 'user_recorded',
    title: `Restored context document: ${doc.title}`,
    data: { contextId: doc.id, title: doc.title, revision: doc.currentRevision },
  });
  if (bridgeService && doc.projectId) {
    bridgeService.syncContextWorkspace(doc.projectId);
  }
  return doc;
});

ipcMain.handle('context:getRevisions', (_event, contextId: string) => {
  if (!dbService) throw new Error('Database service not initialized');
  return dbService.context.getRevisions(contextId);
});

ipcMain.handle('context:getRevision', (_event, contextId: string, revision: number) => {
  if (!dbService) throw new Error('Database service not initialized');
  return dbService.context.getRevision(contextId, revision);
});

ipcMain.handle('context:listConflicts', (_event, projectId: string, unresolvedOnly?: boolean) => {
  if (!dbService) throw new Error('Database service not initialized');
  return dbService.context.listConflicts(projectId, unresolvedOnly);
});

ipcMain.handle('context:resolveConflict', (_event, conflictId: string) => {
  if (!dbService) throw new Error('Database service not initialized');
  return dbService.context.resolveConflict(conflictId);
});

ipcMain.handle('context:getHandoff', (_event, sessionId: string) => {
  if (!dbService) throw new Error('Database service not initialized');
  return dbService.context.getHandoff(sessionId);
});

ipcMain.handle('context:getManifest', (_event, projectId: string) => {
  if (!bridgeService) throw new Error('Bridge service not initialized');
  return bridgeService.getContextManifest(projectId);
});

// Reliability & State Reconciliation IPC handlers
ipcMain.handle('reliability:getDiagnostics', async () => {
  if (!reconciliationService) throw new Error('Reconciliation service not initialized');
  return await reconciliationService.getDiagnostics();
});

ipcMain.handle('reliability:reconcile', async (event) => {
  validateIpcSender(event);
  if (!reconciliationService) throw new Error('Reconciliation service not initialized');
  return await reconciliationService.reconcile();
});

// Security Boundaries & Threat Hardening IPC handlers
ipcMain.handle('security:getDiagnostics', (event, projectId?: string) => {
  validateIpcSender(event);
  if (!dbService) throw new Error('Database not initialized');

  const allProjects = dbService.projects.list(true);
  const trustedProjectsCount = allProjects.filter((p) => p.trustPolicy === 'trusted').length;
  const approvalRequiredProjectsCount = allProjects.length - trustedProjectsCount;

  let currentProject = projectId ? dbService.projects.get(projectId) : null;
  if (!currentProject && allProjects.length > 0) {
    currentProject = allProjects[0];
  }

  // Count pending approvals across active tasks in queued/awaiting_approval states
  const pendingApprovalsCount = dbService.tasks.listQueued().filter((t) => t.status === 'awaiting_approval').length;

  const currentPolicy: ProjectTrustPolicy = currentProject?.trustPolicy || 'approval_required';
  const status: 'enforced' | 'warning' = currentPolicy === 'trusted' ? 'warning' : 'enforced';

  const diagnostics: SecurityDiagnostics = {
    status,
    timestamp: new Date().toISOString(),
    bridgeTrust: {
      mode: 'unauthenticated_filesystem',
      description:
        'Bridge inbox files are unauthenticated local files. Sender metadata claims are not cryptographically verified.',
      senderIdentityGuaranteed: false,
    },
    projectTrust: {
      projectId: currentProject?.id || null,
      projectName: currentProject?.name || null,
      trustPolicy: currentPolicy,
      trustedProjectsCount,
      approvalRequiredProjectsCount,
    },
    taskAuthorization: {
      pendingApprovalsCount,
      sensitivePolicy:
        'Sensitive operations (credentials, filesystem deletion, environment modifications) require explicit user approval in all modes.',
      contentHashIntegrityEnforced: true,
    },
    antigravityPermissions: {
      mode: 'native_interactive_permissions',
      dangerouslySkipPermissions: false,
      alwaysProceed: false,
      sandboxActive: true,
      nativePermissionsPreserved: true,
    },
    filesystemScope: {
      enforceRepositoryBoundaries: true,
      rejectSymlinkEscapes: true,
      maxMessageSizeBytes: 262144, // 256 KB
    },
    desktopCommander: {
      running: manager.getStatus().state === 'Running',
      isolatedConfig: true,
      independentAccessControl: true,
    },
  };

  return diagnostics;
});

// App lifecycle & shutdown cleanup
app.on('before-quit', async (event) => {
  logger.info('Application received before-quit event. Initiating clean termination.');
  event.preventDefault();

  try {
    if (orchestrator) {
      orchestrator.close();
      logger.info('Orchestrator closed cleanly.');
    }
  } catch (orchErr) {
    logger.error('Error closing orchestrator on app quit', orchErr);
  }

  try {
    if (antigravityManager) {
      await antigravityManager.cleanup(3000);
      logger.info('Antigravity processes cleaned up.');
    }
  } catch (agyErr) {
    logger.error('Error cleaning up Antigravity processes on quit', agyErr);
  }

  try {
    if (bridgeService) {
      await bridgeService.close();
      logger.info('Bridge watchers stopped cleanly.');
    }
  } catch (bridgeErr) {
    logger.error('Error closing bridge service on app quit', bridgeErr);
  }

  try {
    await manager.cleanup();
  } catch (err) {
    logger.error('Error during Desktop Commander cleanup on app quit', err);
  } finally {
    if (dbService) {
      try {
        dbService.close();
        logger.info('Database closed cleanly.');
      } catch (dbErr) {
        logger.error('Error closing database on app quit', dbErr);
      }
    }
    app.exit(0);
  }
});

if (gotTheLock) {
  try {
    dbService = initDatabaseService();
    logger.info('Database service successfully initialized.');

    bridgeService = new BridgeService({
      dbService,
      commanderManager: manager,
    });

    bridgeService.onEvent((bridgeEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bridge:event', bridgeEvent);
      }
    });
    logger.info('Bridge service successfully initialized.');

    antigravityManager = new AntigravityManager({
      dbService,
      bridgeService,
    });
    bridgeService.setAntigravityManager(antigravityManager);

    antigravityManager.on('event', (agyEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('antigravity:event', agyEvent);
      }
    });
    logger.info('Antigravity manager successfully initialized.');

    gitService = new GitService(dbService);
    logger.info('Git inspection service successfully initialized.');

    orchestrator = new Orchestrator({
      dbService,
      bridgeService,
      antigravityManager,
      gitService,
    });

    orchestrator.on('task_created', (task) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('orchestration:event', {
          type: 'task_created',
          data: { task },
          timestamp: new Date().toISOString(),
        });
      }
    });

    orchestrator.on('task_completed', (task) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('orchestration:event', {
          type: 'task_completed',
          data: { task },
          timestamp: new Date().toISOString(),
        });
      }
    });

    orchestrator.on('task_failed', (task) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('orchestration:event', {
          type: 'task_failed',
          data: { task },
          timestamp: new Date().toISOString(),
        });
      }
    });

    orchestrator.on('task_status_changed', (task) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('orchestration:event', {
          type: 'task_status_changed',
          data: { task },
          timestamp: new Date().toISOString(),
        });
      }
    });

    orchestrator.start();
    logger.info('Orchestrator successfully initialized.');

    reconciliationService = new ReconciliationService({
      dbService,
      bridgeService,
      antigravityManager,
    });
    logger.info('Reconciliation service successfully initialized.');

    // Run startup state reconciliation to recover interrupted tasks and ensure mailbox/context integrity
    reconciliationService.reconcile().then((report) => {
      logger.info('Startup reconciliation completed successfully.', {
        durationMs: report.durationMs,
        issuesDetected: report.issuesDetected,
        issuesRepaired: report.issuesRepaired,
      });
    }).catch((reconcileErr) => {
      logger.error('Startup reconciliation failed', reconcileErr);
    });
  } catch (err) {
    logger.error('Failed to initialize services at startup', err);
  }

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  logger.info('All windows closed.');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
