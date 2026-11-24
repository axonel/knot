import { EventEmitter } from 'node:events';

export interface StreamParserOptions {
  maxBufferSize?: number;
}

export interface StreamEventEnvelope {
  event: 'init' | 'step_update' | 'result' | string;
  conversation_id?: string;
  init?: Record<string, unknown>;
  step_update?: Record<string, unknown>;
  result?: Record<string, unknown>;
  [key: string]: unknown;
}

export class StreamParser extends EventEmitter {
  private buffer = '';
  private maxBufferSize: number;

  constructor(options: StreamParserOptions = {}) {
    super();
    this.maxBufferSize = options.maxBufferSize ?? 10 * 1024 * 1024; // 10MB limit
  }

  public push(chunk: string | Buffer): void {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    this.buffer += text;

    if (this.buffer.length > this.maxBufferSize) {
      this.emit('error', new Error(`Stream buffer exceeded max size of ${this.maxBufferSize} bytes`));
      this.reset();
      return;
    }

    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        this.processLine(line);
      }

      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  public end(): void {
    const remaining = this.buffer.trim();
    if (remaining.length > 0) {
      this.processLine(remaining);
    }
    this.reset();
  }

  public reset(): void {
    this.buffer = '';
  }

  private processLine(line: string): void {
    try {
      const parsed = JSON.parse(line) as StreamEventEnvelope;
      if (parsed && typeof parsed === 'object') {
        this.emit('event', parsed);
      }
    } catch (err) {
      this.emit('malformed_line', {
        line,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
