import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeOutboundMessage } from './outboundWriter.js';
import type {
  HandshakeChallenge,
  HandshakeState,
  ParsedBridgeMessage,
  SessionBridgePaths,
} from './types.js';

export const HANDSHAKE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export class HandshakeManager {
  private activeChallenges = new Map<string, HandshakeChallenge>(); // key: sessionId
  private verifiedSessions = new Set<string>(); // set of verified sessionIds
  private usedChallengeIds = new Set<string>();
  private lastVerifiedTimestamps = new Map<string, string>(); // sessionId -> ISO timestamp

  public getState(
    sessionId?: string,
    isWorkspaceReady = false,
    isDesktopCommanderRunning = false
  ): HandshakeState {
    if (!isWorkspaceReady || !isDesktopCommanderRunning) {
      return 'not_configured';
    }

    if (!sessionId) {
      return 'workspace_ready';
    }

    if (this.verifiedSessions.has(sessionId)) {
      return 'verified';
    }

    const challenge = this.activeChallenges.get(sessionId);
    if (challenge && challenge.status === 'pending') {
      if (Date.now() > new Date(challenge.expiresAt).getTime()) {
        challenge.status = 'expired';
        return 'error';
      }
      return 'awaiting_response';
    }

    if (challenge && challenge.status === 'failed') {
      return 'error';
    }

    return 'workspace_ready';
  }

  public getActiveChallenge(sessionId: string): HandshakeChallenge | null {
    const challenge = this.activeChallenges.get(sessionId);
    if (!challenge) return null;

    if (challenge.status === 'pending' && Date.now() > new Date(challenge.expiresAt).getTime()) {
      challenge.status = 'expired';
    }
    return challenge;
  }

  public startChallenge(
    projectId: string,
    sessionId: string,
    paths: SessionBridgePaths
  ): HandshakeChallenge {
    const challengeId = `knot-challenge-${randomUUID().slice(0, 8)}`;
    const expiresAt = new Date(Date.now() + HANDSHAKE_EXPIRY_MS).toISOString();

    const outboxFileName = `handshake-${challengeId}.md`;
    const outboxFilePath = path.join(paths.outboxDir, outboxFileName);
    const inboxExpectedFilePath = path.join(paths.inboxDir, `handshake-${challengeId}.md`);

    const copyablePrompt = `Use Desktop Commander to read this verification challenge:
${outboxFilePath}

Then use Desktop Commander's write_file tool to write your verification response to:
${inboxExpectedFilePath}

With this exact format:
<!-- KNOT_MESSAGE_V1
{
  "id": "${randomUUID()}",
  "protocol": "v1",
  "projectId": "${projectId}",
  "sessionId": "${sessionId}",
  "sender": "chatgpt",
  "recipient": "knot",
  "type": "handshake_response",
  "challengeId": "${challengeId}",
  "createdAt": "${new Date().toISOString()}"
}
-->

# Handshake Verified

Knot connection verified through Desktop Commander Remote.`;

    const challengeBody = `# Knot Handshake Challenge

- **Challenge ID**: \`${challengeId}\`
- **Project ID**: \`${projectId}\`
- **Session ID**: \`${sessionId}\`
- **Expires At**: \`${expiresAt}\`

## Expected Action
Respond by creating a Markdown file at:
\`${inboxExpectedFilePath}\`

With type \`handshake_response\` and challengeId \`${challengeId}\`.
`;

    // Publish the challenge message into outbox/knot/
    writeOutboundMessage(paths.outboxDir, projectId, sessionId, challengeBody, {
      fileName: outboxFileName,
      messageType: 'handshake_challenge',
      challengeId,
      recipient: 'chatgpt',
    });

    const challenge: HandshakeChallenge = {
      id: randomUUID(),
      challengeId,
      projectId,
      sessionId,
      outboxFilePath,
      inboxExpectedFilePath,
      instructions: copyablePrompt,
      expiresAt,
      status: 'pending',
    };

    this.activeChallenges.set(sessionId, challenge);
    return challenge;
  }

  public validateResponse(message: ParsedBridgeMessage): { valid: boolean; reason?: string } {
    const { sessionId, type, challengeId } = message.metadata;

    if (type !== 'handshake_response') {
      return { valid: false, reason: 'Message is not a handshake_response' };
    }

    if (!challengeId) {
      return { valid: false, reason: 'Missing challengeId in response metadata' };
    }

    if (this.usedChallengeIds.has(challengeId)) {
      return { valid: false, reason: 'Challenge ID has already been used (replay prevented)' };
    }

    const active = this.activeChallenges.get(sessionId);
    if (!active) {
      return { valid: false, reason: `No active challenge found for session ${sessionId}` };
    }

    if (active.challengeId !== challengeId) {
      return {
        valid: false,
        reason: `Challenge ID mismatch. Expected ${active.challengeId}, got ${challengeId}`,
      };
    }

    if (Date.now() > new Date(active.expiresAt).getTime()) {
      active.status = 'expired';
      return { valid: false, reason: 'Challenge has expired' };
    }

    // Success!
    active.status = 'verified';
    this.usedChallengeIds.add(challengeId);
    this.verifiedSessions.add(sessionId);
    this.lastVerifiedTimestamps.set(sessionId, new Date().toISOString());

    return { valid: true };
  }

  public isSessionVerified(sessionId: string): boolean {
    return this.verifiedSessions.has(sessionId);
  }

  public getLastVerifiedAt(sessionId?: string): string | null {
    if (!sessionId) return null;
    return this.lastVerifiedTimestamps.get(sessionId) || null;
  }

  public clearVerification(sessionId: string): void {
    this.verifiedSessions.delete(sessionId);
    this.activeChallenges.delete(sessionId);
    this.lastVerifiedTimestamps.delete(sessionId);
  }
}
