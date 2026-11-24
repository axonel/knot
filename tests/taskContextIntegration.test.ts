import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { formatTaskContract } from '../src/main/orchestration/taskContract.js';
import { ingestTaskAssignment } from '../src/main/orchestration/taskIngestion.js';
import { TaskQueue } from '../src/main/orchestration/TaskQueue.js';
import { TaskDispatcher } from '../src/main/orchestration/TaskDispatcher.js';

describe('Task Context Integration & Boundary Enforcement', () => {
  let tempDir: string;
  let dbPath: string;
  let repoPath: string;
  let otherRepoPath: string;
  let dbService: DatabaseService;
  let project1Id: string;
  let project2Id: string;
  let session1Id: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-task-ctx-test-'));
    dbPath = path.join(tempDir, 'knot-test.sqlite');
    repoPath = path.join(tempDir, 'repo1');
    otherRepoPath = path.join(tempDir, 'repo2');
    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(otherRepoPath, { recursive: true });

    dbService = createDatabaseService(dbPath);

    const project1 = dbService.projects.create({
      name: 'Project 1',
      repositoryPath: repoPath,
    });
    project1Id = project1.id;

    const project2 = dbService.projects.create({
      name: 'Project 2',
      repositoryPath: otherRepoPath,
    });
    project2Id = project2.id;

    const session1 = dbService.sessions.create({
      projectId: project1Id,
      title: 'Session 1',
    });
    session1Id = session1.id;
  });

  afterEach(() => {
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('formatTaskContract', () => {
    it('formats contract without context section when no context is attached', () => {
      const task = dbService.tasks.create({
        sessionId: session1Id,
        title: 'Simple Task',
        description: 'Do something simple.',
      });

      const prompt = formatTaskContract(task, repoPath);
      expect(prompt).toContain('# Task: Simple Task');
      expect(prompt).not.toContain('## Attached Project & Session Context');
    });

    it('injects read-only context section when referencedContexts are provided', () => {
      const task = dbService.tasks.create({
        sessionId: session1Id,
        title: 'Contextual Task',
        description: 'Implement auth with constraints.',
      });

      const prompt = formatTaskContract(task, repoPath, [
        {
          id: 'ctx-1',
          title: 'Auth Architecture',
          category: 'architecture_decisions',
          contentMarkdown: 'Use JWT with 15-minute expiration.',
          revision: 2,
        },
      ]);

      expect(prompt).toContain('## Attached Project & Session Context (Read-Only)');
      expect(prompt).toContain('### [architecture_decisions] Auth Architecture (Revision 2)');
      expect(prompt).toContain('Use JWT with 15-minute expiration.');
      expect(prompt).toContain('They are for your reference only. You cannot modify them.');
    });
  });

  describe('Task Ingestion with Context References', () => {
    it('persists contextReferences from inbound message metadata', () => {
      const doc = dbService.context.create({
        projectId: project1Id,
        title: 'Coding Guidelines',
        category: 'coding_conventions',
        contentMarkdown: 'TypeScript only.',
      });

      const msgId = randomUUID();
      const ingestResult = ingestTaskAssignment(
        {
          metadata: {
            id: msgId,
            protocol: 'v1',
            projectId: project1Id,
            sessionId: session1Id,
            sender: 'chatgpt',
            recipient: 'antigravity',
            type: 'task_assignment',
            createdAt: new Date().toISOString(),
            metadata: {
              title: 'Task with Context Reference',
              contextReferences: [
                {
                  contextId: doc.id,
                  revision: 1,
                },
              ],
            },
          },
          bodyMarkdown: 'Do work following coding guidelines.',
          rawContent: '',
          filePath: '',
        },
        dbService
      );

      expect(ingestResult.task.contextReferences).toBeDefined();
      expect(ingestResult.task.contextReferences).toHaveLength(1);
      expect(ingestResult.task.contextReferences![0].contextId).toBe(doc.id);
    });
  });

  describe('TaskDispatcher Resolution and Boundary Enforcement', () => {
    it('resolves valid project context documents and rejects foreign project documents', async () => {
      // Doc in project 1
      const doc1 = dbService.context.create({
        projectId: project1Id,
        title: 'Project 1 Architecture',
        category: 'architecture_decisions',
        contentMarkdown: 'Project 1 details.',
      });

      // Doc in project 2 (foreign)
      const foreignDoc = dbService.context.create({
        projectId: project2Id,
        title: 'Project 2 Secrets',
        category: 'architecture_decisions',
        contentMarkdown: 'Project 2 private info.',
      });

      // Archived doc in project 1
      const archivedDoc = dbService.context.create({
        projectId: project1Id,
        title: 'Old Guidelines',
        category: 'coding_conventions',
        contentMarkdown: 'Deprecated info.',
      });
      dbService.context.archive(archivedDoc.id);

      const task = dbService.tasks.create({
        sessionId: session1Id,
        title: 'Security Audited Task',
        approvalStatus: 'approved',
        status: 'queued',
        contextReferences: [
          { contextId: doc1.id, revision: 1 },
          { contextId: foreignDoc.id, revision: 1 },
          { contextId: archivedDoc.id, revision: 1 },
        ],
      });

      let capturedPrompt = '';
      const mockAntigravityManager: any = {
        executeTaskTurn: vi.fn().mockImplementation(async (_sessId: string, prompt: string) => {
          capturedPrompt = prompt;
          return {
            response: 'Task executed',
            executionDetails: {
              status: 'succeeded',
              summary: 'All done',
            },
          };
        }),
      };

      const queue = new TaskQueue(dbService);
      const dispatcher = new TaskDispatcher({
        dbService,
        queue,
        antigravityManager: mockAntigravityManager,
      });

      await dispatcher.executeTask(task);

      // Verify that doc1 is present in captured prompt
      expect(capturedPrompt).toContain('Project 1 Architecture');
      expect(capturedPrompt).toContain('Project 1 details.');

      // Foreign project doc MUST NOT be injected
      expect(capturedPrompt).not.toContain('Project 2 Secrets');
      expect(capturedPrompt).not.toContain('Project 2 private info.');

      // Archived doc MUST NOT be injected
      expect(capturedPrompt).not.toContain('Old Guidelines');
      expect(capturedPrompt).not.toContain('Deprecated info.');
    });
  });
});
