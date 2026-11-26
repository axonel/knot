import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { LogEntry, LogLevel, ProcessState, ProcessStatusInfo, RemoteConnectionState } from '../shared/types.js';
import { sanitizeLogOutput } from './logSanitizer.js';

export interface ManagerOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  startupGracePeriodMs?: number;
  gracefulShutdownTimeoutMs?: number;
  maxLogs?: number;
}

export class DesktopCommanderManager extends EventEmitter {
  private state: ProcessState = 'Stopped';
  private connectionState: RemoteConnectionState = 'disconnected';
  private connectionVerified = false;
  private childProcess: ChildProcess | null = null;
  private pid: number | null = null;
  private startedAt: string | null = null;
  private stoppedAt: string | null = null;
  private exitCode: number | null = null;
  private errorMessage: string | null = null;
  private logs: LogEntry[] = [];
  private logIdCounter = 0;
  private startupTimer: NodeJS.Timeout | null = null;
  private shutdownTimer: NodeJS.Timeout | null = null;

  private readonly command: string;
  private readonly args: string[];
  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly startupGracePeriodMs: number;
  private readonly gracefulShutdownTimeoutMs: number;
  private readonly maxLogs: number;

  constructor(options: ManagerOptions = {}) {
    super();
    this.command = options.command ?? 'npx';
    this.args = options.args ?? ['@wonderwhy-er/desktop-commander@latest', 'remote'];
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? { ...process.env };
    this.startupGracePeriodMs = options.startupGracePeriodMs ?? 1500;
    this.gracefulShutdownTimeoutMs = options.gracefulShutdownTimeoutMs ?? 4000;
    this.maxLogs = options.maxLogs ?? 1000;
  }

  public getStatus(): ProcessStatusInfo {
    return {
      state: this.state,
      connectionState: this.connectionState,
      connectionVerified: this.connectionVerified,
      pid: this.pid,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      exitCode: this.exitCode,
      errorMessage: this.errorMessage,
    };
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    this.emit('logsCleared');
  }

  private setState(newState: ProcessState, errorMessage: string | null = null): void {
    if (this.state === newState && this.errorMessage === errorMessage) {
      return;
    }
    this.state = newState;
    if (errorMessage !== null) {
      this.errorMessage = errorMessage;
    }
    this.emit('statusChange', this.getStatus());
  }

