import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { StreamParser } from './streamParser.js';
import { EventMapper, type MappedInitEvent, type MappedResultEvent, type MappedStepUpdateEvent } from './eventMapper.js';
import type {
  AntigravityExecutionMode,
  AntigravityProcessState,
} from '../../shared/types.js';

export interface AntigravityProcessConfig {
  sessionId: string;
  workingDirectory: string;
  executablePath: string;
  mode?: AntigravityExecutionMode;
  model?: string;
  effort?: string;
  resumeConversationId?: string;
  env?: NodeJS.ProcessEnv;
}

export class AntigravityProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private streamParser: StreamParser;
  private _state: AntigravityProcessState = 'stopped';
  private _cliConversationId: string | null = null;
  private _pid: number | null = null;
  private _lastStartedAt: string | null = null;
  private _lastExitCode: number | null = null;
  private _currentTurnPending = false;
  private _lastResult: {
    status: string;
    durationSeconds?: number;
    error?: string | null;
    numTurns?: number;
  } | null = null;

  private pendingTurnResolve: ((result: MappedResultEvent) => void) | null = null;
  private pendingTurnReject: ((err: Error) => void) | null = null;
  private turnTimeoutTimer: NodeJS.Timeout | null = null;
  private turnEscalationTimer: NodeJS.Timeout | null = null;

  constructor(public readonly config: AntigravityProcessConfig) {
    super();
    this.streamParser = new StreamParser();
    this._cliConversationId = config.resumeConversationId || null;
    this.setupParserListeners();
  }

  private clearTurnTimers(): void {
    if (this.turnTimeoutTimer) {
      clearTimeout(this.turnTimeoutTimer);
      this.turnTimeoutTimer = null;
    }
    if (this.turnEscalationTimer) {
      clearTimeout(this.turnEscalationTimer);
      this.turnEscalationTimer = null;
    }
  }

  public get state(): AntigravityProcessState {
    return this._state;
  }

  public get pid(): number | null {
    return this._pid;
  }

  public get cliConversationId(): string | null {
    return this._cliConversationId;
  }

  public get lastStartedAt(): string | null {
    return this._lastStartedAt;
  }

  public get lastExitCode(): number | null {
    return this._lastExitCode;
  }

  public get currentTurnPending(): boolean {
    return this._currentTurnPending;
  }

  public get lastResult() {
    return this._lastResult;
  }

  public start(): Promise<void> {
    if (this.child && !this.child.killed && this._state !== 'stopped' && this._state !== 'error') {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.setState('starting');
      this._lastStartedAt = new Date().toISOString();

      const args = ['--input-format', 'stream-json', '--output-format', 'stream-json'];

      if (this._cliConversationId) {
        args.push('--conversation', this._cliConversationId);
      }

      if (this.config.mode && this.config.mode !== 'default') {
        args.push('--mode', this.config.mode);
      }

      if (this.config.model) {
        args.push('--model', this.config.model);
      }

      if (this.config.effort) {
        args.push('--effort', this.config.effort);
      }

      // CRITICAL: NEVER pass --dangerously-skip-permissions or --always-proceed
      const FORBIDDEN_FLAGS = ['--dangerously-skip-permissions', '--always-proceed', '--skip-permissions', '--bypass-permissions'];
      for (const arg of args) {
        if (FORBIDDEN_FLAGS.some((flag) => arg.includes(flag))) {
          const err = new Error('Security policy violation: permission bypass flags are strictly prohibited in Knot.');
          this.setState('error');
          return reject(err);
        }
      }

      // Validate working directory is not filesystem root or entire home directory
      const resolvedCwd = path.resolve(this.config.workingDirectory);
      const homeDir = os.homedir();
      if (resolvedCwd === '/' || resolvedCwd === homeDir) {
        const err = new Error(
          `Security policy violation: working directory cannot be filesystem root or entire home directory ("${resolvedCwd}").`
        );
        this.setState('error');
        return reject(err);
      }

      try {
        const child = spawn(this.config.executablePath, args, {
          cwd: this.config.workingDirectory,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this.config.env || process.env,
        });

        this.child = child;
        this._pid = child.pid ?? null;

        let hasResolved = false;

        const onStartSuccess = () => {
          if (!hasResolved) {
            hasResolved = true;
            this.setState('ready');
            resolve();
          }
        };

        const onStartFailure = (err: Error) => {
          if (!hasResolved) {
            hasResolved = true;
            this.setState('error');
            reject(err);
          }
        };

        child.stdout.on('data', (chunk: Buffer | string) => {
          this.streamParser.push(chunk);
          // First stdout output indicates process started successfully
          onStartSuccess();
        });

        child.stdout.on('end', () => {
          try {
            this.streamParser.end();
          } catch {
            // ignore
          }
        });

        child.stderr.on('data', (chunk: Buffer | string) => {
          const text = chunk.toString();
          this.emit('stderr', text);

          if (EventMapper.isAuthError(text)) {
            this.setState('authentication_required');
            this.emit('auth_required', text);
          }
        });

        child.on('error', (err) => {
          onStartFailure(err);
          this.handleProcessExit(null, err);
        });

        child.on('exit', (code, signal) => {
          this.handleProcessExit(code, null, signal);
          if (!hasResolved) {
            onStartFailure(new Error(`Antigravity process exited prematurely with code ${code ?? signal}`));
          }
        });

        // Fallback: If no stdout in 1500ms, assume ready if child still alive
        setTimeout(() => {
          if (this.child && !this.child.killed && this._state === 'starting') {
            onStartSuccess();
          }
        }, 1500);
      } catch (err) {
        this.setState('error');
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  public async sendMessage(prompt: string, options?: { timeoutMs?: number }): Promise<MappedResultEvent> {
    if (!this.child || this.child.killed || this._state === 'stopped') {
      await this.start();
    }

    if (!this.child || !this.child.stdin || !this.child.stdin.writable) {
      throw new Error('Antigravity process stdin is not writable');
    }

    if (this._currentTurnPending) {
      throw new Error('Another turn is already in progress');
    }

    this._currentTurnPending = true;
    this.setState('thinking');

    const timeoutMs = options?.timeoutMs;
    if (timeoutMs && timeoutMs > 0) {
      this.turnTimeoutTimer = setTimeout(() => {
        this.turnTimeoutTimer = null;
        this.interrupt();
        this.turnEscalationTimer = setTimeout(() => {
          this.turnEscalationTimer = null;
          if (this._currentTurnPending) {
            this.stop().catch(() => {});
          }
        }, 2000);

        if (this.pendingTurnReject) {
          const reject = this.pendingTurnReject;
          this.pendingTurnResolve = null;
          this.pendingTurnReject = null;
          this._currentTurnPending = false;
          this.setState('error');
          reject(new Error(`Task execution timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
    }

    const ndjsonMessage = JSON.stringify({
      event: 'user',
      message: {
        content: prompt,
      },
    }) + '\n';

    return new Promise<MappedResultEvent>((resolve, reject) => {
      this.pendingTurnResolve = resolve;
      this.pendingTurnReject = reject;

      const stdin = this.child?.stdin;
      if (!stdin) {
        this.clearTurnTimers();
        this._currentTurnPending = false;
        this.pendingTurnResolve = null;
        this.pendingTurnReject = null;
        this.setState('error');
        reject(new Error('Process stdin is unavailable'));
        return;
      }

      stdin.write(ndjsonMessage, (err) => {
        if (err) {
          this.clearTurnTimers();
          this._currentTurnPending = false;
          this.pendingTurnResolve = null;
          this.pendingTurnReject = null;
          this.setState('error');
          reject(err);
        }
      });
    });
  }

  public interrupt(): void {
    if (this.child && !this.child.killed) {
      try {
        this.child.kill('SIGINT');
      } catch {
        // Ignore kill errors
      }
    }
  }

  public async stop(): Promise<void> {
    this.clearTurnTimers();
    if (!this.child || this.child.killed || this._state === 'stopped') {
      this.setState('stopped');
      return;
    }

    this.setState('stopping');

    if (this.pendingTurnReject) {
      this.pendingTurnReject(new Error('Turn aborted: process stopping'));
      this.pendingTurnResolve = null;
      this.pendingTurnReject = null;
    }
    this._currentTurnPending = false;

    return new Promise<void>((resolve) => {
      const child = this.child;
      if (!child) {
        this.setState('stopped');
        resolve();
        return;
      }

      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          this.setState('stopped');
          this.child = null;
          this._pid = null;
          resolve();
        }
      };

      // Try closing stdin first
      try {
        child.stdin?.end();
      } catch {
        // ignore
      }

      const termTimeout = setTimeout(() => {
        try {
          if (!child.killed) {
            child.kill('SIGTERM');
          }
        } catch {
          // ignore
        }
      }, 500);

      const killTimeout = setTimeout(() => {
        try {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        } catch {
          // ignore
        }
        finish();
      }, 2000);

      child.once('exit', () => {
        clearTimeout(termTimeout);
        clearTimeout(killTimeout);
        finish();
      });
    });
  }

  private setupParserListeners(): void {
    this.streamParser.on('event', (envelope) => {
      const mapped = EventMapper.mapEvent(envelope);

      if (mapped.type === 'init') {
        const initEvent = mapped as MappedInitEvent;
        if (initEvent.conversationId) {
          this._cliConversationId = initEvent.conversationId;
        }
        this.emit('init', initEvent);
      } else if (mapped.type === 'step_update') {
        const stepUpdate = mapped as MappedStepUpdateEvent;
        if (stepUpdate.conversationId && !this._cliConversationId) {
          this._cliConversationId = stepUpdate.conversationId;
        }
        this.emit('step_update', stepUpdate);

        if (stepUpdate.step.textDelta) {
          this.emit('text_delta', {
            textDelta: stepUpdate.step.textDelta,
            stepIndex: stepUpdate.step.stepIndex,
          });
        }

        if (stepUpdate.step.tool) {
          this.emit('tool_event', {
            tool: stepUpdate.step.tool,
            stepIndex: stepUpdate.step.stepIndex,
          });
        }
      } else if (mapped.type === 'result') {
        const resultEvent = mapped as MappedResultEvent;
        this.clearTurnTimers();
        if (resultEvent.conversationId) {
          this._cliConversationId = resultEvent.conversationId;
        }

        this._lastResult = {
          status: resultEvent.status,
          durationSeconds: resultEvent.durationSeconds,
          error: resultEvent.error || null,
          numTurns: resultEvent.numTurns,
        };

        this._currentTurnPending = false;
        this.setState(resultEvent.status === 'ERROR' ? 'error' : 'ready');

        this.emit('result', resultEvent);

        if (this.pendingTurnResolve) {
          const resolver = this.pendingTurnResolve;
          this.pendingTurnResolve = null;
          this.pendingTurnReject = null;
          resolver(resultEvent);
        }
      }
    });

    this.streamParser.on('malformed_line', (info) => {
      this.emit('malformed_line', info);
    });
  }

  private handleProcessExit(code: number | null, error: Error | null, signal?: string | null): void {
    this.clearTurnTimers();
    this._lastExitCode = code;
    this._pid = null;

    try {
      this.streamParser.end();
    } catch {
      // ignore
    }

    if (this.pendingTurnReject) {
      const exitReason = error
        ? error.message
        : signal
          ? `Process terminated by signal ${signal} without emitting a final result`
          : code !== 0
            ? `Process exited with code ${code} without emitting a final result`
            : `Process exited prematurely with code 0 without emitting a final result`;
      this.pendingTurnReject(error || new Error(exitReason));
      this.pendingTurnResolve = null;
      this.pendingTurnReject = null;
    }

    this._currentTurnPending = false;

    if (this._state !== 'stopping') {
      if (code !== 0 && code !== null) {
        this.setState('error');
      } else {
        this.setState('stopped');
      }
    } else {
      this.setState('stopped');
    }

    this.emit('exit', { code, signal, error });
  }

  private setState(nextState: AntigravityProcessState): void {
    const prevState = this._state;
    this._state = nextState;
    if (prevState !== nextState) {
      this.emit('state_changed', { state: nextState, previousState: prevState });
    }
  }
}
