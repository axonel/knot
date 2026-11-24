import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CliDetector } from '../src/main/antigravity/cliDetector.js';
import { StreamParser } from '../src/main/antigravity/streamParser.js';
import { EventMapper } from '../src/main/antigravity/eventMapper.js';
import { AntigravityProcess } from '../src/main/antigravity/antigravityProcess.js';
import { AntigravityManager } from '../src/main/antigravity/antigravityManager.js';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { parseBridgeMessage } from '../src/main/bridge/protocol.js';

describe('Google Antigravity CLI Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-antigravity-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('1. CLI Discovery and Capability Detection', () => {
    it('detects when binary is not found and returns not_installed', () => {
      const detector = new CliDetector();
      const capabilities = detector.detect({
        customPath: path.join(tempDir, 'non-existent-agy'),
        env: { PATH: '' },
      });

      expect(capabilities.installed).toBe(false);
      expect(capabilities.executablePath).toBeNull();
      expect(capabilities.version).toBeNull();
      expect(capabilities.readiness).toBe('not_installed');
      expect(capabilities.errorDetails).toContain('not found');
    });

    it('detects a mock binary in customPath, parses version and capability flags', () => {
      const mockBin = path.join(tempDir, 'agy');
      const script = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "agy version 1.5.14"
  exit 0
fi
if [ "$1" = "--help" ]; then
  echo "stream-json --conversation --mode"
  exit 0
fi
exit 0
`;
      fs.writeFileSync(mockBin, script, { mode: 0o755 });

      const detector = new CliDetector();
      const capabilities = detector.detect({
        customPath: mockBin,
        env: { PATH: process.env.PATH, HOME: tempDir, GEMINI_API_KEY: 'mock-key' },
      });

      expect(capabilities.installed).toBe(true);
      expect(capabilities.executablePath).toBe(mockBin);
      expect(capabilities.version).toBe('1.5.14');
      expect(capabilities.supportsStreaming).toBe(true);
      expect(capabilities.supportsResumption).toBe(true);
      expect(capabilities.readiness).toBe('ready');
    });

    it('identifies auth_required when no credentials or API key exist', () => {
      const mockBin = path.join(tempDir, 'agy');
      fs.writeFileSync(mockBin, '#!/bin/sh\necho "1.5.14"\n', { mode: 0o755 });

      const detector = new CliDetector();
      // Point home to empty tempDir so ~/.gemini/oauth_creds.json does not exist
      const capabilities = detector.detect({
        customPath: mockBin,
        env: { PATH: process.env.PATH, HOME: tempDir },
      });

      expect(capabilities.installed).toBe(true);
      expect(capabilities.readiness).toBe('auth_required');
    });
  });

  describe('2. Stream Parser (NDJSON Incremental Streaming)', () => {
    it('parses complete lines across chunk boundaries', () => {
      const parser = new StreamParser();
      const events: any[] = [];
      parser.on('event', (ev) => events.push(ev));

      parser.push('{"event":"init","conver');
      expect(events.length).toBe(0);

      parser.push('sation_id":"conv-123","init":{}}\n{"event":"step_update","step_update":{"state":"ACTIVE"}}\n');
      expect(events.length).toBe(2);
      expect(events[0].event).toBe('init');
      expect(events[0].conversation_id).toBe('conv-123');
      expect(events[1].event).toBe('step_update');
    });

    it('gracefully handles malformed JSON lines without crashing', () => {
      const parser = new StreamParser();
      const events: any[] = [];
      const malformed: any[] = [];

      parser.on('event', (ev) => events.push(ev));
      parser.on('malformed_line', (info) => malformed.push(info));

      parser.push('{"event":"init"}\nInvalid Not JSON Line\n{"event":"result"}\n');

      expect(events.length).toBe(2);
      expect(malformed.length).toBe(1);
      expect(malformed[0].line).toBe('Invalid Not JSON Line');
    });

    it('enforces maximum buffer size to prevent memory exhaustion', () => {
      const parser = new StreamParser({ maxBufferSize: 100 });
      let errorEmitted = false;
      parser.on('error', () => {
        errorEmitted = true;
      });

      // Push 200 characters without newline
      parser.push('a'.repeat(200));
      expect(errorEmitted).toBe(true);
    });
  });

  describe('3. Event Mapper (Classification & Normalization)', () => {
    it('maps init events and extracts conversation_id and cwd', () => {
      const envelope = {
        event: 'init',
        conversation_id: 'conv-abc',
        init: {
          cwd: '/workspace/project',
          tools: ['read_file', 'run_command'],
          permission_mode: 'ask',
        },
      };

      const mapped = EventMapper.mapEvent(envelope as any);
      expect(mapped.type).toBe('init');
      if (mapped.type === 'init') {
        expect(mapped.conversationId).toBe('conv-abc');
        expect(mapped.cwd).toBe('/workspace/project');
        expect(mapped.tools).toEqual(['read_file', 'run_command']);
      }
    });

    it('maps step_update events with text deltas and tool calls', () => {
      const envelope = {
        event: 'step_update',
        step_update: {
          conversation_id: 'conv-abc',
          step_index: 1,
          state: 'ACTIVE',
          step_type: 'tool_call',
          text_delta: 'Inspecting directory',
          tool_name: 'run_command',
          tool_info: {
            parameters: { CommandLine: 'ls -la' },
            output: 'total 0',
          },
        },
      };

      const mapped = EventMapper.mapEvent(envelope as any);
      expect(mapped.type).toBe('step_update');
      if (mapped.type === 'step_update') {
        expect(mapped.step.stepIndex).toBe(1);
        expect(mapped.step.state).toBe('ACTIVE');
        expect(mapped.step.textDelta).toBe('Inspecting directory');
        expect(mapped.step.tool?.name).toBe('run_command');
        expect(mapped.step.tool?.parameters).toEqual({ CommandLine: 'ls -la' });
        expect(mapped.step.tool?.status).toBe('active');
      }
    });

    it('detects tool permission rejections and soft denials', () => {
      const envelope = {
        event: 'step_update',
        step_update: {
          step_index: 2,
          state: 'DONE',
          tool_name: 'run_command',
          tool_info: {
            output: 'Error: Permission denied by user',
          },
        },
      };

      const mapped = EventMapper.mapEvent(envelope as any);
      expect(mapped.type).toBe('step_update');
      if (mapped.type === 'step_update') {
        expect(mapped.step.tool?.status).toBe('denied');
      }
    });

    it('maps result events', () => {
      const envelope = {
        event: 'result',
        conversation_id: 'conv-abc',
        result: {
          status: 'SUCCESS',
          response: 'Done with task',
          duration_seconds: 3.5,
          num_turns: 1,
        },
      };

      const mapped = EventMapper.mapEvent(envelope as any);
      expect(mapped.type).toBe('result');
      if (mapped.type === 'result') {
        expect(mapped.status).toBe('SUCCESS');
        expect(mapped.response).toBe('Done with task');
        expect(mapped.durationSeconds).toBe(3.5);
      }
    });

    it('detects authentication errors in output/stderr text', () => {
      expect(EventMapper.isAuthError('Please authenticate with agy auth login')).toBe(true);
      expect(EventMapper.isAuthError('401 Unauthorized token expired')).toBe(true);
      expect(EventMapper.isAuthError('Ordinary error: file not found')).toBe(false);
    });
  });

  describe('4. AntigravityProcess Lifecycle & Security', () => {
    it('spawns with stream-json arguments and NEVER includes dangerously-skip-permissions', async () => {
      const fakeExecutable = path.join(tempDir, 'mock-agy.sh');
      const logArgsFile = path.join(tempDir, 'args.log');

      // Shell script that records its argv and simulates stream-json output
      const script = `#!/bin/sh
echo "$@" > "${logArgsFile}"
echo '{"event":"init","conversation_id":"c-123","init":{}}'
while IFS= read -r line; do
  echo '{"event":"step_update","step_update":{"state":"ACTIVE","text_delta":"processing"}}'
  echo '{"event":"result","result":{"status":"SUCCESS","response":"ACK"}}'
done
`;
      fs.writeFileSync(fakeExecutable, script, { mode: 0o755 });

      const proc = new AntigravityProcess({
        sessionId: 'session-1',
        workingDirectory: tempDir,
        executablePath: fakeExecutable,
        mode: 'auto',
      });

      await proc.start();
      expect(proc.state).toBe('ready');

      // Verify command line arguments recorded
      const recordedArgs = fs.readFileSync(logArgsFile, 'utf-8');
      expect(recordedArgs).toContain('--input-format stream-json');
      expect(recordedArgs).toContain('--output-format stream-json');
      expect(recordedArgs).toContain('--mode auto');

      // CRITICAL SECURITY ASSERTION
      expect(recordedArgs).not.toContain('--dangerously-skip-permissions');
      expect(recordedArgs).not.toContain('--always-proceed');

      // Send prompt turn
      const result = await proc.sendMessage('Hello Agent');
      expect(result.status).toBe('SUCCESS');
      expect(result.response).toBe('ACK');

      await proc.stop();
      expect(proc.state).toBe('stopped');
    });

    it('handles turn interruption cleanly via SIGINT', async () => {
      const fakeExecutable = path.join(tempDir, 'mock-hanging-agy.sh');
      const script = `#!/bin/sh
trap 'exit 0' INT
echo '{"event":"init","conversation_id":"c-hang","init":{}}'
while :; do
  read -r line
done
`;
      fs.writeFileSync(fakeExecutable, script, { mode: 0o755 });

      const proc = new AntigravityProcess({
        sessionId: 'session-hang',
        workingDirectory: tempDir,
        executablePath: fakeExecutable,
      });

      await proc.start();
      const sendPromise = proc.sendMessage('prompt');
      expect(proc.state).toBe('thinking');

      // Trigger interrupt
      proc.interrupt();

      // Stop process cleanly
      await proc.stop();
      expect(proc.state).toBe('stopped');
      await expect(sendPromise).rejects.toThrow();
    });
  });

  describe('5. AntigravityManager, Persistence & Bridge Publication', () => {
    let dbService: DatabaseService;
    let bridgeService: BridgeService;
    let manager: AntigravityManager;

    beforeEach(() => {
      const dbPath = path.join(tempDir, 'test.sqlite');
      dbService = createDatabaseService(dbPath);

      bridgeService = new BridgeService({
        customBridgeRoot: path.join(tempDir, 'bridge', 'v1'),
        dbService,
      });

      manager = new AntigravityManager({
        dbService,
        bridgeService,
      });
    });

    afterEach(async () => {
      await manager.cleanup();
      await bridgeService.close();
      dbService.close();
    });

    it('persists agent sessions, messages, and events to SQLite, and publishes response to ChatGPT outbox', async () => {
      // 1. Create Project & Session
      const projectDir = path.join(tempDir, 'my-project');
      fs.mkdirSync(projectDir, { recursive: true });

      const project = dbService.projects.create({
        name: 'My Test Project',
        repositoryPath: projectDir,
      });

      const session = dbService.sessions.create({
        projectId: project.id,
        title: 'Antigravity Session 1',
      });

      // 2. Mock Antigravity CLI script
      const mockBin = path.join(tempDir, 'fake-agy.sh');
      const script = `#!/bin/sh
echo '{"event":"init","conversation_id":"agy-conv-789","init":{"cwd":"${projectDir}"}}'
while IFS= read -r line; do
  echo '{"event":"step_update","step_update":{"conversation_id":"agy-conv-789","step_index":0,"state":"ACTIVE","text_delta":"Analyzing code..."}}'
  echo '{"event":"result","result":{"conversation_id":"agy-conv-789","status":"SUCCESS","response":"KNOT_ANTIGRAVITY_CONNECTED","duration_seconds":1.2,"num_turns":1}}'
done
`;
      fs.writeFileSync(mockBin, script, { mode: 0o755 });

      // Override detector capabilities for test
      vi.spyOn(manager, 'detect').mockResolvedValue({
        installed: true,
        executablePath: mockBin,
        version: '1.5.14',
        supportedModes: ['default', 'accept-edits', 'auto', 'plan'],
        supportsStreaming: true,
        supportsResumption: true,
        readiness: 'ready',
      });

      // 3. Start Agent & Send Message
      await manager.start(session.id, { executablePath: mockBin });

      // Verify agent_sessions record created in SQLite
      const agentSession = dbService.agentSessions.getBySession(session.id, 'antigravity');
      expect(agentSession).not.toBeNull();
      expect(agentSession?.workingDirectory).toBe(projectDir);
      expect(agentSession?.status).toBe('ready');

      // Collect UI events
      const uiEvents: any[] = [];
      manager.on('event', (ev) => uiEvents.push(ev));

      // Send instruction
      await manager.sendMessage(session.id, 'Reply exactly: KNOT_ANTIGRAVITY_CONNECTED');

      // Verify SQLite messages table contains both user prompt and antigravity response
      const messages = dbService.messages.listBySession(session.id);
      expect(messages.length).toBe(2);

      expect(messages[0].sender).toBe('user');
      expect(messages[0].contentMarkdown).toBe('Reply exactly: KNOT_ANTIGRAVITY_CONNECTED');

      expect(messages[1].sender).toBe('antigravity');
      expect(messages[1].contentMarkdown).toBe('KNOT_ANTIGRAVITY_CONNECTED');

      // Verify SQLite events table logged turns
      const events = dbService.events.listBySession(session.id);
      const turnEvent = events.find((e) => e.eventType === 'antigravity_turn_completed');
      expect(turnEvent).toBeDefined();
      expect(turnEvent?.data?.conversationId).toBe('agy-conv-789');

      // 4. Verify Bridge Outbox Publication
      // When Antigravity turn completed, the response was published to outbox/knot/
      const outboxDir = path.join(
        tempDir,
        'bridge',
        'v1',
        'projects',
        project.id,
        'sessions',
        session.id,
        'outbox',
        'knot'
      );
      expect(fs.existsSync(outboxDir)).toBe(true);

      const outboxFiles = fs.readdirSync(outboxDir).filter((f) => f.endsWith('.md'));
      expect(outboxFiles.length).toBeGreaterThanOrEqual(1);

      const outboxContent = fs.readFileSync(path.join(outboxDir, outboxFiles[0]), 'utf-8');
      const parsedOutbox = parseBridgeMessage(outboxContent, outboxFiles[0]);
      expect(parsedOutbox.success).toBe(true);
      if (parsedOutbox.success) {
        expect(parsedOutbox.message.metadata.sender).toBe('antigravity');
        expect(parsedOutbox.message.metadata.recipient).toBe('chatgpt');
        expect(parsedOutbox.message.bodyMarkdown).toBe('KNOT_ANTIGRAVITY_CONNECTED');
      }

      // Verify canonical conversation.md contains the turn
      const convFile = path.join(
        tempDir,
        'bridge',
        'v1',
        'projects',
        project.id,
        'sessions',
        session.id,
        'conversation.md'
      );
      expect(fs.existsSync(convFile)).toBe(true);
      const convContent = fs.readFileSync(convFile, 'utf-8');
      expect(convContent).toContain('KNOT_ANTIGRAVITY_CONNECTED');
      expect(convContent.toLowerCase()).toContain('antigravity');

      // 5. Cleanup stops process cleanly
      await manager.stop(session.id);
      const updatedAgentSession = dbService.agentSessions.getBySession(session.id, 'antigravity');
      expect(updatedAgentSession?.status).toBe('stopped');
    });

    it('isolates working directories per project and rejects running if project repo path is unset', async () => {
      const project = dbService.projects.create({
        name: 'No Path Project',
        repositoryPath: '',
      });

      const session = dbService.sessions.create({
        projectId: project.id,
        title: 'Session without path',
      });

      await expect(manager.start(session.id)).rejects.toThrow('no repository path configured');
    });
  });
});
