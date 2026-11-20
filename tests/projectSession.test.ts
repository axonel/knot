import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabaseService, DatabaseService } from '../src/main/database/index.js';

describe('Project, Session, Message, Task & Event Repositories', () => {
  let tempDir: string;
  let dbPath: string;
  let service: DatabaseService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-repo-test-'));
    dbPath = path.join(tempDir, 'knot-repo.sqlite');
    service = createDatabaseService(dbPath);
  });

  afterEach(() => {
    service.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('ProjectRepository', () => {
    it('creates and retrieves a project with all metadata', () => {
      const created = service.projects.create({
        name: 'Knot Agent Mesh',
        repositoryPath: '/home/user/workspace/knot',
        repositoryRemote: 'https://github.com/axonel/knot',
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe('Knot Agent Mesh');
      expect(created.repositoryPath).toBe('/home/user/workspace/knot');
      expect(created.repositoryRemote).toBe('https://github.com/axonel/knot');
      expect(created.archivedAt).toBeNull();
      expect(created.sessionCount).toBe(0);

      const retrieved = service.projects.get(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Knot Agent Mesh');
    });

    it('rejects creating a project with empty name', () => {
      expect(() => {
        service.projects.create({ name: '   ' });
      }).toThrow('Project name cannot be empty.');
    });

    it('updates project name, path, and remote', () => {
      const p = service.projects.create({ name: 'Old Name' });
      const updated = service.projects.update(p.id, {
        name: 'New Name',
        repositoryPath: '/new/path',
        repositoryRemote: 'https://github.com/axonel/new-knot',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.repositoryPath).toBe('/new/path');
      expect(updated.repositoryRemote).toBe('https://github.com/axonel/new-knot');
    });

    it('archives and unarchives projects and respects list filters', () => {
      const p1 = service.projects.create({ name: 'Project Active' });
      const p2 = service.projects.create({ name: 'Project To Archive' });

      service.projects.archive(p2.id);

      const activeList = service.projects.list(false);
      expect(activeList.some((p) => p.id === p1.id)).toBe(true);
      expect(activeList.some((p) => p.id === p2.id)).toBe(false);

      const fullList = service.projects.list(true);
      expect(fullList.some((p) => p.id === p1.id)).toBe(true);
      expect(fullList.some((p) => p.id === p2.id)).toBe(true);

      // Unarchive p2
      service.projects.unarchive(p2.id);
      const restoredList = service.projects.list(false);
      expect(restoredList.some((p) => p.id === p2.id)).toBe(true);
    });

    it('bumps project updated_at when a new session is created', async () => {
      const p = service.projects.create({ name: 'Parent Project' });
      const initialUpdatedAt = p.updatedAt;

      // Small delay to ensure timestamp progression
      await new Promise((r) => setTimeout(r, 10));

      service.sessions.create({
        projectId: p.id,
        title: 'Session 1',
      });

      const refreshed = service.projects.get(p.id);
      expect(new Date(refreshed!.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(initialUpdatedAt).getTime()
      );
      expect(refreshed?.sessionCount).toBe(1);
    });
  });

  describe('SessionRepository & State Machine', () => {
    let projectId: string;

    beforeEach(() => {
      const p = service.projects.create({ name: 'Session Test Project' });
      projectId = p.id;
    });

    it('creates a session in active state with valid project association', () => {
      const sess = service.sessions.create({
        projectId,
        title: 'Initial Build Session',
        metadata: { feature: 'SQLite' },
      });

      expect(sess.id).toBeDefined();
      expect(sess.projectId).toBe(projectId);
      expect(sess.title).toBe('Initial Build Session');
      expect(sess.status).toBe('active');
      expect(sess.metadata).toEqual({ feature: 'SQLite' });
      expect(sess.startedAt).toBeDefined();
      expect(sess.endedAt).toBeNull();
    });

    it('rejects session creation for non-existent project', () => {
      expect(() => {
        service.sessions.create({
          projectId: 'non-existent-id',
          title: 'Orphan Session',
        });
      }).toThrow(/Project not found/);
    });

    it('updates session title', () => {
      const sess = service.sessions.create({ projectId, title: 'Original Title' });
      const updated = service.sessions.updateTitle(sess.id, 'Refined Title');
      expect(updated.title).toBe('Refined Title');
    });

    describe('State Transition Validation', () => {
      it('allows valid transitions: active -> paused -> active -> completed -> archived -> active', () => {
        const sess = service.sessions.create({ projectId, title: 'Lifecycle Session' });
        expect(sess.status).toBe('active');

        // active -> paused
        const paused = service.sessions.updateStatus(sess.id, 'paused');
        expect(paused.status).toBe('paused');

        // paused -> active
        const resumed = service.sessions.updateStatus(sess.id, 'active');
        expect(resumed.status).toBe('active');

        // active -> completed
        const completed = service.sessions.updateStatus(sess.id, 'completed');
        expect(completed.status).toBe('completed');
        expect(completed.endedAt).not.toBeNull();

        // completed -> archived
        const archived = service.sessions.updateStatus(sess.id, 'archived');
        expect(archived.status).toBe('archived');

        // archived -> active
        const reactivated = service.sessions.updateStatus(sess.id, 'active');
        expect(reactivated.status).toBe('active');
      });

      it('disallows invalid transitions and throws descriptive errors', () => {
        const sess = service.sessions.create({ projectId, title: 'Invalid Transition Session' });

        // Complete the session
        service.sessions.updateStatus(sess.id, 'completed');

        // completed -> paused is DISALLOWED
        expect(() => {
          service.sessions.updateStatus(sess.id, 'paused');
        }).toThrow(/Invalid session status transition from 'completed' to 'paused'/);

        // Archive the session
        service.sessions.updateStatus(sess.id, 'archived');

        // archived -> paused is DISALLOWED
        expect(() => {
          service.sessions.updateStatus(sess.id, 'paused');
        }).toThrow(/Invalid session status transition from 'archived' to 'paused'/);

        // archived -> completed is DISALLOWED
        expect(() => {
          service.sessions.updateStatus(sess.id, 'completed');
        }).toThrow(/Invalid session status transition from 'archived' to 'completed'/);
      });
    });
  });

  describe('MessageRepository & Monotonic Sequence Numbering', () => {
    let sessionIdA: string;
    let sessionIdB: string;

    beforeEach(() => {
      const project = service.projects.create({ name: 'Messages Project' });
      const sA = service.sessions.create({ projectId: project.id, title: 'Session A' });
      const sB = service.sessions.create({ projectId: project.id, title: 'Session B' });
      sessionIdA = sA.id;
      sessionIdB = sB.id;
    });

    it('assigns monotonically increasing sequence numbers (1, 2, 3...) per session', () => {
      const m1 = service.messages.append({
        sessionId: sessionIdA,
        sender: 'user',
        contentMarkdown: 'First message',
      });
      const m2 = service.messages.append({
        sessionId: sessionIdA,
        sender: 'chatgpt',
        contentMarkdown: 'Second message',
      });
      const m3 = service.messages.append({
        sessionId: sessionIdA,
        sender: 'antigravity',
        contentMarkdown: 'Third message',
      });

      expect(m1.sequence).toBe(1);
      expect(m2.sequence).toBe(2);
      expect(m3.sequence).toBe(3);

      const list = service.messages.listBySession(sessionIdA);
      expect(list.map((m) => m.sequence)).toEqual([1, 2, 3]);
      expect(service.messages.countBySession(sessionIdA)).toBe(3);
    });

    it('maintains independent sequence numbers across different sessions', () => {
      const mA1 = service.messages.append({
        sessionId: sessionIdA,
        sender: 'user',
        contentMarkdown: 'Session A Msg 1',
      });
      const mB1 = service.messages.append({
        sessionId: sessionIdB,
        sender: 'user',
        contentMarkdown: 'Session B Msg 1',
      });
      const mA2 = service.messages.append({
        sessionId: sessionIdA,
        sender: 'system',
        contentMarkdown: 'Session A Msg 2',
      });
      const mB2 = service.messages.append({
        sessionId: sessionIdB,
        sender: 'system',
        contentMarkdown: 'Session B Msg 2',
      });

      expect(mA1.sequence).toBe(1);
      expect(mA2.sequence).toBe(2);
      expect(mB1.sequence).toBe(1);
      expect(mB2.sequence).toBe(2);
    });

    it('supports pagination with limit and offset', () => {
      for (let i = 1; i <= 10; i++) {
        service.messages.append({
          sessionId: sessionIdA,
          sender: 'user',
          contentMarkdown: `Message #${i}`,
        });
      }

      const page1 = service.messages.listBySession(sessionIdA, { limit: 4, offset: 0 });
      expect(page1.length).toBe(4);
      expect(page1[0].sequence).toBe(1);
      expect(page1[3].sequence).toBe(4);

      const page2 = service.messages.listBySession(sessionIdA, { limit: 4, offset: 4 });
      expect(page2.length).toBe(4);
      expect(page2[0].sequence).toBe(5);
      expect(page2[3].sequence).toBe(8);
    });
  });

  describe('TaskRepository', () => {
    let sessionId: string;

    beforeEach(() => {
      const project = service.projects.create({ name: 'Tasks Project' });
      const session = service.sessions.create({ projectId: project.id, title: 'Tasks Session' });
      sessionId = session.id;
    });

    it('creates, lists, and updates task statuses', () => {
      const t1 = service.tasks.create({
        sessionId,
        title: 'Run migrations',
        assignedTo: 'antigravity',
        status: 'queued',
      });

      expect(t1.status).toBe('queued');
      expect(t1.assignedTo).toBe('antigravity');
      expect(t1.startedAt).toBeNull();

      // Transition to running
      const running = service.tasks.updateStatus(t1.id, 'running');
      expect(running.status).toBe('running');
      expect(running.startedAt).not.toBeNull();

      // Transition to succeeded
      const succeeded = service.tasks.updateStatus(t1.id, 'succeeded');
      expect(succeeded.status).toBe('succeeded');
      expect(succeeded.completedAt).not.toBeNull();

      // Filter by status
      const allTasks = service.tasks.listBySession(sessionId);
      expect(allTasks.length).toBe(1);

      const succeededTasks = service.tasks.listBySession(sessionId, 'succeeded');
      expect(succeededTasks.length).toBe(1);

      const failedTasks = service.tasks.listBySession(sessionId, 'failed');
      expect(failedTasks.length).toBe(0);
    });
  });

  describe('EventRepository', () => {
    let sessionId: string;

    beforeEach(() => {
      const project = service.projects.create({ name: 'Events Project' });
      const session = service.sessions.create({ projectId: project.id, title: 'Events Session' });
      sessionId = session.id;
    });

    it('appends and filters telemetry events', () => {
      const ev1 = service.events.append({
        sessionId,
        eventType: 'agent_handshake',
        actor: 'knot',
        data: { remoteVersion: '0.3.0' },
      });

      const ev2 = service.events.append({
        sessionId,
        eventType: 'checkpoint',
        actor: 'chatgpt',
        data: { commit: 'feat: add sqlite' },
      });

      expect(ev1.eventType).toBe('agent_handshake');
      expect(ev1.data).toEqual({ remoteVersion: '0.3.0' });
      expect(ev2.eventType).toBe('checkpoint');
      expect(ev2.actor).toBe('chatgpt');

      // List all events
      const allEvents = service.events.listBySession(sessionId);
      expect(allEvents.length).toBe(2);

      // Filter by eventType
      const handshakes = service.events.listBySession(sessionId, { eventType: 'agent_handshake' });
      expect(handshakes.length).toBe(1);
      expect(handshakes[0].id).toBe(ev1.id);
    });
  });
});
