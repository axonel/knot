import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Message, AppendMessageInput, PaginationOptions, MessageSender } from '../../../shared/types.js';
import type { MessageRecord } from '../types.js';

export class MessageRepository {
  constructor(private db: DatabaseSync) {}

  private mapRow(row: MessageRecord): Message {
    let metadata: Record<string, unknown> | null = null;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json);
      } catch {
        metadata = null;
      }
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      sequence: row.sequence,
      sender: row.sender,
      recipient: row.recipient,
      messageType: row.message_type,
      contentMarkdown: row.content_markdown,
      correlationId: row.correlation_id,
      metadata,
      createdAt: row.created_at,
    };
  }

  public append(data: AppendMessageInput): Message {
    if (!data.sessionId) {
      throw new Error('Message must belong to a session.');
    }

    const validSenders: MessageSender[] = ['user', 'chatgpt', 'antigravity', 'system'];
    if (!validSenders.includes(data.sender)) {
      throw new Error(`Invalid message sender: ${data.sender}`);
    }

    if (data.contentMarkdown === undefined || data.contentMarkdown === null) {
      throw new Error('Message content_markdown cannot be null or undefined.');
    }

    // Verify session exists
    const sessionRow = this.db.prepare('SELECT id, project_id FROM sessions WHERE id = ?').get(data.sessionId) as
      | { id: string; project_id: string }
      | undefined;

    if (!sessionRow) {
      throw new Error(`Session not found with id: ${data.sessionId}`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const messageType = data.messageType || 'text';
    const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

    this.db.exec('BEGIN TRANSACTION;');
    try {
      // Calculate next sequential sequence number for this session
      const seqRow = this.db
        .prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq FROM messages WHERE session_id = ?')
        .get(data.sessionId) as { next_seq: number | bigint };

      const sequence = Number(seqRow.next_seq);

      const stmt = this.db.prepare(`
        INSERT INTO messages (
          id, session_id, sequence, sender, recipient, message_type, content_markdown, correlation_id, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        data.sessionId,
        sequence,
        data.sender,
        data.recipient || null,
        messageType,
        data.contentMarkdown,
        data.correlationId || null,
        metadataJson,
        now
      );

      // Update session activity and project updated_at
      this.db.prepare('UPDATE sessions SET last_activity_at = ?, updated_at = ? WHERE id = ?').run(now, now, data.sessionId);
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, sessionRow.project_id);

      this.db.exec('COMMIT;');

      return {
        id,
        sessionId: data.sessionId,
        sequence,
        sender: data.sender,
        recipient: data.recipient || null,
        messageType,
        contentMarkdown: data.contentMarkdown,
        correlationId: data.correlationId || null,
        metadata: data.metadata || null,
        createdAt: now,
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public get(id: string): Message | null {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(id) as unknown as MessageRecord | undefined;
    return row ? this.mapRow(row) : null;
  }

  public listBySession(sessionId: string, options: PaginationOptions = {}): Message[] {
    const limit = options.limit !== undefined ? Math.max(1, options.limit) : 50;
    const offset = options.offset !== undefined ? Math.max(0, options.offset) : 0;

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY sequence ASC
      LIMIT ? OFFSET ?
    `);

    const rows = (stmt.all(sessionId, limit, offset) as unknown) as MessageRecord[];
    return rows.map((r) => this.mapRow(r));
  }

  public countBySession(sessionId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) AS total FROM messages WHERE session_id = ?');
    const row = stmt.get(sessionId) as { total: number | bigint } | undefined;
    return row ? Number(row.total) : 0;
  }
}
