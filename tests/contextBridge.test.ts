import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { formatBridgeMessage } from '../src/main/bridge/protocol.js';

describe('BridgeService Context Vault Integration', () => {
  let tempDir: string;
  let dbPath: string;
  let bridgeRoot: string;
  let dbService: DatabaseService;
  let bridgeService: BridgeService;
  let projectId: string;
  let sessionId: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-bridge-ctx-test-'));
    dbPath = path.join(tempDir, 'knot-test.sqlite');
    bridgeRoot = path.join(tempDir, 'bridge');

    dbService = createDatabaseService(dbPath);
    const project = dbService.projects.create({
      name: 'Bridge Context Project',
      repositoryPath: tempDir,
    });
    projectId = project.id;

    const session = dbService.sessions.create({
      projectId,
      title: 'Active Session',
    });
    sessionId = session.id;

    bridgeService = new BridgeService({
      customBridgeRoot: bridgeRoot,
      dbService,
    });

    bridgeService.initSessionBridge(projectId, sessionId);
  });

  afterEach(async () => {
    await bridgeService.close();
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('processes incoming context_update message and materializes documents & manifest', async () => {
    const msgId = randomUUID();
    const rawMsg = formatBridgeMessage(
      {
        id: msgId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'context_update',
        createdAt: new Date().toISOString(),
        metadata: {
          scope: 'project',
          category: 'architecture_decisions',
          title: 'Database Architecture Decision',
          changeSummary: 'Recorded SQLite schema design',
        },
      },
      '# Database Architecture Decision\n\nUse SQLite with WAL mode enabled.'
    );

    await bridgeService.handleInboundAccepted({
      metadata: {
        id: msgId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'context_update',
        createdAt: new Date().toISOString(),
        metadata: {
          scope: 'project',
          category: 'architecture_decisions',
          title: 'Database Architecture Decision',
          changeSummary: 'Recorded SQLite schema design',
        },
      },
      bodyMarkdown: '# Database Architecture Decision\n\nUse SQLite with WAL mode enabled.',
      rawContent: rawMsg,
      filePath: path.join(bridgeRoot, 'inbox', `${msgId}.md`),
    });

    // Check SQLite persistence
    const docs = dbService.context.list({ projectId });
    expect(docs).toHaveLength(1);
    const doc = docs[0];
    expect(doc.title).toBe('Database Architecture Decision');
    expect(doc.category).toBe('architecture_decisions');
    expect(doc.currentRevision).toBe(1);
    expect(doc.provenance).toBe('chatgpt-authored');

    // Check materialized file on disk
    const expectedFilePath = path.join(bridgeRoot, 'projects', projectId, 'context', `${doc.id}.md`);
    expect(fs.existsSync(expectedFilePath)).toBe(true);
    const materializedContent = fs.readFileSync(expectedFilePath, 'utf-8');
    expect(materializedContent).toContain('<!-- KNOT_CONTEXT_V1');
    expect(materializedContent).toContain('# Database Architecture Decision');

    // Check context manifest on disk
    const manifestPath = path.join(bridgeRoot, 'projects', projectId, 'context-manifest.md');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    expect(manifestContent).toContain('# Knot Context Manifest: Bridge Context Project');
    expect(manifestContent).toContain('Database Architecture Decision');
  });

  it('updates existing document on context_update when contextId provided', async () => {
    // Create initial doc in DB
    const initial = dbService.context.create({
      projectId,
      title: 'Initial Title',
      category: 'technical_constraints',
      contentMarkdown: 'Constraint 1',
      author: 'user',
    });

    const updateMsgId = randomUUID();
    await bridgeService.handleInboundAccepted({
      metadata: {
        id: updateMsgId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'context_update',
        createdAt: new Date().toISOString(),
        metadata: {
          contextId: initial.id,
          expectedRevision: 1,
          category: 'technical_constraints',
          title: 'Updated Constraints',
          changeSummary: 'Added node 22 constraint',
        },
      },
      bodyMarkdown: '# Updated Constraints\n\nMust use Node 22.',
      rawContent: '',
      filePath: '',
    });

    const updated = dbService.context.get(initial.id);
    expect(updated?.currentRevision).toBe(2);
    expect(updated?.title).toBe('Updated Constraints');
    expect(updated?.contentMarkdown).toBe('# Updated Constraints\n\nMust use Node 22.');
  });

  it('records conflict when expectedRevision does not match', async () => {
    const doc = dbService.context.create({
      projectId,
      title: 'Concurrent Doc',
      category: 'user_notes',
      contentMarkdown: 'Rev 1 content',
    });

    // Bump to rev 2
    dbService.context.update(doc.id, { contentMarkdown: 'Rev 2 content' });

    // Inbound message with stale expectedRevision = 1
    const staleMsgId = randomUUID();
    let conflictEmitted = false;
    bridgeService.onEvent((ev) => {
      if (ev.type === ('context-conflict' as any)) {
        conflictEmitted = true;
      }
    });

    await bridgeService.handleInboundAccepted({
      metadata: {
        id: staleMsgId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'context_update',
        createdAt: new Date().toISOString(),
        metadata: {
          contextId: doc.id,
          expectedRevision: 1,
          title: 'Stale Edit',
        },
      },
      bodyMarkdown: 'Stale edit body',
      rawContent: '',
      filePath: '',
    });

    expect(conflictEmitted).toBe(true);

    // Existing doc should remain intact at revision 2
    const current = dbService.context.get(doc.id);
    expect(current?.currentRevision).toBe(2);
    expect(current?.contentMarkdown).toBe('Rev 2 content');

    // Conflict recorded in SQLite
    const conflicts = dbService.context.listConflicts(projectId);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].expectedRevision).toBe(1);
    expect(conflicts[0].actualRevision).toBe(2);
  });

  it('handles session handoff context updates and surfaces them in manifest', async () => {
    const handoffMsgId = randomUUID();
    await bridgeService.handleInboundAccepted({
      metadata: {
        id: handoffMsgId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'context_update',
        createdAt: new Date().toISOString(),
        metadata: {
          scope: 'session',
          category: 'session_handoff',
          title: 'Session 1 Handoff Note',
        },
      },
      bodyMarkdown: '# Session 1 Handoff\n\nCompleted step A, next step is B.',
      rawContent: '',
      filePath: '',
    });

    const handoff = dbService.context.getHandoff(sessionId);
    expect(handoff).not.toBeNull();
    expect(handoff?.category).toBe('session_handoff');

    const manifestPath = path.join(bridgeRoot, 'projects', projectId, 'context-manifest.md');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    expect(manifestContent).toContain('## Latest Session Handoff');
    expect(manifestContent).toContain('Session 1 Handoff Note');
  });
});