  private addLog(level: LogLevel, rawMessage: string): void {
    const sanitized = sanitizeLogOutput(rawMessage.trimEnd());
    if (!sanitized) return;

    const entry: LogEntry = {
      id: `log-${Date.now()}-${++this.logIdCounter}`,
      timestamp: new Date().toISOString(),
      level,
      message: sanitized,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.emit('log', entry);
  }

  public async start(): Promise<{ success: boolean; message?: string }> {
    // Prevent duplicate process launches
    if (this.state === 'Starting' || this.state === 'Running') {
      const msg = `Cannot start process: already ${this.state} (PID: ${this.pid})`;
      this.addLog('system', `[WARNING] ${msg}`);
      return { success: false, message: msg };
    }

    if (this.state === 'Stopping') {
      const msg = 'Cannot start process: currently stopping previous instance';
      this.addLog('system', `[WARNING] ${msg}`);
      return { success: false, message: msg };
    }

    this.errorMessage = null;
    this.exitCode = null;
    this.stoppedAt = null;
    this.connectionState = 'unverified';
    this.connectionVerified = false;
    this.setState('Starting');

    this.addLog('system', `Launching Desktop Commander Remote: ${this.command} ${this.args.join(' ')}`);

    try {
      const child = spawn(this.command, this.args, {
        cwd: this.cwd,
        env: this.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      // Handle spawn error (e.g. executable not found) immediately
      child.on('error', (err) => {
        const errorMsg = `Process failed to spawn: ${err.message}`;
        this.addLog('stderr', `[ERROR] ${errorMsg}`);
        this.cleanUpChildReference();
        this.setState('Error', errorMsg);
      });

      this.childProcess = child;
      this.pid = child.pid ?? null;
      this.startedAt = new Date().toISOString();

      if (!this.pid) {
        // Child process failed to spawn
        return { success: false, message: 'Failed to spawn process' };
      }

      this.addLog('system', `Process spawned successfully with PID ${this.pid}`);

      // Stream stdout
      child.stdout?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        this.addLog('stdout', text);
        this.inspectOutputForConnectionSignals(text);

        // If still in Starting state, receiving meaningful output confirms it's alive and running
        if (this.state === 'Starting') {
          this.transitionToRunning();
        }
      });

      // Stream stderr
      child.stderr?.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        this.addLog('stderr', text);
        this.inspectOutputForConnectionSignals(text);
      });

      // Handle process exit
      child.on('close', (code, signal) => {
        this.handleProcessExit(code, signal);
      });

      // Startup verification timer: if process stays alive through the grace period, mark Running
      this.startupTimer = setTimeout(() => {
        if (this.state === 'Starting' && this.childProcess !== null) {
          this.transitionToRunning();
        }
      }, this.startupGracePeriodMs);

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.addLog('system', `[ERROR] Immediate startup failure: ${errorMsg}`);
      this.cleanUpChildReference();
      this.setState('Error', errorMsg);
      return { success: false, message: errorMsg };
    }
  }

  private transitionToRunning(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.state === 'Starting') {
      this.setState('Running');
      this.addLog('system', `Desktop Commander Remote is running (PID: ${this.pid})`);
    }
  }

  public async stop(): Promise<{ success: boolean; message?: string }> {
    if (this.state === 'Stopped') {
      return { success: true, message: 'Process is already stopped' };
    }

    if (this.state === 'Stopping') {
      return { success: true, message: 'Process termination is already in progress' };
    }

    if (!this.childProcess || !this.pid) {
      this.setState('Stopped');
      return { success: true };
    }

    const targetPid = this.pid;
    const proc = this.childProcess;
    this.setState('Stopping');
    this.addLog('system', `Initiating graceful shutdown for process PID ${targetPid} (SIGINT)...`);

    return new Promise((resolve) => {
      // Setup force-kill fallback timer
      this.shutdownTimer = setTimeout(() => {
        if (this.childProcess !== null) {
          this.addLog('system', `Graceful shutdown timed out (${this.gracefulShutdownTimeoutMs}ms). Forcing termination with SIGKILL...`);
          try {
            proc.kill('SIGKILL');
          } catch (e: unknown) {
            this.addLog('stderr', `Failed to force kill process: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }, this.gracefulShutdownTimeoutMs);

      // Once the process exits, handleProcessExit will clear childProcess and set state to Stopped
      const onExit = () => {
        resolve({ success: true });
      };

      this.once('processExited', onExit);

      // Send graceful SIGINT
      try {
        const sent = proc.kill('SIGINT');
        if (!sent) {
          // Fallback to SIGTERM
          proc.kill('SIGTERM');
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.addLog('stderr', `Error sending termination signal: ${errorMsg}`);
        // If sending signal failed, try SIGKILL immediately
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    });
  }

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    const previousState = this.state;
    this.exitCode = code;
    this.stoppedAt = new Date().toISOString();
    const pid = this.pid;
    this.cleanUpChildReference();

    const exitInfo = signal ? `signal ${signal}` : `code ${code}`;

    if (previousState === 'Stopping') {
      this.addLog('system', `Process PID ${pid} terminated gracefully (${exitInfo})`);
      this.setState('Stopped');
    } else if (previousState === 'Starting') {
      const errorMsg = `Startup failure: Process exited prematurely with ${exitInfo}`;
      this.addLog('stderr', `[ERROR] ${errorMsg}`);
      this.setState('Error', errorMsg);
    } else if (previousState === 'Running') {
      // Unexpected process exit
      if (code === 0) {
        this.addLog('system', `Process exited normally with code 0`);
        this.setState('Stopped');
      } else {
        const errorMsg = `Unexpected process termination with ${exitInfo}`;
        this.addLog('stderr', `[ERROR] ${errorMsg}`);
        this.setState('Error', errorMsg);
      }
    } else {
      this.setState('Stopped');
    }

    this.emit('processExited', { code, signal });
  }

  private inspectOutputForConnectionSignals(text: string): void {
    const lower = text.toLowerCase();
    if (
      lower.includes('connected') ||
      lower.includes('device registered') ||
      lower.includes('session active') ||
      lower.includes('listening on') ||
      lower.includes('mcp server initialized') ||
      lower.includes('remote device active') ||
      lower.includes('status: online') ||
      lower.includes('device status set to online')
    ) {
      if (!this.connectionVerified || this.connectionState !== 'connected') {
        this.connectionVerified = true;
        this.connectionState = 'connected';
        this.emit('statusChange', this.getStatus());
      }
    } else if (
      lower.includes('pair') ||
      lower.includes('sign in') ||
      lower.includes('login') ||
      lower.includes('device code') ||
      lower.includes('authorization') ||
      lower.includes('authorize')
    ) {
      if (this.connectionState !== 'pairing_required') {
        this.connectionState = 'pairing_required';
        this.connectionVerified = false;
        this.emit('statusChange', this.getStatus());
      }
    }
  }

  private cleanUpChildReference(): void {
    this.childProcess = null;
    this.pid = null;
    this.connectionState = 'disconnected';
    this.connectionVerified = false;
  }

  /**
   * Safe application shutdown hook.
   * Ensures any running child process is cleanly terminated so no orphaned processes remain.
   */
  public async cleanup(): Promise<void> {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    if (this.childProcess && this.pid) {
      this.addLog('system', `Application shutting down. Terminating managed process PID ${this.pid}...`);
      try {
        this.childProcess.kill('SIGTERM');
      } catch {
        // ignore
      }
      this.cleanUpChildReference();
      this.state = 'Stopped';
    }
  }
}
