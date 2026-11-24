import type {
  KnotMessageMetadata,
  ParsedBridgeMessage,
  MessageValidationError,
  BridgeMessageType,
  MessageSender,
} from './types.js';

export const MAX_MESSAGE_SIZE_BYTES = 256 * 1024; // 256 KB

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HEADER_REGEX = /^<!--\s*KNOT_MESSAGE_V1\s*\r?\n([\s\S]*?)\r?\n-->/;

export function formatBridgeMessage(
  metadata: KnotMessageMetadata,
  bodyMarkdown: string
): string {
  const json = JSON.stringify(
    {
      id: metadata.id,
      protocol: 'v1',
      projectId: metadata.projectId,
      sessionId: metadata.sessionId,
      sender: metadata.sender,
      recipient: metadata.recipient,
      type: metadata.type,
      challengeId: metadata.challengeId || undefined,
      createdAt: metadata.createdAt,
      metadata: metadata.metadata || undefined,
    },
    null,
    2
  );

  return `<!-- KNOT_MESSAGE_V1\n${json}\n-->\n\n${bodyMarkdown.trim()}\n`;
}

export function parseBridgeMessage(
  rawContent: string,
  filePath: string,
  expectedScope?: { projectId: string; sessionId: string }
):
  | { success: true; message: ParsedBridgeMessage }
  | { success: false; error: MessageValidationError } {
  // 1. Check size limit
  const byteLength = Buffer.byteLength(rawContent, 'utf-8');
  if (byteLength > MAX_MESSAGE_SIZE_BYTES) {
    return {
      success: false,
      error: {
        code: 'MESSAGE_TOO_LARGE',
        message: `Message exceeds maximum allowed size of 256 KB (got ${Math.round(
          byteLength / 1024
        )} KB).`,
      },
    };
  }

  if (!rawContent || !rawContent.trim()) {
    return {
      success: false,
      error: {
        code: 'EMPTY_MESSAGE',
        message: 'Message content cannot be empty.',
      },
    };
  }

  // 2. Extract metadata header block
  const match = rawContent.match(HEADER_REGEX);
  if (!match) {
    return {
      success: false,
      error: {
        code: 'MALFORMED_HEADER',
        message:
          'Missing or malformed <!-- KNOT_MESSAGE_V1 ... --> protocol metadata header.',
      },
    };
  }

  const rawJson = match[1].trim();
  let parsedJson: Record<string, unknown>;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch (err: unknown) {
    return {
      success: false,
      error: {
        code: 'INVALID_METADATA_JSON',
        message: `Failed to parse header metadata JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
    };
  }

  if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
    return {
      success: false,
      error: {
        code: 'INVALID_METADATA_STRUCTURE',
        message: 'Metadata JSON must be a valid key-value object.',
      },
    };
  }

  // 3. Validate required fields
  const { id, protocol, projectId, sessionId, sender, recipient, type, challengeId, createdAt } =
    parsedJson;

  // Validate ID
  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    return {
      success: false,
      error: {
        code: 'INVALID_UUID',
        message: `Invalid or missing message ID UUID: ${id}`,
      },
    };
  }

  // Validate Protocol Version
  if (protocol !== undefined && protocol !== 'v1') {
    return {
      success: false,
      error: {
        code: 'UNSUPPORTED_PROTOCOL',
        message: `Unsupported protocol version: ${protocol}. Expected 'v1'.`,
      },
    };
  }

  // Validate Project ID
  if (typeof projectId !== 'string' || !UUID_REGEX.test(projectId)) {
    return {
      success: false,
      error: {
        code: 'INVALID_PROJECT_ID',
        message: `Invalid or missing projectId UUID: ${projectId}`,
      },
    };
  }

  // Validate Session ID
  if (typeof sessionId !== 'string' || !UUID_REGEX.test(sessionId)) {
    return {
      success: false,
      error: {
        code: 'INVALID_SESSION_ID',
        message: `Invalid or missing sessionId UUID: ${sessionId}`,
      },
    };
  }

  // Validate Scope Match if expected
  if (expectedScope) {
    if (expectedScope.projectId !== projectId) {
      return {
        success: false,
        error: {
          code: 'PROJECT_MISMATCH',
          message: `Message projectId (${projectId}) does not match expected project (${expectedScope.projectId}).`,
        },
      };
    }
    if (expectedScope.sessionId !== sessionId) {
      return {
        success: false,
        error: {
          code: 'SESSION_MISMATCH',
          message: `Message sessionId (${sessionId}) does not match expected session (${expectedScope.sessionId}).`,
        },
      };
    }
  }

  // Validate Sender
  const validSenders: MessageSender[] = ['user', 'chatgpt', 'antigravity', 'system', 'knot'];
  if (typeof sender !== 'string' || !validSenders.includes(sender as MessageSender)) {
    return {
      success: false,
      error: {
        code: 'INVALID_SENDER',
        message: `Invalid sender '${sender}'. Allowed: ${validSenders.join(', ')}.`,
      },
    };
  }

  // Validate Recipient
  const validRecipients = ['user', 'chatgpt', 'antigravity', 'system', 'knot', 'all'];
  if (typeof recipient !== 'string' || !validRecipients.includes(recipient)) {
    return {
      success: false,
      error: {
        code: 'INVALID_RECIPIENT',
        message: `Invalid recipient '${recipient}'. Allowed: ${validRecipients.join(', ')}.`,
      },
    };
  }

  // Validate Message Type
  const validTypes: BridgeMessageType[] = ['message', 'handshake_challenge', 'handshake_response'];
  if (typeof type !== 'string' || !validTypes.includes(type as BridgeMessageType)) {
    return {
      success: false,
      error: {
        code: 'INVALID_MESSAGE_TYPE',
        message: `Invalid message type '${type}'. Allowed: ${validTypes.join(', ')}.`,
      },
    };
  }

  // Validate Creation Timestamp
  if (typeof createdAt !== 'string' || isNaN(Date.parse(createdAt))) {
    return {
      success: false,
      error: {
        code: 'INVALID_TIMESTAMP',
        message: `Invalid ISO 8601 creation timestamp: ${createdAt}`,
      },
    };
  }

  // 4. Extract and validate Markdown body
  const bodyMarkdown = rawContent.slice(match[0].length).trim();
  if (!bodyMarkdown) {
    return {
      success: false,
      error: {
        code: 'EMPTY_BODY',
        message: 'Message markdown body cannot be empty.',
      },
    };
  }

  const metadata: KnotMessageMetadata = {
    id,
    protocol: 'v1',
    projectId,
    sessionId,
    sender: sender as MessageSender,
    recipient: recipient as MessageSender | 'knot' | 'all',
    type: type as BridgeMessageType,
    challengeId: typeof challengeId === 'string' ? challengeId : undefined,
    createdAt,
    metadata:
      typeof parsedJson.metadata === 'object' && parsedJson.metadata !== null
        ? (parsedJson.metadata as Record<string, unknown>)
        : undefined,
  };

  return {
    success: true,
    message: {
      metadata,
      bodyMarkdown,
      rawContent,
      filePath,
    },
  };
}
