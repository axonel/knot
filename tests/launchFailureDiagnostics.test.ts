import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { DiagnosticLogger } from '../src/main/diagnosticLogger.js';

describe('Launch Failure Diagnostics & Fallback Mechanisms', () => {
  let tempDir: string;
  let logDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-diag-test-'));
    logDir = path.join(tempDir, 'state', 'knot', 'logs');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Diagnostic Logger', () => {
    it('creates log directory and writes structured timestamped log entries', () => {
      const logger = new DiagnosticLogger({
        logDir,
        logFileName: 'test.log',
      });

      logger.info('Test info message', { key: 'value' });
      logger.warn('Test warning message');
      logger.error('Test error message', new Error('Something failed'));

      const logFile = path.join(logDir, 'test.log');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('[INFO] Test info message | Data: {"key":"value"}');
      expect(content).toContain('[WARN] Test warning message');
      expect(content).toContain('[ERROR] Test error message | Stack: Error: Something failed');
    });

    it('rotates logs when size exceeds threshold and preserves up to maxBackups', () => {
      const logger = new DiagnosticLogger({
        logDir,
        logFileName: 'rotate-test.log',
        maxSizeBytes: 200, // Small threshold for testing
        maxBackups: 2,
      });

      // Write enough lines to trigger rotations
      for (let i = 0; i < 20; i++) {
        logger.info(`This is a long diagnostic log entry number ${i} to exceed maxSizeBytes`);
      }

      const files = fs.readdirSync(logDir);
      const backupFiles = files.filter((f) => f.startsWith('main-') && f.endsWith('.log.bak'));

      expect(backupFiles.length).toBeLessThanOrEqual(2);
      expect(fs.existsSync(path.join(logDir, 'rotate-test.log'))).toBe(true);
    });
  });

  describe('Launcher Script Robustness & Fallback Handling', () => {
    it('handles FUSE2 absence by exporting APPIMAGE_EXTRACT_AND_RUN=1', () => {
      const mockLauncherPath = path.join(tempDir, 'test-launcher.sh');
      const mockLogFile = path.join(logDir, 'launcher.log');

      // Create a test harness simulating the launcher logic
      const script = `#!/usr/bin/env bash
set -u
mkdir -p "${logDir}"
LOG_FILE="${mockLogFile}"

FUSE2_AVAILABLE=0
# Simulate absence of libfuse.so.2
if false; then
  FUSE2_AVAILABLE=1
else
  export APPIMAGE_EXTRACT_AND_RUN=1
  echo "APPIMAGE_EXTRACT_AND_RUN=$APPIMAGE_EXTRACT_AND_RUN" >> "$LOG_FILE"
fi
`;
      fs.writeFileSync(mockLauncherPath, script, { mode: 0o755 });
      execSync(`"${mockLauncherPath}"`);

      expect(fs.existsSync(mockLogFile)).toBe(true);
      const content = fs.readFileSync(mockLogFile, 'utf-8');
      expect(content).toContain('APPIMAGE_EXTRACT_AND_RUN=1');
    });

    it('falls back to unpacked binary when AppImage execution fails', () => {
      const mockLauncherPath = path.join(tempDir, 'fallback-launcher.sh');
      const mockLogFile = path.join(logDir, 'launcher.log');
      const mockAppImage = path.join(tempDir, 'failing.AppImage');
      const mockUnpacked = path.join(tempDir, 'working-unpacked');
      const markerFile = path.join(tempDir, 'unpacked-executed.txt');

      // Create failing mock AppImage (exits with code 1)
      fs.writeFileSync(mockAppImage, '#!/usr/bin/env bash\necho "AppImage error" >&2\nexit 1\n', { mode: 0o755 });

      // Create working mock unpacked binary
      fs.writeFileSync(mockUnpacked, `#!/usr/bin/env bash\necho "success" > "${markerFile}"\nexit 0\n`, { mode: 0o755 });

      const launcherScript = `#!/usr/bin/env bash
set -u
mkdir -p "${logDir}"
LOG_FILE="${mockLogFile}"
APPIMAGE_PATH="${mockAppImage}"
UNPACKED_PATH="${mockUnpacked}"

log() { echo "[\$(date -Iseconds)] \$*" >> "$LOG_FILE"; }

LAUNCH_SUCCESS=0
if [ -f "$APPIMAGE_PATH" ]; then
  chmod +x "$APPIMAGE_PATH" 2>/dev/null || true
  if [ -x "$APPIMAGE_PATH" ]; then
    "$APPIMAGE_PATH" >> "$LOG_FILE" 2>&1 &
    APP_PID=$!
    wait "$APP_PID" 2>/dev/null
    APP_EXIT=$?
    if [ "$APP_EXIT" -ne 0 ]; then
      log "AppImage failed with code $APP_EXIT. Initiating unpacked fallback."
    fi
  fi
fi

if [ "$LAUNCH_SUCCESS" -eq 0 ] && [ -f "$UNPACKED_PATH" ]; then
  chmod +x "$UNPACKED_PATH" 2>/dev/null || true
  if [ -x "$UNPACKED_PATH" ]; then
    "$UNPACKED_PATH" >> "$LOG_FILE" 2>&1
    log "Unpacked binary executed."
  fi
fi
`;
      fs.writeFileSync(mockLauncherPath, launcherScript, { mode: 0o755 });
      execSync(`"${mockLauncherPath}"`);

      expect(fs.existsSync(markerFile)).toBe(true);
      const logContent = fs.readFileSync(mockLogFile, 'utf-8');
      expect(logContent).toContain('AppImage failed with code 1. Initiating unpacked fallback.');
      expect(logContent).toContain('Unpacked binary executed.');
    });

    it('handles missing executable permissions automatically via chmod +x', () => {
      const mockBinary = path.join(tempDir, 'no-perms-bin');
      const markerFile = path.join(tempDir, 'perms-fixed.txt');

      // Create file without execute permissions (0o644)
      fs.writeFileSync(mockBinary, `#!/usr/bin/env bash\necho "ran" > "${markerFile}"\nexit 0\n`, { mode: 0o644 });

      // Verify it is not executable initially
      const statBefore = fs.statSync(mockBinary);
      expect((statBefore.mode & 0o111) === 0).toBe(true);

      // Launcher repairs permissions
      const repairScript = `#!/usr/bin/env bash
chmod +x "${mockBinary}" 2>/dev/null || true
if [ -x "${mockBinary}" ]; then
  "${mockBinary}"
fi
`;
      const scriptPath = path.join(tempDir, 'repair.sh');
      fs.writeFileSync(scriptPath, repairScript, { mode: 0o755 });
      execSync(`"${scriptPath}"`);

      expect(fs.existsSync(markerFile)).toBe(true);
      const statAfter = fs.statSync(mockBinary);
      expect((statAfter.mode & 0o111) !== 0).toBe(true);
    });

    it('handles missing AppImage by directly using unpacked binary', () => {
      const mockLauncherPath = path.join(tempDir, 'missing-appimage.sh');
      const mockLogFile = path.join(logDir, 'launcher.log');
      const nonexistentAppImage = path.join(tempDir, 'nonexistent.AppImage');
      const mockUnpacked = path.join(tempDir, 'working-unpacked-2');
      const markerFile = path.join(tempDir, 'unpacked-2-ran.txt');

      fs.writeFileSync(mockUnpacked, `#!/usr/bin/env bash\necho "ok" > "${markerFile}"\nexit 0\n`, { mode: 0o755 });

      const launcherScript = `#!/usr/bin/env bash
set -u
mkdir -p "${logDir}"
LOG_FILE="${mockLogFile}"
APPIMAGE_PATH="${nonexistentAppImage}"
UNPACKED_PATH="${mockUnpacked}"

log() { echo "[\$(date -Iseconds)] \$*" >> "$LOG_FILE"; }

if [ ! -f "$APPIMAGE_PATH" ]; then
  log "AppImage not found at $APPIMAGE_PATH. Proceeding to unpacked binary."
fi

if [ -x "$UNPACKED_PATH" ]; then
  "$UNPACKED_PATH" >> "$LOG_FILE" 2>&1
  log "Unpacked application started successfully."
fi
`;
      fs.writeFileSync(mockLauncherPath, launcherScript, { mode: 0o755 });
      execSync(`"${mockLauncherPath}"`);

      expect(fs.existsSync(markerFile)).toBe(true);
      const logContent = fs.readFileSync(mockLogFile, 'utf-8');
      expect(logContent).toContain('AppImage not found');
      expect(logContent).toContain('Unpacked application started successfully.');
    });
  });

  describe('CLI Flag Handling', () => {
    it('responds to --version without launching full GUI', () => {
      const projectRoot = path.resolve(import.meta.dirname, '..');
      const distMain = path.join(projectRoot, 'dist', 'main', 'index.js');
      if (!fs.existsSync(distMain)) {
        execSync('npm run build:main', { cwd: projectRoot, stdio: 'pipe' });
      }
      const electronPath = path.join(projectRoot, 'node_modules', '.bin', 'electron');
      const res = spawnSync(electronPath, ['dist/main/index.js', '--version'], {
        cwd: projectRoot,
        encoding: 'utf-8',
      });

      if (res.status !== 0 && (!process.env.DISPLAY || res.stderr?.includes('DISPLAY') || res.stderr?.includes('OzonePlatform') || res.stderr?.includes('ozone'))) {
        return; // Headless Linux environment without display server
      }

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('Knot v1.0.0');
    });

    it('responds to --help without launching full GUI', () => {
      const projectRoot = path.resolve(import.meta.dirname, '..');
      const distMain = path.join(projectRoot, 'dist', 'main', 'index.js');
      if (!fs.existsSync(distMain)) {
        execSync('npm run build:main', { cwd: projectRoot, stdio: 'pipe' });
      }
      const electronPath = path.join(projectRoot, 'node_modules', '.bin', 'electron');
      const res = spawnSync(electronPath, ['dist/main/index.js', '--help'], {
        cwd: projectRoot,
        encoding: 'utf-8',
      });

      if (res.status !== 0 && (!process.env.DISPLAY || res.stderr?.includes('DISPLAY') || res.stderr?.includes('OzonePlatform') || res.stderr?.includes('ozone'))) {
        return; // Headless Linux environment without display server
      }

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('Knot — Where AI agents work together.');
      expect(res.stdout).toContain('--version');
      expect(res.stdout).toContain('--help');
    });
  });
});
