import type {
  BridgeProtocolVersion,
  BridgeMessageType,
  HandshakeState,
  KnotMessageMetadata,
  SessionBridgePaths,
  HandshakeChallenge,
  BridgeStatusInfo,
  BridgeInstructions,
  BridgeEventType,
  BridgeEvent,
  BridgeApi,
  MessageSender,
  TaskExecutionDetails,
} from '../../shared/types.js';

export interface ParsedBridgeMessage {
  metadata: KnotMessageMetadata;
  bodyMarkdown: string;
  rawContent: string;
  filePath: string;
}

export interface MessageValidationError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface OutboundMessageOptions {
  id?: string;
  fileName?: string;
  messageType?: BridgeMessageType;
  challengeId?: string;
  sender?: MessageSender;
  recipient?: string;
  metadata?: Record<string, unknown>;
}

export type {
  BridgeProtocolVersion,
  BridgeMessageType,
  HandshakeState,
  KnotMessageMetadata,
  SessionBridgePaths,
  HandshakeChallenge,
  BridgeStatusInfo,
  BridgeInstructions,
  BridgeEventType,
  BridgeEvent,
  BridgeApi,
  MessageSender,
  TaskExecutionDetails,
};
