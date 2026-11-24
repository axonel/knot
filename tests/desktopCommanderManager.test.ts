import { describe, it, expect, afterEach } from 'vitest';
import { DesktopCommanderManager } from '../src/main/desktopCommanderManager.js';
import { ProcessStatusInfo } from '../src/shared/types.js';

describe('DesktopCommanderManager', () => {
  let manager: DesktopCommanderManager;

  afterEach(async () => {
    if (manager) {
      await manager.cleanup();
    }
  });

  describe('Starting the process', () => {
    it('spawns a child process and transitions from Starting to Running', async () => {
      // Use node running a simple long-lived script that outputs ready
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: ['-e', 'console.log("Desktop Commander MCP server initialized"); setInterval(() => {}, 500);'],
        startupGracePeriodMs: 200,
      });

      const statusEvents: ProcessStatusInfo[] = [];
      manager.on('statusChange', (status) => statusEvents.push(status));

      const result = await manager.start();
      expect(result.success).toBe(true);

      // Wait a moment for output processing
      await new Promise((r) => setTimeout(r, 150));

      const status = manager.getStatus();
      expect(status.state).toBe('Running');
      expect(status.pid).toBeTypeOf('number');
      expect(status.startedAt).not.toBeNull();
      expect(status.errorMessage).toBeNull();

      // Check captured logs
      const logs = manager.getLogs();
      expect(logs.some((l) => l.message.includes('Desktop Commander MCP server initialized'))).toBe(true);

      // Verify statusChange event sequence
      expect(statusEvents.some((s) => s.state === 'Starting')).toBe(true);
      expect(statusEvents.some((s) => s.state === 'Running')).toBe(true);
    });
  });

  describe('Stopping the process', () => {
    it('gracefully terminates the running process and transitions to Stopped', async () => {
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: ['-e', 'console.log("running"); setInterval(() => {}, 500);'],
        startupGracePeriodMs: 100,
        gracefulShutdownTimeoutMs: 1000,
      });

      await manager.start();
      await new Promise((r) => setTimeout(r, 100));
      expect(manager.getStatus().state).toBe('Running');

      const stopResult = await manager.stop();
      expect(stopResult.success).toBe(true);

      const finalStatus = manager.getStatus();
      expect(finalStatus.state).toBe('Stopped');
      expect(finalStatus.pid).toBeNull();
      expect(finalStatus.stoppedAt).not.toBeNull();
    });

    it('forces termination (SIGKILL) when graceful shutdown times out', async () => {
      // Process that catches SIGINT and ignores it
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: [
          '-e',
          'process.on("SIGINT", () => { /* ignore */ }); process.on("SIGTERM", () => { /* ignore */ }); console.log("running"); setInterval(() => {}, 500);',
        ],
        startupGracePeriodMs: 100,
        gracefulShutdownTimeoutMs: 300,
      });

      await manager.start();
      await new Promise((r) => setTimeout(r, 100));

      const stopResult = await manager.stop();
      expect(stopResult.success).toBe(true);

      expect(manager.getStatus().state).toBe('Stopped');
      expect(manager.getStatus().pid).toBeNull();
    });
  });

  describe('Duplicate start prevention', () => {
    it('prevents starting multiple instances concurrently', async () => {
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: ['-e', 'console.log("active"); setInterval(() => {}, 500);'],
        startupGracePeriodMs: 100,
      });

      const firstStart = await manager.start();
      expect(firstStart.success).toBe(true);

      // Second start attempt while Running or Starting
      const secondStart = await manager.start();
      expect(secondStart.success).toBe(false);
      expect(secondStart.message).toMatch(/Cannot start process: already/);
    });

    it('prevents starting while process is stopping', async () => {
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: ['-e', 'console.log("active"); setInterval(() => {}, 500);'],
        startupGracePeriodMs: 100,
      });

      await manager.start();
      await new Promise((r) => setTimeout(r, 100));

      // Trigger stop and immediately attempt start
      const stopPromise = manager.stop();
      const startWhileStopping = await manager.start();

      expect(startWhileStopping.success).toBe(false);
      expect(startWhileStopping.message).toContain('currently stopping');

      await stopPromise;
    });
  });

  describe('Failed startup', () => {
    it('detects failure when command is non-existent (spawn error)', async () => {
      manager = new DesktopCommanderManager({
        command: 'non_existent_executable_12345_knot',
        args: [],
      });

      await manager.start();
      // On Linux/POSIX, spawn with non-existent command emits an 'error' event asynchronously
      await new Promise((r) => setTimeout(r, 100));

      const status = manager.getStatus();
      expect(status.state).toBe('Error');
      expect(status.errorMessage).toMatch(/failed to spawn|ENOENT/i);
    });

    it('detects failure when process exits prematurely with non-zero code during startup', async () => {
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: ['-e', 'console.error("Invalid config"); process.exit(1);'],
        startupGracePeriodMs: 500,
      });

      await manager.start();
      await new Promise((r) => setTimeout(r, 150));

      const status = manager.getStatus();
      expect(status.state).toBe('Error');
      expect(status.errorMessage).toContain('Startup failure');
      expect(status.exitCode).toBe(1);

      const logs = manager.getLogs();
      expect(logs.some((l) => l.message.includes('Invalid config'))).toBe(true);
    });
  });

  describe('Unexpected process termination', () => {
    it('detects unexpected exit while in Running state and transitions to Error', async () => {
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: [
          '-e',
          'console.log("running"); setTimeout(() => { process.exit(137); }, 200);',
        ],
        startupGracePeriodMs: 100,
      });

      await manager.start();
      await new Promise((r) => setTimeout(r, 100));
      expect(manager.getStatus().state).toBe('Running');

      // Wait for process to exit unexpectedly with code 137
      await new Promise((r) => setTimeout(r, 250));

      const status = manager.getStatus();
      expect(status.state).toBe('Error');
      expect(status.errorMessage).toContain('Unexpected process termination');
      expect(status.exitCode).toBe(137);
    });

    it('handles clean unexpected exit with code 0 as Stopped', async () => {
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: [
          '-e',
          'console.log("running"); setTimeout(() => { process.exit(0); }, 150);',
        ],
        startupGracePeriodMs: 50,
      });

      await manager.start();
      await new Promise((r) => setTimeout(r, 70));
      expect(manager.getStatus().state).toBe('Running');

      for (let i = 0; i < 20 && manager.getStatus().state === 'Running'; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }

      const status = manager.getStatus();
      expect(status.state).toBe('Stopped');
      expect(status.exitCode).toBe(0);
    });
  });

  describe('Application shutdown cleanup', () => {
    it('terminates active child process cleanly during cleanup()', async () => {
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: ['-e', 'console.log("running"); setInterval(() => {}, 500);'],
        startupGracePeriodMs: 50,
      });

      await manager.start();
      await new Promise((r) => setTimeout(r, 80));
      expect(manager.getStatus().state).toBe('Running');

      const pid = manager.getStatus().pid;
      expect(pid).not.toBeNull();

      await manager.cleanup();

      expect(manager.getStatus().state).toBe('Stopped');
      expect(manager.getStatus().pid).toBeNull();
    });
  });

  describe('Log buffer and clearLogs', () => {
    it('manages log buffer and clears logs on command', async () => {
      manager = new DesktopCommanderManager({
        command: process.execPath,
        args: ['-e', 'console.log("Line 1"); console.log("Line 2"); setInterval(() => {}, 500);'],
        startupGracePeriodMs: 50,
      });

      await manager.start();
      await new Promise((r) => setTimeout(r, 100));

      expect(manager.getLogs().length).toBeGreaterThan(0);

      manager.clearLogs();
      expect(manager.getLogs().length).toBe(0);
    });
  });
});
