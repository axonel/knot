import type { StreamEventEnvelope } from './streamParser.js';
import type { AntigravityStep, AntigravityToolCall } from '../../shared/types.js';

export interface MappedInitEvent {
  type: 'init';
  conversationId: string;
  cwd?: string;
  tools?: string[];
  permissionMode?: string;
}

export interface MappedStepUpdateEvent {
  type: 'step_update';
  conversationId?: string;
  step: AntigravityStep;
}

export interface MappedResultEvent {
  type: 'result';
  conversationId?: string;
  status: 'SUCCESS' | 'ERROR' | string;
  response?: string;
  durationSeconds?: number;
  numTurns?: number;
  usage?: Record<string, unknown>;
  error?: string;
}

export interface MappedUnknownEvent {
  type: 'unknown';
  raw: StreamEventEnvelope;
}

export type MappedStreamEvent =
  | MappedInitEvent
  | MappedStepUpdateEvent
  | MappedResultEvent
  | MappedUnknownEvent;

export class EventMapper {
  public static mapEvent(envelope: StreamEventEnvelope): MappedStreamEvent {
    if (envelope.event === 'init') {
      const initPayload = (envelope.init || {}) as Record<string, unknown>;
      const conversationId = String(envelope.conversation_id || initPayload.conversation_id || '');
      return {
        type: 'init',
        conversationId,
        cwd: typeof initPayload.cwd === 'string' ? initPayload.cwd : undefined,
        tools: Array.isArray(initPayload.tools) ? (initPayload.tools as string[]) : undefined,
        permissionMode: typeof initPayload.permission_mode === 'string' ? initPayload.permission_mode : undefined,
      };
    }

    if (envelope.event === 'step_update') {
      const stepUpdate = (envelope.step_update || {}) as Record<string, unknown>;
      const conversationId = String(stepUpdate.conversation_id || envelope.conversation_id || '');
      const stepIndex = typeof stepUpdate.step_index === 'number' ? stepUpdate.step_index : 0;
      const state = stepUpdate.state === 'DONE' ? 'DONE' : 'ACTIVE';
      const stepType = typeof stepUpdate.step_type === 'string' ? stepUpdate.step_type : 'thought';
      const textDelta = typeof stepUpdate.text_delta === 'string' ? stepUpdate.text_delta : undefined;

      let tool: AntigravityToolCall | undefined;
      const toolName = typeof stepUpdate.tool_name === 'string' ? stepUpdate.tool_name : undefined;
      if (toolName) {
        const toolInfo = (stepUpdate.tool_info || {}) as Record<string, unknown>;
        const parameters = (toolInfo.parameters || {}) as Record<string, unknown>;
        const output = typeof toolInfo.output === 'string' ? toolInfo.output : undefined;
        let toolStatus: AntigravityToolCall['status'] = state === 'DONE' ? 'done' : 'active';

        if (toolInfo.error || output?.toLowerCase().includes('permission denied')) {
          toolStatus = output?.toLowerCase().includes('permission denied') ? 'denied' : 'error';
        }

        tool = {
          name: toolName,
          parameters,
          output,
          status: toolStatus,
        };
      }

      const step: AntigravityStep = {
        stepIndex,
        state,
        stepType,
        textDelta,
        tool,
        durationSeconds: typeof stepUpdate.duration_seconds === 'number' ? stepUpdate.duration_seconds : undefined,
        usage: typeof stepUpdate.usage === 'object' && stepUpdate.usage !== null ? (stepUpdate.usage as Record<string, unknown>) : undefined,
      };

      return {
        type: 'step_update',
        conversationId,
        step,
      };
    }

    if (envelope.event === 'result') {
      const resultPayload = (envelope.result || {}) as Record<string, unknown>;
      const conversationId = String(resultPayload.conversation_id || envelope.conversation_id || '');
      const status = typeof resultPayload.status === 'string' ? resultPayload.status : 'SUCCESS';
      const response = typeof resultPayload.response === 'string' ? resultPayload.response : '';
      const durationSeconds = typeof resultPayload.duration_seconds === 'number' ? resultPayload.duration_seconds : undefined;
      const numTurns = typeof resultPayload.num_turns === 'number' ? resultPayload.num_turns : undefined;
      const usage = typeof resultPayload.usage === 'object' && resultPayload.usage !== null ? (resultPayload.usage as Record<string, unknown>) : undefined;
      const error = typeof resultPayload.error === 'string' ? resultPayload.error : undefined;

      return {
        type: 'result',
        conversationId,
        status,
        response,
        durationSeconds,
        numTurns,
        usage,
        error,
      };
    }

    return {
      type: 'unknown',
      raw: envelope,
    };
  }

  public static isAuthError(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('unauthorized') ||
      lower.includes('authentication required') ||
      lower.includes('not logged in') ||
      lower.includes('please authenticate') ||
      lower.includes('login required') ||
      lower.includes('invalid credentials') ||
      lower.includes('oauth token') ||
      lower.includes('agy auth')
    );
  }

  public static isPermissionDenied(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('permission denied') ||
      lower.includes('tool permission rejected') ||
      lower.includes('permission rejected') ||
      lower.includes('blocked by policy')
    );
  }
}
