import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ensureBridgeRoot,
  initSessionWorkspace,
  resolveSessionPaths,
  writeCanonicalConversation,
  formatBridgeMessage,
  parseBridgeMessage,
  writeOutboundMessage,
  InboxWatcher,
  HandshakeManager,
  BridgeService,
  MAX_MESSAGE_SIZE_BYTES,
} from '../src/main/bridge/index.js';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import type { KnotMessageMetadata, Message } from '../src/shared/types.js';

describe('ChatGPT ↔ Knot Filesystem Communication Bridge', () => {
  let tempDir: string;
  let bridgeRoot: string;
  let dbPath: string;
  let dbService: DatabaseService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-bridge-test-'));
    bridgeRoot = path.join(tempDir, 'bridge', 'v1');
    dbPath = path.join(tempDir, 'test.sqlite');
    dbService = createDatabaseService(dbPath);
  });

  afterEach(() => {
    dbService.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('1. Filesystem Workspace Architecture', () => {
    it('creates root directory, bridge-instructions.md and README.md', () => {
      ensureBridgeRoot(bridgeRoot);

      expect(fs.existsSync(bridgeRoot)).toBe(true);
      expect(fs.existsSync(path.join(bridgeRoot, 'bridge-instructions.md'))).toBe(true);
      expect(fs.existsSync(path.join(bridgeRoot, 'README.md'))).toBe(true);

      const instructions = fs.readFileSync(path.join(bridgeRoot, 'bridge-instructions.md'), 'utf-8');
      expect(instructions).toContain('# Knot Bridge Instructions for ChatGPT');
      expect(instructions).toContain('KNOT_MESSAGE_V1');
      expect(instructions).toContain('Desktop Commander');
    });

    it('initializes session workspace structure and conversation.md', () => {
      const projectId = randomUUID();
      const sessionId = randomUUID();

      const paths = initSessionWorkspace(bridgeRoot, projectId, sessionId);

      expect(fs.existsSync(paths.projectDir)).toBe(true);
      expect(fs.existsSync(paths.sessionDir)).toBe(true);
      expect(fs.existsSync(paths.inboxDir)).toBe(true);
      expect(fs.existsSync(paths.processedDir)).toBe(true);
      expect(fs.existsSync(paths.rejectedDir)).toBe(true);
      expect(fs.existsSync(paths.outboxDir)).toBe(true);
      expect(fs.existsSync(paths.conversationFile)).toBe(true);

      const conversationContent = fs.readFileSync(paths.conversationFile, 'utf-8');
      expect(conversationContent).toContain('# Knot Session Conversation');
      expect(conversationContent).toContain(`Project ID**: \`${projectId}\``);
      expect(conversationContent).toContain(`Session ID**: \`${sessionId}\``);
    });

    it('writes outbound messages atomically via temporary file and rename', () => {
      const projectId = randomUUID();
      const sessionId = randomUUID();
      const paths = initSessionWorkspace(bridgeRoot, projectId, sessionId);

      const messageId = randomUUID();
      const content = 'Test message from Knot agent';

      const written = writeOutboundMessage(paths.outboxDir, projectId, sessionId, content, {
        id: messageId,
        recipient: 'chatgpt',
      });

      expect(written.id).toBe(messageId);
      expect(fs.existsSync(written.filePath)).toBe(true);
      expect(written.filePath).toBe(path.join(paths.outboxDir, `${messageId}.md`));

      // Ensure no dangling .tmp files exist
      const tmpFiles = fs.readdirSync(paths.outboxDir).filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles.length).toBe(0);

      const fileContent = fs.readFileSync(written.filePath, 'utf-8');
      expect(fileContent).toContain('<!-- KNOT_MESSAGE_V1');
      expect(fileContent).toContain(messageId);
      expect(fileContent).toContain(content);
    });

    it('updates canonical conversation.md with single-writer guarantees', () => {
      const projectId = randomUUID();
      const sessionId = randomUUID();
      const paths = initSessionWorkspace(bridgeRoot, projectId, sessionId);

      const mockMessages: Message[] = [
        {
          id: randomUUID(),
          sessionId,
          sequence: 1,
          sender: 'knot',
          recipient: 'chatgpt',
          messageType: 'text',
          contentMarkdown: 'Hello ChatGPT from Knot!',
          correlationId: null,
          createdAt: new Date('2026-11-24T10:00:00Z').toISOString(),
        },
        {
          id: randomUUID(),
          sessionId,
          sequence: 2,
          sender: 'chatgpt',
          recipient: 'knot',
          messageType: 'text',
          contentMarkdown: 'Hello Knot! Ready to collaborate.',
          correlationId: null,
          createdAt: new Date('2026-11-24T10:01:00Z').toISOString(),
        },
      ];

      writeCanonicalConversation(
        paths.sessionDir,
        { id: projectId, name: 'Knot Project' },
        { id: sessionId, title: 'Session Conversation' },
        mockMessages
      );

      const conv = fs.readFileSync(paths.conversationFile, 'utf-8');
      expect(conv).toContain('#1 | KNOT');
      expect(conv).toContain('Hello ChatGPT from Knot!');
      expect(conv).toContain('#2 | CHATGPT');
      expect(conv).toContain('Hello Knot! Ready to collaborate.');
    });
  });

  describe('2. Markdown Protocol and Strict Validation', () => {
    const projectId = randomUUID();
    const sessionId = randomUUID();

    it('formats and parses a valid bridge message correctly', () => {
      const metadata: KnotMessageMetadata = {
        id: randomUUID(),
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const body = '### Analysis Report\n\nAll tasks completed successfully.';

      const formatted = formatBridgeMessage(metadata, body);
      const parsed = parseBridgeMessage(formatted, '/mock/path.md', { projectId, sessionId });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.message.metadata.id).toBe(metadata.id);
        expect(parsed.message.metadata.protocol).toBe('v1');
        expect(parsed.message.metadata.projectId).toBe(projectId);
        expect(parsed.message.metadata.sessionId).toBe(sessionId);
        expect(parsed.message.metadata.sender).toBe('chatgpt');
        expect(parsed.message.metadata.type).toBe('message');
        expect(parsed.message.bodyMarkdown).toBe(body);
      }
    });

    it('rejects messages that exceed the 256 KB size limit', () => {
      const hugeBody = 'x'.repeat(MAX_MESSAGE_SIZE_BYTES + 1024);
      const metadata: KnotMessageMetadata = {
        id: randomUUID(),
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };

      const formatted = formatBridgeMessage(metadata, hugeBody);
      const parsed = parseBridgeMessage(formatted, '/mock/path.md');

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('MESSAGE_TOO_LARGE');
      }
    });

    it('rejects empty messages', () => {
      const parsed = parseBridgeMessage('   \n\n  ', '/mock/empty.md');
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('EMPTY_MESSAGE');
      }
    });

    it('rejects messages with missing or malformed protocol header', () => {
      const parsed = parseBridgeMessage('Just a plain markdown note without header', '/mock/plain.md');
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('MALFORMED_HEADER');
      }
    });

    it('rejects invalid JSON in metadata block', () => {
      const malformed = `<!-- KNOT_MESSAGE_V1\n{ "invalid": json without closing quote\n-->\n\nBody`;
      const parsed = parseBridgeMessage(malformed, '/mock/badjson.md');
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('INVALID_METADATA_JSON');
      }
    });

    it('rejects non-v1 protocol version', () => {
      const metadata = {
        id: randomUUID(),
        protocol: 'v2', // Invalid
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const raw = `<!-- KNOT_MESSAGE_V1\n${JSON.stringify(metadata)}\n-->\n\nValid body`;
      const parsed = parseBridgeMessage(raw, '/mock/v2.md');
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('UNSUPPORTED_PROTOCOL');
      }
    });

    it('rejects invalid UUID formats', () => {
      const metadata = {
        id: 'not-a-valid-uuid-1234',
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const raw = `<!-- KNOT_MESSAGE_V1\n${JSON.stringify(metadata)}\n-->\n\nBody`;
      const parsed = parseBridgeMessage(raw, '/mock/baduuid.md');
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('INVALID_UUID');
      }
    });

    it('rejects scope mismatch when project or session ID does not match expected workspace', () => {
      const otherProjectId = randomUUID();
      const metadata: KnotMessageMetadata = {
        id: randomUUID(),
        protocol: 'v1',
        projectId: otherProjectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const raw = formatBridgeMessage(metadata, 'Hello scope check');
      const parsed = parseBridgeMessage(raw, '/mock/scope.md', { projectId, sessionId });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('PROJECT_MISMATCH');
      }
    });

    it('rejects invalid sender or recipient', () => {
      const metadata = {
        id: randomUUID(),
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'unauthorized_hacker',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const raw = `<!-- KNOT_MESSAGE_V1\n${JSON.stringify(metadata)}\n-->\n\nBody`;
      const parsed = parseBridgeMessage(raw, '/mock/badsender.md');
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('INVALID_SENDER');
      }
    });

    it('rejects empty markdown body', () => {
      const metadata: KnotMessageMetadata = {
        id: randomUUID(),
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const raw = `<!-- KNOT_MESSAGE_V1\n${JSON.stringify(metadata)}\n-->\n\n    \n\n`;
      const parsed = parseBridgeMessage(raw, '/mock/nobody.md');
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.code).toBe('EMPTY_BODY');
      }
    });
  });

  describe('3. Inbox Watcher, File Processing & Error Isolation', () => {
    it('moves valid message to processed/chatgpt/ and triggers accepted callback', async () => {
      const projectId = randomUUID();
      const sessionId = randomUUID();
      const paths = initSessionWorkspace(bridgeRoot, projectId, sessionId);

      const acceptedMessages: string[] = [];
      const watcher = new InboxWatcher({
        onMessageAccepted: async (msg) => {
          acceptedMessages.push(msg.metadata.id);
        },
        onMessageRejected: async () => {},
      });

      watcher.watchInbox(paths.inboxDir);

      const messageId = randomUUID();
      const metadata: KnotMessageMetadata = {
        id: messageId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const content = formatBridgeMessage(metadata, 'Hello from watched inbox!');

      // Write directly to inbox
      const inboxFile = path.join(paths.inboxDir, `${messageId}.md`);
      fs.writeFileSync(inboxFile, content, 'utf-8');

      // Process file through watcher
      await watcher.handleFile(inboxFile, { projectId, sessionId });

      expect(acceptedMessages).toContain(messageId);
      expect(fs.existsSync(inboxFile)).toBe(false);
      expect(fs.existsSync(path.join(paths.processedDir, `${messageId}.md`))).toBe(true);

      await watcher.close();
    });

    it('moves malformed message to rejected/chatgpt/ and writes .error.json diagnostic', async () => {
      const projectId = randomUUID();
      const sessionId = randomUUID();
      const paths = initSessionWorkspace(bridgeRoot, projectId, sessionId);

      const rejectedErrors: string[] = [];
      const watcher = new InboxWatcher({
        onMessageAccepted: async () => {},
        onMessageRejected: async (rej) => {
          rejectedErrors.push(rej.error.code);
        },
      });

      const badFile = path.join(paths.inboxDir, 'bad-file.md');
      fs.writeFileSync(badFile, 'This has no protocol v1 header at all.', 'utf-8');

      await watcher.handleFile(badFile, { projectId, sessionId });

      expect(rejectedErrors).toContain('MALFORMED_HEADER');
      expect(fs.existsSync(badFile)).toBe(false);
      expect(fs.existsSync(path.join(paths.rejectedDir, 'bad-file.md'))).toBe(true);
      expect(fs.existsSync(path.join(paths.rejectedDir, 'bad-file.error.json'))).toBe(true);

      const errJson = JSON.parse(
        fs.readFileSync(path.join(paths.rejectedDir, 'bad-file.error.json'), 'utf-8')
      );
      expect(errJson.code).toBe('MALFORMED_HEADER');

      await watcher.close();
    });

    it('startup scan processes existing files in inbox directory', async () => {
      const projectId = randomUUID();
      const sessionId = randomUUID();
      const paths = initSessionWorkspace(bridgeRoot, projectId, sessionId);

      // Pre-seed an unread message in inbox before starting watcher
      const preMessageId = randomUUID();
      const metadata: KnotMessageMetadata = {
        id: preMessageId,
        protocol: 'v1',
        projectId,
        sessionId,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(paths.inboxDir, `${preMessageId}.md`),
        formatBridgeMessage(metadata, 'Pre-existing inbox message'),
        'utf-8'
      );

      const processedIds: string[] = [];
      const watcher = new InboxWatcher({
        onMessageAccepted: async (msg) => {
          processedIds.push(msg.metadata.id);
        },
        onMessageRejected: async () => {},
      });

      await watcher.scanInbox(paths.inboxDir, { projectId, sessionId });

      expect(processedIds).toContain(preMessageId);
      expect(fs.existsSync(path.join(paths.processedDir, `${preMessageId}.md`))).toBe(true);

      await watcher.close();
    });
  });

  describe('4. Handshake Connection Test Protocol', () => {
    let handshakeManager: HandshakeManager;
    let projectId: string;
    let sessionId: string;
    let paths: ReturnType<typeof initSessionWorkspace>;

    beforeEach(() => {
      handshakeManager = new HandshakeManager();
      projectId = randomUUID();
      sessionId = randomUUID();
      paths = initSessionWorkspace(bridgeRoot, projectId, sessionId);
    });

    it('generates a valid handshake challenge with copyable instructions', () => {
      const challenge = handshakeManager.startChallenge(projectId, sessionId, paths);

      expect(challenge.id).toBeDefined();
      expect(challenge.challengeId).toMatch(/^knot-challenge-[0-9a-f]{8}$/i);
      expect(challenge.status).toBe('pending');
      expect(challenge.instructions).toContain(challenge.challengeId);
      expect(challenge.instructions).toContain(paths.outboxDir);
      expect(challenge.instructions).toContain('Desktop Commander');
      expect(challenge.instructions).toContain('handshake_response');

      // Verifies challenge file was written to outbox
      const outboxFiles = fs.readdirSync(paths.outboxDir);
      expect(outboxFiles.some((f) => f.includes(challenge.challengeId))).toBe(true);

      expect(handshakeManager.getState(sessionId, true, true)).toBe('awaiting_response');
    });

    it('verifies connection on valid handshake response', () => {
      const challenge = handshakeManager.startChallenge(projectId, sessionId, paths);

      const responseMessage = {
        metadata: {
          id: randomUUID(),
          protocol: 'v1' as const,
          projectId,
          sessionId,
          sender: 'chatgpt' as const,
          recipient: 'knot' as const,
          type: 'handshake_response' as const,
          challengeId: challenge.challengeId,
          createdAt: new Date().toISOString(),
        },
        bodyMarkdown: '# Handshake Verified',
        rawContent: '',
        filePath: '/mock/path.md',
      };

      const result = handshakeManager.validateResponse(responseMessage);
      expect(result.valid).toBe(true);
      expect(handshakeManager.isSessionVerified(sessionId)).toBe(true);
      expect(handshakeManager.getState(sessionId, true, true)).toBe('verified');
      expect(handshakeManager.getLastVerifiedAt(sessionId)).not.toBeNull();
    });

    it('rejects replay attacks using the same challenge ID', () => {
      const challenge = handshakeManager.startChallenge(projectId, sessionId, paths);

      const responseMessage = {
        metadata: {
          id: randomUUID(),
          protocol: 'v1' as const,
          projectId,
          sessionId,
          sender: 'chatgpt' as const,
          recipient: 'knot' as const,
          type: 'handshake_response' as const,
          challengeId: challenge.challengeId,
          createdAt: new Date().toISOString(),
        },
        bodyMarkdown: 'Verified',
        rawContent: '',
        filePath: '/mock/path.md',
      };

      // First attempt succeeds
      const firstResult = handshakeManager.validateResponse(responseMessage);
      expect(firstResult.valid).toBe(true);

      // Replay attempt fails
      const replayMessage = {
        ...responseMessage,
        metadata: { ...responseMessage.metadata, id: randomUUID() },
      };
      const replayResult = handshakeManager.validateResponse(replayMessage);
      expect(replayResult.valid).toBe(false);
      expect(replayResult.reason).toContain('replay');
    });

    it('rejects mismatched challenge ID', () => {
      handshakeManager.startChallenge(projectId, sessionId, paths);

      const wrongMessage = {
        metadata: {
          id: randomUUID(),
          protocol: 'v1' as const,
          projectId,
          sessionId,
          sender: 'chatgpt' as const,
          recipient: 'knot' as const,
          type: 'handshake_response' as const,
          challengeId: 'knot-challenge-wrong123',
          createdAt: new Date().toISOString(),
        },
        bodyMarkdown: 'Verified',
        rawContent: '',
        filePath: '/mock/path.md',
      };

      const result = handshakeManager.validateResponse(wrongMessage);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('mismatch');
    });
  });

  describe('5. End-to-End BridgeService & SQLite Persistence', () => {
    let bridgeService: BridgeService;
    let project: ReturnType<typeof dbService.projects.create>;
    let session: ReturnType<typeof dbService.sessions.create>;

    beforeEach(() => {
      project = dbService.projects.create({
        name: 'Bridge Test Project',
        repositoryPath: '/mock/repo',
      });
      session = dbService.sessions.create({
        projectId: project.id,
        title: 'Bridge Collaboration Session',
      });

      bridgeService = new BridgeService({
        customBridgeRoot: bridgeRoot,
        dbService,
      });
    });

    afterEach(async () => {
      await bridgeService.close();
    });

    it('outbound message: persists in SQLite, writes to outbox, logs event, syncs conversation.md', async () => {
      const content = 'Hello ChatGPT, please analyze the test fixtures.';

      const msg = await bridgeService.sendMessage(project.id, session.id, content);

      expect(msg.id).toBeDefined();
      expect(msg.sessionId).toBe(session.id);
      expect(msg.sender).toBe('knot');
      expect(msg.sequence).toBe(1);
      expect(msg.contentMarkdown).toBe(content);

      // Verify SQLite messages table
      const storedMessages = dbService.messages.listBySession(session.id);
      expect(storedMessages.length).toBe(1);
      expect(storedMessages[0].id).toBe(msg.id);

      // Verify outbox file
      const sessionPaths = resolveSessionPaths(bridgeRoot, project.id, session.id);
      const outboxFiles = fs.readdirSync(sessionPaths.outboxDir);
      expect(outboxFiles).toContain(`${msg.id}.md`);

      // Verify events table
      const events = dbService.events.listBySession(session.id);
      expect(events.some((e) => e.eventType === 'bridge_message_published')).toBe(true);

      // Verify conversation.md sync
      const conv = fs.readFileSync(sessionPaths.conversationFile, 'utf-8');
      expect(conv).toContain(content);
    });

    it('inbound message: processes from inbox, persists in SQLite, updates conversation.md', async () => {
      const sessionPaths = bridgeService.initSessionBridge(project.id, session.id);

      const inboundId = randomUUID();
      const metadata: KnotMessageMetadata = {
        id: inboundId,
        protocol: 'v1',
        projectId: project.id,
        sessionId: session.id,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const responseBody = 'I have completed the analysis. All 12 fixtures passed.';
      const rawMarkdown = formatBridgeMessage(metadata, responseBody);

      // Write to inbox
      const inboxFile = path.join(sessionPaths.inboxDir, `${inboundId}.md`);
      fs.writeFileSync(inboxFile, rawMarkdown, 'utf-8');

      // Trigger watcher scan
      const watcher = (bridgeService as unknown as { watcher: InboxWatcher }).watcher;
      await watcher.scanInbox(sessionPaths.inboxDir, {
        projectId: project.id,
        sessionId: session.id,
      });

      // Verify message is saved in SQLite
      const messages = dbService.messages.listBySession(session.id);
      expect(messages.some((m) => m.id === inboundId && m.sender === 'chatgpt')).toBe(true);

      // Verify conversation.md contains response
      const conv = fs.readFileSync(sessionPaths.conversationFile, 'utf-8');
      expect(conv).toContain(responseBody);

      // Verify file moved to processed/
      expect(fs.existsSync(path.join(sessionPaths.processedDir, `${inboundId}.md`))).toBe(true);
    });

    it('idempotency: re-processing an existing message does not duplicate in SQLite', async () => {
      const sessionPaths = bridgeService.initSessionBridge(project.id, session.id);

      const messageId = randomUUID();
      const metadata: KnotMessageMetadata = {
        id: messageId,
        protocol: 'v1',
        projectId: project.id,
        sessionId: session.id,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'message',
        createdAt: new Date().toISOString(),
      };
      const rawMarkdown = formatBridgeMessage(metadata, 'First write');

      // First write
      const inboxFile = path.join(sessionPaths.inboxDir, `${messageId}.md`);
      fs.writeFileSync(inboxFile, rawMarkdown, 'utf-8');

      const watcher = (bridgeService as unknown as { watcher: InboxWatcher }).watcher;
      await watcher.handleFile(inboxFile, { projectId: project.id, sessionId: session.id });

      expect(dbService.messages.listBySession(session.id).length).toBe(1);

      // Simulate re-arrival of same message ID
      const secondFile = path.join(sessionPaths.inboxDir, `${messageId}.md`);
      fs.writeFileSync(secondFile, rawMarkdown, 'utf-8');
      await watcher.handleFile(secondFile, { projectId: project.id, sessionId: session.id });

      // Count remains 1!
      expect(dbService.messages.listBySession(session.id).length).toBe(1);
    });

    it('completes end-to-end handshake flow and emits connection-verified event', async () => {
      const sessionPaths = bridgeService.initSessionBridge(project.id, session.id);
      expect(sessionPaths.sessionDir).toBeDefined();

      const receivedEvents: string[] = [];
      bridgeService.onEvent((evt) => {
        receivedEvents.push(evt.type);
      });

      // 1. Start handshake test
      const challenge = bridgeService.startConnectionTest(project.id, session.id);
      expect(challenge.challengeId).toBeDefined();
      expect(receivedEvents).toContain('connection-test-started');

      // 2. Simulate ChatGPT writing response to inbox
      const responseFile = challenge.inboxExpectedFilePath;
      const responseMetadata: KnotMessageMetadata = {
        id: randomUUID(),
        protocol: 'v1',
        projectId: project.id,
        sessionId: session.id,
        sender: 'chatgpt',
        recipient: 'knot',
        type: 'handshake_response',
        challengeId: challenge.challengeId,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        responseFile,
        formatBridgeMessage(responseMetadata, '# Handshake Verified by ChatGPT'),
        'utf-8'
      );

      // 3. Process inbox file
      const watcher = (bridgeService as unknown as { watcher: InboxWatcher }).watcher;
      await watcher.handleFile(responseFile, {
        projectId: project.id,
        sessionId: session.id,
      });

      // 4. Verify status transition
      expect(receivedEvents).toContain('connection-verified');
      const status = bridgeService.getStatus(session.id);
      expect(status.handshakeState).toBe('verified');
      expect(status.lastVerifiedAt).not.toBeNull();
    });
  });
});
