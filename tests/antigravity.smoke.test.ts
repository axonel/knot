import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabaseService } from '../src/main/database/index.js';
import { BridgeService } from '../src/main/bridge/bridgeService.js';
import { AntigravityManager } from '../src/main/antigravity/antigravityManager.js';
import { cliDetector } from '../src/main/antigravity/cliDetector.js';
import { parseBridgeMessage } from '../src/main/bridge/protocol.js';

describe('Google Antigravity Live Smoke Test', () => {
  it(
    'connects to host agy CLI, streams response, persists to SQLite, and publishes to bridge outbox',
    async () => {
      // 1. Detect CLI
      const caps = cliDetector.detect();
      if (!caps.installed || caps.readiness !== 'ready') {
        console.log('Skipping live smoke test: agy CLI is not installed or not ready on this machine.');
        return;
      }

      // 2. Setup temporary project & database
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-smoke-live-'));
      const projectDir = path.join(tempDir, 'project');
      fs.mkdirSync(projectDir, { recursive: true });

      const dbPath = path.join(tempDir, 'smoke.sqlite');
      const dbService = createDatabaseService(dbPath);

      const bridgeService = new BridgeService({
        customBridgeRoot: path.join(tempDir, 'bridge', 'v1'),
        dbService,
      });

      const manager = new AntigravityManager({
        dbService,
        bridgeService,
      });

      try {
        const project = dbService.projects.create({
          name: 'Smoke Project',
          repositoryPath: projectDir,
        });

        const session = dbService.sessions.create({
          projectId: project.id,
          title: 'Live Smoke Session',
        });

        // Start agent
        await manager.start(session.id);
        const status = await manager.getStatus(session.id);
        expect(status.state).toBe('ready');

        // Send live prompt
        await manager.sendMessage(session.id, 'Reply exactly: KNOT_ANTIGRAVITY_CONNECTED');

        // Verify messages in SQLite
        const messages = dbService.messages.listBySession(session.id);
        expect(messages.length).toBeGreaterThanOrEqual(2);

        const userMsg = messages.find((m) => m.sender === 'user');
        expect(userMsg).toBeDefined();
        expect(userMsg?.contentMarkdown).toContain('KNOT_ANTIGRAVITY_CONNECTED');

        const agentMsg = messages.find((m) => m.sender === 'antigravity');
        expect(agentMsg).toBeDefined();
        expect(agentMsg?.contentMarkdown).toContain('KNOT_ANTIGRAVITY_CONNECTED');

        // Verify outbox publication for ChatGPT bridge
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
        const parsed = parseBridgeMessage(outboxContent, outboxFiles[0]);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          expect(parsed.message.metadata.sender).toBe('antigravity');
          expect(parsed.message.metadata.recipient).toBe('chatgpt');
          expect(parsed.message.bodyMarkdown).toContain('KNOT_ANTIGRAVITY_CONNECTED');
        }
      } finally {
        await manager.cleanup();
        await bridgeService.close();
        dbService.close();
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    },
    60000
  );
});
