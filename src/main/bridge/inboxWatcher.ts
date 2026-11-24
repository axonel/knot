import fs from 'node:fs';
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { parseBridgeMessage } from './protocol.js';
import type {
  ParsedBridgeMessage,
  MessageValidationError,
} from './types.js';

export interface InboxWatcherHandlers {
  onMessageAccepted: (message: ParsedBridgeMessage) => Promise<void> | void;
  onMessageRejected: (data: {
    filePath: string;
    error: MessageValidationError;
    rawContent?: string;
    projectId?: string;
    sessionId?: string;
  }) => Promise<void> | void;
}

export class InboxWatcher {
  private watcher: FSWatcher | null = null;
  private inFlight = new Set<string>();
  private handlers: InboxWatcherHandlers;
  private watchedPaths = new Set<string>();

  constructor(handlers: InboxWatcherHandlers) {
    this.handlers = handlers;
  }

  public watchInbox(inboxDir: string): void {
    if (this.watchedPaths.has(inboxDir)) {
      return;
    }
    this.watchedPaths.add(inboxDir);

    if (!fs.existsSync(inboxDir)) {
      fs.mkdirSync(inboxDir, { recursive: true });
    }

    if (!this.watcher) {
      this.watcher = watch(inboxDir, {
        ignoreInitial: false,
        depth: 0,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 50,
        },
        ignored: [/(^|[/\\])\../, /\.tmp($|\.)/, /\.error\.json$/],
      });

      this.watcher.on('add', (filePath) => this.handleFile(filePath));
      this.watcher.on('change', (filePath) => this.handleFile(filePath));
    } else {
      this.watcher.add(inboxDir);
    }
  }

  public async scanInbox(
    inboxDir: string,
    expectedScope?: { projectId: string; sessionId: string }
  ): Promise<void> {
    if (!fs.existsSync(inboxDir)) {
      return;
    }

    const entries = fs.readdirSync(inboxDir);
    for (const file of entries) {
      if (file.endsWith('.md') && !file.includes('.tmp.')) {
        const fullPath = path.join(inboxDir, file);
        await this.handleFile(fullPath, expectedScope);
      }
    }
  }

  public async handleFile(
    filePath: string,
    forcedScope?: { projectId: string; sessionId: string }
  ): Promise<void> {
    if (!filePath.endsWith('.md') || filePath.includes('.tmp.')) {
      return;
    }

    const normalizedPath = path.resolve(filePath);
    if (this.inFlight.has(normalizedPath)) {
      return;
    }

    this.inFlight.add(normalizedPath);

    try {
      if (!fs.existsSync(normalizedPath)) {
        return;
      }

      // Check if file is still growing or not accessible yet
      let content = '';
      try {
        content = fs.readFileSync(normalizedPath, 'utf-8');
      } catch {
        // If file is locked or still being created, skip for now; watcher will trigger again
        return;
      }

      // Extract scope from path if not forced
      // Expected structure: .../projects/<projectId>/sessions/<sessionId>/inbox/chatgpt/<filename>
      let scope = forcedScope;
      if (!scope) {
        const parts = normalizedPath.split(path.sep);
        const inboxIdx = parts.lastIndexOf('inbox');
        if (inboxIdx >= 3 && parts[inboxIdx - 2] === 'sessions' && parts[inboxIdx - 4] === 'projects') {
          scope = {
            projectId: parts[inboxIdx - 3],
            sessionId: parts[inboxIdx - 1],
          };
        }
      }

      const parseResult = parseBridgeMessage(content, normalizedPath, scope);

      if (!parseResult.success) {
        // Handle rejected message: move to rejected/chatgpt/
        await this.handleRejection(normalizedPath, parseResult.error, content, scope);
        return;
      }

      const validMessage = parseResult.message;

      // Notify accepted handler (which persists to SQLite and handles handshake)
      await this.handlers.onMessageAccepted(validMessage);

      // Upon successful handling, move input file to processed/chatgpt/
      this.moveToProcessed(normalizedPath, validMessage.metadata.id);
    } catch (err: unknown) {
      console.error('[InboxWatcher] Unexpected error processing file:', normalizedPath, err);
    } finally {
      this.inFlight.delete(normalizedPath);
    }
  }

  private async handleRejection(
    filePath: string,
    error: MessageValidationError,
    rawContent: string,
    scope?: { projectId: string; sessionId: string }
  ): Promise<void> {
    try {
      const dirName = path.dirname(filePath);
      const sessionDir = path.resolve(dirName, '..', '..');
      const rejectedDir = path.join(sessionDir, 'rejected', 'chatgpt');
      fs.mkdirSync(rejectedDir, { recursive: true });

      const fileName = path.basename(filePath);
      const baseName = path.parse(fileName).name;
      const targetPath = path.join(rejectedDir, fileName);
      const errorMetaPath = path.join(rejectedDir, `${baseName}.error.json`);

      // Move malformed file
      if (fs.existsSync(filePath)) {
        try {
          fs.renameSync(filePath, targetPath);
        } catch {
          fs.copyFileSync(filePath, targetPath);
          fs.unlinkSync(filePath);
        }
      }

      // Write diagnostic rejection telemetry
      fs.writeFileSync(
        errorMetaPath,
        JSON.stringify(
          {
            code: error.code,
            message: error.message,
            timestamp: new Date().toISOString(),
            originalPath: filePath,
            error,
          },
          null,
          2
        ),
        'utf-8'
      );

      await this.handlers.onMessageRejected({
        filePath,
        error,
        rawContent,
        projectId: scope?.projectId,
        sessionId: scope?.sessionId,
      });
    } catch (err) {
      console.error('[InboxWatcher] Failed to archive rejected message:', err);
    }
  }

  private moveToProcessed(filePath: string, messageId: string): void {
    try {
      if (!fs.existsSync(filePath)) {
        return;
      }

      const dirName = path.dirname(filePath);
      const sessionDir = path.resolve(dirName, '..', '..');
      const processedDir = path.join(sessionDir, 'processed', 'chatgpt');
      fs.mkdirSync(processedDir, { recursive: true });

      const targetPath = path.join(processedDir, `${messageId}.md`);
      try {
        fs.renameSync(filePath, targetPath);
      } catch {
        fs.copyFileSync(filePath, targetPath);
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error('[InboxWatcher] Failed to move message to processed directory:', err);
    }
  }

  public isWatching(): boolean {
    return this.watcher !== null;
  }

  public getWatchedPaths(): string[] {
    return Array.from(this.watchedPaths);
  }

  public async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.watchedPaths.clear();
    this.inFlight.clear();
  }
}
