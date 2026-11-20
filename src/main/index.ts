import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesktopCommanderManager } from './desktopCommanderManager.js';

let mainWindow: BrowserWindow | null = null;
const manager = new DesktopCommanderManager();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'Knot',
    width: 1140,
    height: 780,
    minWidth: 840,
    minHeight: 620,
    backgroundColor: '#090B0D',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle status and log forwarding to renderer
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
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
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
  // Prevent immediate termination so child process cleanup completes
  event.preventDefault();
  try {
    await manager.cleanup();
  } catch (err) {
    console.error('Error during Desktop Commander cleanup on app quit:', err);
  } finally {
    app.exit(0);
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
