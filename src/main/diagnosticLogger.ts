import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface DiagnosticLoggerOptions {
  logDir?: string;
  logFileName?: string;
  maxSizeBytes?: number;
  maxBackups?: number;
}

export class DiagnosticLogger {
  private logDir: string;
  private logFilePath: string;
  private maxSizeBytes: number;
  private maxBackups: number;

  constructor(options: DiagnosticLoggerOptions = {}) {
    const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
    this.logDir = options.logDir || path.join(stateHome, 'knot', 'logs');
    this.logFilePath = path.join(this.logDir, options.logFileName || 'main.log');
    this.maxSizeBytes = options.maxSizeBytes || 1024 * 1024; // 1 MB
    this.maxBackups = options.maxBackups || 5;

    this.ensureLogDir();
  }

  public getLogPath(): string {
    return this.logFilePath;
  }

  public getLogDir(): string {
    return this.logDir;
  }

  private ensureLogDir(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (err) {
      console.error('[Knot Logger] Failed to create log directory:', err);
    }
  }

  private rotateLogsIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        return;
      }

      const stat = fs.statSync(this.logFilePath);
      if (stat.size >= this.maxSizeBytes) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.logDir, `main-${timestamp}.log.bak`);
        fs.renameSync(this.logFilePath, backupPath);

        // Prune older backups beyond maxBackups
        const allFiles = fs.readdirSync(this.logDir);
        const backupFiles = allFiles
          .filter((f) => f.startsWith('main-') && f.endsWith('.log.bak'))
          .map((f) => path.join(this.logDir, f))
          .sort((a, b) => {
            return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
          });

        if (backupFiles.length > this.maxBackups) {
          const filesToDelete = backupFiles.slice(this.maxBackups);
          for (const f of filesToDelete) {
            try {
              fs.unlinkSync(f);
            } catch {
              // ignore deletion errors
            }
          }
        }
      }
    } catch (err) {
      console.error('[Knot Logger] Error during log rotation:', err);
    }
  }

  public write(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, meta?: unknown): void {
    const timestamp = new Date().toISOString();
    let formattedMeta = '';
    if (meta !== undefined) {
      if (meta instanceof Error) {
        formattedMeta = ` | Stack: ${meta.stack || meta.message}`;
      } else if (typeof meta === 'object') {
        try {
          formattedMeta = ` | Data: ${JSON.stringify(meta)}`;
        } catch {
          formattedMeta = ` | Data: [Unserializable]`;
        }
      } else {
        formattedMeta = ` | ${String(meta)}`;
      }
    }

    const logLine = `[${timestamp}] [${level}] ${message}${formattedMeta}\n`;

    // Also write to terminal console
    if (level === 'ERROR') {
      console.error(`[Knot] [${level}] ${message}`, meta ?? '');
    } else if (level === 'WARN') {
      console.warn(`[Knot] [${level}] ${message}`, meta ?? '');
    } else {
      console.log(`[Knot] [${level}] ${message}`, meta ?? '');
    }

    try {
      this.ensureLogDir();
      this.rotateLogsIfNeeded();
      fs.appendFileSync(this.logFilePath, logLine, 'utf-8');
    } catch (err) {
      console.error('[Knot Logger] Failed to write to log file:', err);
    }
  }

  public info(message: string, meta?: unknown): void {
    this.write('INFO', message, meta);
  }

  public warn(message: string, meta?: unknown): void {
    this.write('WARN', message, meta);
  }

  public error(message: string, meta?: unknown): void {
    this.write('ERROR', message, meta);
  }

  public debug(message: string, meta?: unknown): void {
    this.write('DEBUG', message, meta);
  }
}

export const logger = new DiagnosticLogger();
