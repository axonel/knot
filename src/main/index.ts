import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DesktopCommanderManager } from './desktopCommanderManager.js';
import { logger } from './diagnosticLogger.js';

let mainWindow: BrowserWindow | null = null;
const manager = new DesktopCommanderManager();

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

// 1. Single Instance Lock: Prevent duplicate processes
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

// 2. Handle CLI flags (--version, --help) when run directly from terminal
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
      sandbox: false,
    },
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

// Register IPC handlers
ipcMain.handle('desktop-commander:start', async () => {
  return await manager.start();
});

ipcMain.handle('desktop-commander:stop', async () => {
  return await manager.stop();
});

ipcMain.handle('desktop-commander:status', () => {
  return manager.getStatus();
});

ipcMain.handle('desktop-commander:logs', () => {
  return manager.getLogs();
});

ipcMain.handle('desktop-commander:clearLogs', () => {
  manager.clearLogs();
  return { success: true };
});

// App lifecycle & shutdown cleanup
app.on('before-quit', async (event) => {
  logger.info('Application received before-quit event. Initiating clean termination.');
  event.preventDefault();
  try {
    await manager.cleanup();
  } catch (err) {
    logger.error('Error during Desktop Commander cleanup on app quit', err);
  } finally {
    app.exit(0);
  }
});

if (gotTheLock) {
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
