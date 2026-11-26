import type { DatabaseSync } from 'node:sqlite';
import { initDatabase, withTransaction, resolveDatabasePath } from './connection.js';
import { ProjectRepository } from './repositories/projectRepository.js';
import { SessionRepository } from './repositories/sessionRepository.js';
import { MessageRepository } from './repositories/messageRepository.js';
import { TaskRepository } from './repositories/taskRepository.js';
import { EventRepository } from './repositories/eventRepository.js';
import { AgentSessionRepository } from './repositories/agentSessionRepository.js';
import { ContextRepository } from './repositories/contextRepository.js';
import { ReconciliationRepository } from './repositories/reconciliationRepository.js';

export interface DatabaseService {
  db: DatabaseSync;
  projects: ProjectRepository;
  sessions: SessionRepository;
  messages: MessageRepository;
  tasks: TaskRepository;
  events: EventRepository;
  agentSessions: AgentSessionRepository;
  context: ContextRepository;
  reconciliation: ReconciliationRepository;
  close: () => void;
}

let activeService: DatabaseService | null = null;

export function createDatabaseService(customDbPath?: string): DatabaseService {
  const db = initDatabase(customDbPath);

  const projects = new ProjectRepository(db);
  const sessions = new SessionRepository(db);
  const messages = new MessageRepository(db);
  const tasks = new TaskRepository(db);
  const events = new EventRepository(db);
  const agentSessions = new AgentSessionRepository(db);
  const context = new ContextRepository(db);
  const reconciliation = new ReconciliationRepository(db);

  return {
    db,
    projects,
    sessions,
    messages,
    tasks,
    events,
    agentSessions,
    context,
    reconciliation,
    close: () => {
      try {
        db.close();
      } catch (err) {
        console.error('[Knot DB] Error closing database:', err);
      } finally {
        if (activeService?.db === db) {
          activeService = null;
        }
      }
    },
  };
}

export function initDatabaseService(customDbPath?: string): DatabaseService {
  if (activeService) {
    return activeService;
  }
  activeService = createDatabaseService(customDbPath);
  return activeService;
}

export function getDatabaseService(): DatabaseService {
  if (!activeService) {
    throw new Error('DatabaseService has not been initialized. Call initDatabaseService() first.');
  }
  return activeService;
}

export { withTransaction, resolveDatabasePath };
export * from './types.js';
