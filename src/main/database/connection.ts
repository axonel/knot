import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { app } from 'electron';
import { runMigrations } from './migrations/index.js';
import { logger } from '../diagnosticLogger.js';

export function resolveDatabasePath(customPath?: string): string {
  if (customPath) {
    return customPath;
  }

  let userDataDir: string;
  try {
    userDataDir = app.getPath('userData');
  } catch {
    const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    userDataDir = path.join(dataHome, 'knot');
  }

  return path.join(userDataDir, 'knot.sqlite');
}

export function initDatabase(customPath?: string): DatabaseSync {
  const dbPath = resolveDatabasePath(customPath);

  logger.info(`Initializing SQLite database at: ${dbPath}`);

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // Configure SQLite PRAGMAs
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  if (dbPath !== ':memory:') {
    try {
      db.exec('PRAGMA journal_mode = WAL;');
    } catch (err) {
      logger.warn('Failed to enable WAL journal mode; continuing with standard journal', err);
    }
  }

  // Execute database migrations
  runMigrations(db);

  logger.info('Database initialized and migrations applied successfully.');
  return db;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
