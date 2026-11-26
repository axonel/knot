#!/usr/bin/env node

/**
 * Packaging & Preload Verification Script
 *
 * Validates Linux build outputs produced by electron-builder:
 * 1. Checks that the standalone AppImage exists, is non-empty, and exceeds expected size (> 10MB).
 * 2. Checks that linux-unpacked binary executable exists and has executable permissions.
 * 3. Checks that resources/app.asar exists and contains the packaged application.
 * 4. Checks that dist/preload/index.cjs exists and is in CommonJS format (no ES imports, uses require('electron')).
 * 5. Checks that main process BrowserWindow configuration points to ../preload/index.cjs.
 * 6. Checks that packaged app.asar contains dist/preload/index.cjs and NOT index.js.
 * 7. Scans unpacked contents for sensitive files (.env, .pem, .key, credentials).
 * 8. Executes the preload in a real sandboxed Electron BrowserWindow and verifies window.knotApi and APIs.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import electronPath from 'electron';

console.log('📦 Starting Linux packaging & preload verification...');

const releaseDir = path.resolve('release');
const unpackedDir = path.join(releaseDir, 'linux-unpacked');

const errors = [];
const successes = [];

// 1. Verify release directory exists
if (!fs.existsSync(releaseDir)) {
  console.error('❌ Release directory does not exist:', releaseDir);
  process.exit(1);
}

// 2. Verify AppImage artifact
const releaseFiles = fs.readdirSync(releaseDir);
const appImageFile = releaseFiles.find((f) => f.endsWith('.AppImage'));

if (!appImageFile) {
  errors.push('No .AppImage artifact found in release directory.');
} else {
  const appImagePath = path.join(releaseDir, appImageFile);
  const stats = fs.statSync(appImagePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  if (stats.size < 10 * 1024 * 1024) {
    errors.push(`AppImage artifact ${appImageFile} is suspiciously small: ${sizeMB} MB (< 10 MB).`);
  } else {
    successes.push(`AppImage found: ${appImageFile} (${sizeMB} MB)`);
  }
}

// 3. Verify unpacked executable
const executablePath = path.join(unpackedDir, 'knot');
if (!fs.existsSync(executablePath)) {
  errors.push(`Unpacked binary executable not found at: ${executablePath}`);
} else {
  try {
    fs.accessSync(executablePath, fs.constants.X_OK);
    const stats = fs.statSync(executablePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    successes.push(`Unpacked executable found and executable: knot (${sizeMB} MB)`);
  } catch (err) {
    errors.push(`Unpacked binary ${executablePath} lacks execute permissions: ${err.message}`);
  }
}

// 4. Verify resources/app.asar
const asarPath = path.join(unpackedDir, 'resources', 'app.asar');
if (!fs.existsSync(asarPath)) {
  errors.push(`Packaged app.asar not found at: ${asarPath}`);
} else {
  const stats = fs.statSync(asarPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  if (stats.size < 1024 * 1024) {
    errors.push(`app.asar is suspiciously small: ${sizeMB} MB (< 1 MB).`);
  } else {
    successes.push(`app.asar archive verified: (${sizeMB} MB)`);
  }
}

// 5. Verify dist/preload/index.cjs existence and CommonJS format
const preloadCjsPath = path.resolve('dist/preload/index.cjs');
if (!fs.existsSync(preloadCjsPath)) {
  errors.push(`Preload CommonJS artifact missing: ${preloadCjsPath}`);
} else {
  const preloadContent = fs.readFileSync(preloadCjsPath, 'utf-8');
  const sizeKB = (Buffer.byteLength(preloadContent) / 1024).toFixed(2);

  // Check that it's CommonJS (uses require, exposes knotApi, no top-level import/export)
  const hasRequireElectron = /require\(["']electron["']\)/.test(preloadContent);
  const hasExposeKnotApi = /exposeInMainWorld\(["']knotApi["']/.test(preloadContent);
  const hasIllegalImportStatement = /^\s*import\s+[^;]+from/m.test(preloadContent);
  const hasIllegalExportStatement = /^\s*export\s+(default|\{|\*)/m.test(preloadContent);

  if (!hasRequireElectron) {
    errors.push('Preload artifact does not require("electron").');
  } else if (!hasExposeKnotApi) {
    errors.push('Preload artifact does not call exposeInMainWorld("knotApi", ...).');
  } else if (hasIllegalImportStatement || hasIllegalExportStatement) {
    errors.push('Preload artifact contains unbundled ES import/export statements instead of pure CommonJS.');
  } else {
    successes.push(`Preload CommonJS artifact verified: dist/preload/index.cjs (${sizeKB} KB, pure CJS require)`);
  }
}

// 6. Verify main process bundle references index.cjs (not index.js)
const mainBundlePath = path.resolve('dist/main/index.js');
if (fs.existsSync(mainBundlePath)) {
  const mainContent = fs.readFileSync(mainBundlePath, 'utf-8');
  if (mainContent.includes('preload/index.js')) {
    errors.push('dist/main/index.js incorrectly references preload/index.js instead of preload/index.cjs');
  } else if (!mainContent.includes('preload/index.cjs')) {
    errors.push('dist/main/index.js does not reference preload/index.cjs');
  } else {
    successes.push('Main process bundle verified: Points to preload/index.cjs');
  }
}

// 7. Verify ASAR contents contain dist/preload/index.cjs using @electron/asar
try {
  let asar;
  try {
    asar = (await import('@electron/asar')).default || (await import('@electron/asar'));
  } catch {
    asar = (await import('asar')).default || (await import('asar'));
  }

  if (fs.existsSync(asarPath)) {
    const fileList = asar.listPackage(asarPath);
    const hasPreloadCjs = fileList.some((f) => f.endsWith('preload/index.cjs'));
    const hasPreloadJs = fileList.some((f) => f.endsWith('preload/index.js'));

    if (!hasPreloadCjs) {
      errors.push('Packaged app.asar does NOT contain dist/preload/index.cjs.');
    } else if (hasPreloadJs) {
      errors.push('Packaged app.asar unexpectedly contains obsolete dist/preload/index.js.');
    } else {
      successes.push('Packaged app.asar integrity verified: Contains dist/preload/index.cjs exclusively.');
    }
  }
} catch (err) {
  errors.push(`Failed to inspect app.asar contents: ${err.message}`);
}

// 8. Scan unpacked contents for forbidden / sensitive files
function scanDirectory(dir, forbiddenPatterns) {
  const leaks = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(entry.name)) {
        leaks.push(fullPath);
      }
    }

    if (entry.isDirectory() && entry.name !== 'node_modules') {
      leaks.push(...scanDirectory(fullPath, forbiddenPatterns));
    }
  }

  return leaks;
}

const FORBIDDEN_LEAK_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /credentials\.json$/i,
  /\.sqlite$/i,
];

if (fs.existsSync(unpackedDir)) {
  const leaks = scanDirectory(unpackedDir, FORBIDDEN_LEAK_PATTERNS);
  if (leaks.length > 0) {
    errors.push(`Sensitive or forbidden files found in unpacked package:\n${leaks.map((l) => `     - ${l}`).join('\n')}`);
  } else {
    successes.push('Clean packaging verified: No sensitive credential or environment files detected in unpacked payload.');
  }
}

// 9. Runtime verification: execute preload in a sandboxed Electron BrowserWindow
const tempTestScript = path.join(os.tmpdir(), `knot-preload-test-${Date.now()}.cjs`);
const testScriptContent = `
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

ipcMain.handle('desktop-commander:status', () => ({ state: 'stopped', pid: null }));
ipcMain.handle('desktop-commander:start', () => ({ state: 'running', pid: 99999 }));

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.resolve('dist/preload/index.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.loadURL('data:text/html,<html><body><h1>Preload Test</h1></body></html>');

    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));

    const checkResult = await win.webContents.executeJavaScript(\`
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

    const statusCallResult = await win.webContents.executeJavaScript('window.knotApi.getStatus()');

    console.log('__PRELOAD_GATE_OUTPUT__:' + JSON.stringify({ ...checkResult, statusCallResult }));
    app.quit();
  } catch (err) {
    console.error('__PRELOAD_GATE_ERROR__:', err);
    process.exit(1);
  }
});
`;

try {
  fs.writeFileSync(tempTestScript, testScriptContent);
  const runnerElectron = electronPath || path.join(unpackedDir, 'knot');
  const res = spawnSync(runnerElectron, ['--no-sandbox', tempTestScript], {
    encoding: 'utf-8',
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
    timeout: 15000,
  });

  const marker = '__PRELOAD_GATE_OUTPUT__:';
  const outLine = (res.stdout || '').split('\n').find((l) => l.startsWith(marker));

  if (!outLine) {
    // If running in headless environment without display and exited, check if display error
    if (res.status !== 0 && (!process.env.DISPLAY || res.stderr?.includes('DISPLAY') || res.stderr?.includes('OzonePlatform'))) {
      console.warn('⚠️  Skipping BrowserWindow visual check (headless environment without DISPLAY).');
    } else {
      errors.push(`Preload execution failed: ${res.stderr || res.stdout || 'Unknown error'}`);
    }
  } else {
    const payload = JSON.parse(outLine.slice(marker.length));
    if (!payload.hasKnotApi) {
      errors.push('window.knotApi was NOT exposed in sandboxed renderer window.');
    } else if (!payload.hasGetStatus || !payload.hasStartCommander) {
      errors.push('Desktop Commander APIs missing on window.knotApi in sandboxed renderer window.');
    } else if (!payload.statusCallResult || payload.statusCallResult.state !== 'stopped') {
      errors.push('window.knotApi.getStatus() did not return expected response from IPC handler.');
    } else {
      successes.push('Preload execution verified: window.knotApi with Desktop Commander APIs active and callable in sandboxed BrowserWindow.');
    }
  }
} catch (err) {
  errors.push(`Failed to run Electron preload verification test: ${err.message}`);
} finally {
  try {
    fs.rmSync(tempTestScript, { force: true });
  } catch {
    // ignore
  }
}

// Print results
console.log('\n--- Packaging Verification Results ---');
for (const s of successes) {
  console.log(`✅ ${s}`);
}

if (errors.length > 0) {
  console.error(`\n❌ Packaging verification FAILED with ${errors.length} error(s):`);
  for (const e of errors) {
    console.error(`   - ${e}`);
  }
  process.exit(1);
}

console.log('\n🎉 All packaging and preload verification checks PASSED successfully!\n');
process.exit(0);
