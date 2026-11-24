import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { formatBridgeMessage } from './protocol.js';
import type {
  KnotMessageMetadata,
  OutboundMessageOptions,
} from './types.js';

export interface WrittenOutboundMessage {
  id: string;
  filePath: string;
  content: string;
  metadata: KnotMessageMetadata;
}

export function writeOutboundMessage(
  outboxDir: string,
  projectId: string,
  sessionId: string,
  bodyMarkdown: string,
  options: OutboundMessageOptions = {}
): WrittenOutboundMessage {
  fs.mkdirSync(outboxDir, { recursive: true });

  const id = options.id || randomUUID();
  const fileName = options.fileName || `${id}.md`;
  const targetFilePath = path.join(outboxDir, fileName);

  if (fs.existsSync(targetFilePath)) {
    throw new Error(`Outbound message file already exists: ${targetFilePath}`);
  }

  const metadata: KnotMessageMetadata = {
    id,
    protocol: 'v1',
    projectId,
    sessionId,
    sender: options.sender || 'knot',
    recipient: (options.recipient as any) || 'chatgpt',
    type: options.messageType || 'message',
    challengeId: options.challengeId,
    createdAt: new Date().toISOString(),
    metadata: options.metadata,
  };

  const formattedContent = formatBridgeMessage(metadata, bodyMarkdown);
  const tempFilePath = path.join(outboxDir, `${id}.tmp.${randomUUID()}`);

  try {
    fs.writeFileSync(tempFilePath, formattedContent, 'utf-8');
    fs.renameSync(tempFilePath, targetFilePath);
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Ignore cleanup failure
      }
    }
    throw err;
  }

  return {
    id,
    filePath: targetFilePath,
    content: formattedContent,
    metadata,
  };
}
