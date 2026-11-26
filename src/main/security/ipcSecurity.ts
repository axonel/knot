import path from 'node:path';
import type { DatabaseService } from '../database/index.js';

/**
 * Minimal interface representing Electron's IPC event sender frame
 */
export interface MinimalIpcEvent {
  processId?: number;
  frameId?: number;
  senderFrame?: {
    url?: string;
  } | null;
}

/**
 * Validates that an IPC call originated from the trusted main window and trusted frame/origin.
 * Throws an Error if unauthorized.
 */
export function validateIpcSender(
  event: MinimalIpcEvent,
  trustedMainFrame?: unknown | null
): void {
  // If trusted main frame is specified, enforce strict reference equality
  if (trustedMainFrame !== undefined && trustedMainFrame !== null) {
    if (event.senderFrame && event.senderFrame !== trustedMainFrame) {
      throw new Error('Forbidden: Unauthorized IPC sender frame.');
    }
  }

  // Validate frame origin if a URL is attached to the sender frame
  if (event.senderFrame?.url) {
    try {
      const parsed = new URL(event.senderFrame.url);
      const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      const isAllowedScheme =
        parsed.protocol === 'file:' ||
        ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && isLocalHost);

      if (!isAllowedScheme) {
        throw new Error(`Forbidden: Unauthorized IPC sender origin "${parsed.origin}".`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('Forbidden:')) {
        throw err;
      }
      throw new Error('Forbidden: Malformed IPC sender frame URL.');
    }
  }
}

/**
 * Validates whether a requested directory path is permitted for opening via the system file manager.
 * Strictly confines opened paths to either the Knot bridge root or a registered project repository directory.
 */
export function isPathAllowedForOpen(
  dirPath: string,
  bridgeRoot?: string | null,
  repoPaths: (string | null | undefined)[] = []
): boolean {
  if (!dirPath || typeof dirPath !== 'string') return false;
  const resolvedTarget = path.resolve(dirPath);

  // 1. Allow within bridge root
  if (bridgeRoot) {
    const resolvedBridge = path.resolve(bridgeRoot);
    const rel = path.relative(resolvedBridge, resolvedTarget);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return true;
    }
  }

  // 2. Allow within registered project repositories
  for (const repoPath of repoPaths) {
    if (repoPath) {
      const resolvedRepo = path.resolve(repoPath);
      const rel = path.relative(resolvedRepo, resolvedTarget);
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Verifies that a target session belongs to the specified parent project.
 * Prevents cross-project unauthorized resource access.
 */
export function validateCrossProjectAccess(
  projectId: string,
  sessionId: string,
  dbService: DatabaseService
): void {
  if (!projectId || !sessionId) {
    throw new Error('Forbidden: Missing projectId or sessionId in authorization check.');
  }

  const session = dbService.sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: "${sessionId}".`);
  }

  if (session.projectId !== projectId) {
    throw new Error(
      `Forbidden: Cross-project access attempt. Session "${sessionId}" does not belong to project "${projectId}".`
    );
  }
}

/**
 * Verifies that a target task belongs to the specified session.
 * Prevents cross-session task manipulation.
 */
export function validateCrossSessionTaskAccess(
  sessionId: string,
  taskId: string,
  dbService: DatabaseService
): void {
  if (!sessionId || !taskId) {
    throw new Error('Forbidden: Missing sessionId or taskId in authorization check.');
  }

  const task = dbService.tasks.get(taskId);
  if (!task) {
    throw new Error(`Task not found: "${taskId}".`);
  }

  if (task.sessionId !== sessionId) {
    throw new Error(
      `Forbidden: Cross-session access attempt. Task "${taskId}" belongs to session "${task.sessionId}", not "${sessionId}".`
    );
  }
}
