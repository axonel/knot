import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { computeSha256 } from '../src/main/database/repositories/contextRepository.js';

describe('ContextRepository', () => {
  let tempDir: string;
  let dbPath: string;
  let dbService: DatabaseService;
  let projectId: string;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-context-test-'));
    dbPath = path.join(tempDir, 'knot-test.sqlite');
    dbService = createDatabaseService(dbPath);

    const project = dbService.projects.create({
      name: 'Context Test Project',
      repositoryPath: '/path/to/repo',
    });
    projectId = project.id;

    const session = dbService.sessions.create({
      projectId,
      title: 'Session 1',
    });
    sessionId = session.id;
  });

  afterEach(() => {
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Document Creation', () => {
    it('creates a project-scoped context document with initial revision', () => {
      const doc = dbService.context.create({
        projectId,
        title: 'Architecture Overview',
        category: 'architecture_decisions',
        contentMarkdown: '# Architecture\n\nModular design.',
        author: 'chatgpt',
      });

      expect(doc.id).toBeDefined();
      expect(doc.projectId).toBe(projectId);
      expect(doc.sessionId).toBeNull();
      expect(doc.scope).toBe('project');
      expect(doc.category).toBe('architecture_decisions');
      expect(doc.title).toBe('Architecture Overview');
      expect(doc.contentMarkdown).toBe('# Architecture\n\nModular design.');
      expect(doc.author).toBe('chatgpt');
      expect(doc.provenance).toBe('chatgpt-authored');
      expect(doc.currentRevision).toBe(1);
      expect(doc.isArchived).toBe(false);
      expect(doc.contentHash).toBe(computeSha256('# Architecture\n\nModular design.'));

      // Check revision history
      const revisions = dbService.context.getRevisions(doc.id);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].revision).toBe(1);
      expect(revisions[0].title).toBe('Architecture Overview');
      expect(revisions[0].contentMarkdown).toBe('# Architecture\n\nModular design.');
      expect(revisions[0].contentHash).toBe(doc.contentHash);
      expect(revisions[0].author).toBe('chatgpt');
    });

    it('creates a session-scoped context document', () => {
      const doc = dbService.context.create({
        projectId,
        sessionId,
        title: 'Current Session Notes',
        category: 'session_objective',
        contentMarkdown: 'Focus on database refactor.',
        author: 'user',
      });

      expect(doc.scope).toBe('session');
      expect(doc.sessionId).toBe(sessionId);
      expect(doc.provenance).toBe('user-authored');
    });

    it('validates project and session existence and required fields', () => {
      expect(() => {
        dbService.context.create({
          projectId: 'non-existent',
          title: 'Test',
          category: 'project_overview',
          contentMarkdown: 'Content',
        });
      }).toThrow(/Project not found/);

      expect(() => {
        dbService.context.create({
          projectId,
          sessionId: 'non-existent',
          title: 'Test',
          category: 'project_overview',
          contentMarkdown: 'Content',
        });
      }).toThrow(/Session not found/);

      expect(() => {
        dbService.context.create({
          projectId,
          title: '   ',
          category: 'project_overview',
          contentMarkdown: 'Content',
        });
      }).toThrow(/Context title cannot be empty/);

      expect(() => {
        dbService.context.create({
          projectId,
          title: 'Valid Title',
          category: '',
          contentMarkdown: 'Content',
        });
      }).toThrow(/Context category cannot be empty/);
    });
  });

  describe('Document Update & Revision Management', () => {
    it('increments revision and logs revision record on update', () => {
      const doc = dbService.context.create({
        projectId,
        title: 'Original Title',
        category: 'coding_conventions',
        contentMarkdown: 'Use semicolons.',
        author: 'user',
      });

      const updated = dbService.context.update(doc.id, {
        title: 'Updated Coding Conventions',
        contentMarkdown: 'Use semicolons and TypeScript strict mode.',
        author: 'chatgpt',
        provenance: 'chatgpt-authored',
        changeSummary: 'Added TypeScript strict mode requirement',
      });

      expect(updated.currentRevision).toBe(2);
      expect(updated.title).toBe('Updated Coding Conventions');
      expect(updated.contentMarkdown).toBe('Use semicolons and TypeScript strict mode.');
      expect(updated.author).toBe('chatgpt');
      expect(updated.provenance).toBe('chatgpt-authored');
      expect(updated.contentHash).toBe(computeSha256('Use semicolons and TypeScript strict mode.'));

      const revisions = dbService.context.getRevisions(doc.id);
      expect(revisions).toHaveLength(2);
      expect(revisions[0].revision).toBe(2);
      expect(revisions[0].title).toBe('Updated Coding Conventions');
      expect(revisions[0].changeSummary).toBe('Added TypeScript strict mode requirement');
      expect(revisions[1].revision).toBe(1);
      expect(revisions[1].title).toBe('Original Title');

      const rev1 = dbService.context.getRevision(doc.id, 1);
      expect(rev1?.contentMarkdown).toBe('Use semicolons.');
    });
  });

  describe('Optimistic Concurrency Control (OCC) & Conflict Logging', () => {
    it('detects revision mismatch, records conflict, and rejects update', () => {
      const doc = dbService.context.create({
        projectId,
        title: 'API Spec',
        category: 'architecture_decisions',
        contentMarkdown: 'v1 spec',
        author: 'user',
      });

      // Update once -> revision becomes 2
      dbService.context.update(doc.id, {
        contentMarkdown: 'v2 spec',
      });

      // Attempt update assuming revision is still 1
      expect(() => {
        dbService.context.update(doc.id, {
          title: 'Stale Update',
          contentMarkdown: 'Stale content',
          expectedRevision: 1,
          author: 'chatgpt',
        });
      }).toThrow(/Context conflict: Revision mismatch/);

      // Verify the document was untouched
      const current = dbService.context.get(doc.id);
      expect(current?.currentRevision).toBe(2);
      expect(current?.contentMarkdown).toBe('v2 spec');

      // Verify conflict recorded
      const conflicts = dbService.context.listConflicts(projectId, true);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].contextId).toBe(doc.id);
      expect(conflicts[0].expectedRevision).toBe(1);
      expect(conflicts[0].actualRevision).toBe(2);
      expect(conflicts[0].incomingContent).toBe('Stale content');
      expect(conflicts[0].incomingAuthor).toBe('chatgpt');
      expect(conflicts[0].isResolved).toBe(false);

      // Resolve conflict
      dbService.context.resolveConflict(conflicts[0].id);
      const remainingUnresolved = dbService.context.listConflicts(projectId, true);
      expect(remainingUnresolved).toHaveLength(0);
    });

    it('detects content hash mismatch and records conflict', () => {
      const doc = dbService.context.create({
        projectId,
        title: 'Config Doc',
        category: 'technical_constraints',
        contentMarkdown: 'original',
      });

      expect(() => {
        dbService.context.update(doc.id, {
          contentMarkdown: 'new content',
          expectedContentHash: 'wrong-hash-123',
        });
      }).toThrow(/Context conflict: Content hash mismatch/);

      const conflicts = dbService.context.listConflicts(projectId);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].conflictReason).toMatch(/Content hash mismatch/);
    });
  });

  describe('Filtering and Listing', () => {
    beforeEach(() => {
      dbService.context.create({
        projectId,
        title: 'Project Doc 1',
        category: 'project_overview',
        contentMarkdown: 'General overview for project.',
      });

      dbService.context.create({
        projectId,
        sessionId,
        title: 'Session Doc 1',
        category: 'session_objective',
        contentMarkdown: 'Objective for session 1.',
      });

      dbService.context.create({
        projectId,
        sessionId,
        title: 'Session Handoff',
        category: 'session_handoff',
        contentMarkdown: 'Handoff summary.',
      });
    });

    it('filters by scope', () => {
      const projectDocs = dbService.context.list({ projectId, scope: 'project' });
      expect(projectDocs).toHaveLength(1);
      expect(projectDocs[0].title).toBe('Project Doc 1');

      const sessionDocs = dbService.context.list({ projectId, scope: 'session', sessionId });
      expect(sessionDocs).toHaveLength(2);
    });

    it('filters by category', () => {
      const handoffDocs = dbService.context.list({ projectId, category: 'session_handoff' });
      expect(handoffDocs).toHaveLength(1);
      expect(handoffDocs[0].category).toBe('session_handoff');
    });

    it('searches by query in title and markdown content', () => {
      const searchResults = dbService.context.list({ projectId, searchQuery: 'Handoff' });
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].title).toBe('Session Handoff');

      const contentResults = dbService.context.list({ projectId, searchQuery: 'General overview' });
      expect(contentResults).toHaveLength(1);
      expect(contentResults[0].title).toBe('Project Doc 1');
    });

    it('retrieves session handoff note directly', () => {
      const handoff = dbService.context.getHandoff(sessionId);
      expect(handoff).not.toBeNull();
      expect(handoff?.category).toBe('session_handoff');
      expect(handoff?.title).toBe('Session Handoff');
    });
  });

  describe('Archiving & Restoring', () => {
    it('archives and restores a document', () => {
      const doc = dbService.context.create({
        projectId,
        title: 'Temporary Plan',
        category: 'user_notes',
        contentMarkdown: 'Scratchpad notes.',
      });

      const archived = dbService.context.archive(doc.id);
      expect(archived.isArchived).toBe(true);
      expect(archived.archivedAt).not.toBeNull();

      // Default list excludes archived
      const activeList = dbService.context.list({ projectId });
      expect(activeList.find((d) => d.id === doc.id)).toBeUndefined();

      // Including archived
      const allList = dbService.context.list({ projectId, includeArchived: true });
      expect(allList.find((d) => d.id === doc.id)).toBeDefined();

      // Attempting to update archived document throws
      expect(() => {
        dbService.context.update(doc.id, { title: 'New' });
      }).toThrow(/Cannot update archived context document/);

      // Restore document
      const restored = dbService.context.restore(doc.id);
      expect(restored.isArchived).toBe(false);
      expect(restored.archivedAt).toBeNull();

      const finalList = dbService.context.list({ projectId });
      expect(finalList.find((d) => d.id === doc.id)).toBeDefined();
    });
  });
});
