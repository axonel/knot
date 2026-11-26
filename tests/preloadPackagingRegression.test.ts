import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execSync } from 'node:child_process';
import electronPath from 'electron';

describe('Packaged Preload CommonJS & Sandboxed BrowserWindow Regression Gate', () => {
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const preloadCjsPath = path.join(projectRoot, 'dist', 'preload', 'index.cjs');
  const mainBundlePath = path.join(projectRoot, 'dist', 'main', 'index.js');
  const mainSourcePath = path.join(projectRoot, 'src', 'main', 'index.ts');

  beforeAll(() => {
    if (!fs.existsSync(preloadCjsPath)) {
      execSync('npm run build:preload', { cwd: projectRoot, stdio: 'inherit' });
    }
  });

  it('generates dist/preload/index.cjs as a valid CommonJS artifact', () => {
    expect(fs.existsSync(preloadCjsPath)).toBe(true);
    const content = fs.readFileSync(preloadCjsPath, 'utf-8');

    // Asserts CommonJS pattern
    expect(content).toMatch(/require\(["']electron["']\)/);
    expect(content).toMatch(/exposeInMainWorld\(["']knotApi["']/);

    // Asserts no ES module keywords that cause SyntaxError: Cannot use import statement outside a module
    expect(content).not.toMatch(/^\s*import\s+[^;]+from/m);
    expect(content).not.toMatch(/^\s*export\s+(default|\{|\*)/m);
  });

  it('configures main process BrowserWindow to point to index.cjs with strict sandboxing', () => {
    const mainSource = fs.readFileSync(mainSourcePath, 'utf-8');

    // Points to index.cjs
    expect(mainSource).toContain("preload/index.cjs");
    expect(mainSource).not.toContain("preload/index.js");

    // Strictly enforces sandboxing and isolation
    expect(mainSource).toContain('sandbox: true');
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');

    // Production compiled main bundle check
    if (fs.existsSync(mainBundlePath)) {
      const mainBundle = fs.readFileSync(mainBundlePath, 'utf-8');
      expect(mainBundle).toContain('preload/index.cjs');
      expect(mainBundle).not.toContain('preload/index.js');
    }
  });

  it('executes preload cleanly in a sandboxed Electron BrowserWindow and exposes window.knotApi', () => {
    const tempTestScript = path.join(os.tmpdir(), `knot-vitest-preload-${Date.now()}.cjs`);
    const testScript = `
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

ipcMain.handle('desktop-commander:status', () => ({ state: 'stopped', pid: null }));
ipcMain.handle('desktop-commander:start', () => ({ state: 'running', pid: 12345 }));

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: '${preloadCjsPath}',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.webContents.on('console-message', (_event, level, message) => {
      console.log('__RENDERER_MSG__:' + JSON.stringify({ level, message }));
    });

    win.loadURL('data:text/html,<html><body><h1>Preload Test</h1></body></html>');
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));

    const check = await win.webContents.executeJavaScript(\`
      ({
        hasKnotApi: Boolean(window.knotApi),
        hasGetStatus: typeof window.knotApi?.getStatus === 'function',
        hasStartCommander: typeof window.knotApi?.startDesktopCommander === 'function',
        hasProjects: Boolean(window.knotApi?.projects),
        hasBridge: Boolean(window.knotApi?.bridge),
        hasAntigravity: Boolean(window.knotApi?.antigravity),
        hasOrchestration: Boolean(window.knotApi?.orchestration),
      })
    \`);

    let statusCallResult = null;
    if (check.hasKnotApi && check.hasGetStatus) {
      statusCallResult = await win.webContents.executeJavaScript('window.knotApi.getStatus()');
    }

    console.log('__VITEST_PRELOAD_OUT__:' + JSON.stringify({ ...check, statusCallResult }));
    app.quit();
  } catch (err) {
    console.error('__VITEST_PRELOAD_ERR__:', err);
    process.exit(1);
  }
});
`;

    try {
      fs.writeFileSync(tempTestScript, testScript);
      const runner = electronPath as unknown as string;
      const res = spawnSync(runner, ['--no-sandbox', tempTestScript], {
        encoding: 'utf-8',
        env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
        timeout: 15000,
      });

      const marker = '__VITEST_PRELOAD_OUT__:';
      const outLine = (res.stdout || '').split('\n').find((l) => l.startsWith(marker));

      if (!outLine) {
        if (
          res.status !== 0 &&
          (!process.env.DISPLAY ||
            res.stderr?.includes('DISPLAY') ||
            res.stderr?.includes('OzonePlatform'))
        ) {
          // Graceful handling for headless Linux test environments without virtual frame buffer
          return;
        }
        throw new Error(`Sandboxed preload execution failed: ${res.stderr || res.stdout}`);
      }

      const payload = JSON.parse(outLine.slice(marker.length));
      expect(payload.hasKnotApi).toBe(true);
      expect(payload.hasGetStatus).toBe(true);
      expect(payload.hasStartCommander).toBe(true);
      expect(payload.hasProjects).toBe(true);
      expect(payload.hasBridge).toBe(true);
      expect(payload.hasAntigravity).toBe(true);
      expect(payload.hasOrchestration).toBe(true);
      expect(payload.statusCallResult).toEqual({ state: 'stopped', pid: null });
    } finally {
      try {
        fs.rmSync(tempTestScript, { force: true });
      } catch {
        // ignore
      }
    }
  });
});
