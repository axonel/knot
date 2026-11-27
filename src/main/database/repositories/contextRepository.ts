import type { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import type {
  ContextDocument,
  ContextRevision,
  ContextConflict,
  CreateContextInput,
  UpdateContextInput,
  ContextFilterOptions,
  ContextScope,
  ContextCategory,
  ContextProvenance,
} from '../../../shared/types.js';
import type {
  ContextDocumentRecord,
  ContextRevisionRecord,
  ContextConflictRecord,
} from '../types.js';

export function computeSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export class ContextRepository {
  constructor(private db: DatabaseSync) {}

  private mapDocumentRow(row: ContextDocumentRecord): ContextDocument {
    return {
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id || null,
      scope: row.scope as ContextScope,
      category: row.category as ContextCategory,
      title: row.title,
      contentMarkdown: row.content_markdown,
      author: row.author,
      provenance: row.provenance as ContextProvenance,
      contentHash: row.content_hash,
      currentRevision: row.current_revision,
      isArchived: Boolean(row.is_archived),
      requiresVerification: Boolean(row.requires_verification),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at || null,
    };
  }

  private mapRevisionRow(row: ContextRevisionRecord): ContextRevision {
    return {
      id: row.id,
      contextId: row.context_id,
      revision: row.revision,
      title: row.title,
      contentMarkdown: row.content_markdown,
      contentHash: row.content_hash,
      author: row.author,
      provenance: row.provenance as ContextProvenance,
      requiresVerification: Boolean(row.requires_verification),
      changeSummary: row.change_summary || null,
      createdAt: row.created_at,
    };
  }

  private mapConflictRow(row: ContextConflictRecord): ContextConflict {
    return {
      id: row.id,
      contextId: row.context_id,
      projectId: row.project_id,
      sessionId: row.session_id || null,
      expectedRevision: row.expected_revision ?? null,
      actualRevision: row.actual_revision,
      incomingTitle: row.incoming_title,
      incomingContent: row.incoming_content,
      incomingAuthor: row.incoming_author,
      conflictReason: row.conflict_reason,
      isResolved: Boolean(row.is_resolved),
      resolvedAt: row.resolved_at || null,
      createdAt: row.created_at,
    };
  }

  public create(input: CreateContextInput): ContextDocument {
    if (!input.projectId) {
      throw new Error('Project ID is required to create a context document.');
    }
    const project = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(input.projectId);
    if (!project) {
      throw new Error(`Project not found with id: ${input.projectId}`);
    }

    if (input.sessionId) {
      const session = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(input.sessionId);
      if (!session) {
        throw new Error(`Session not found with id: ${input.sessionId}`);
      }
    }

    const trimmedTitle = input.title ? input.title.trim() : '';
    if (!trimmedTitle) {
      throw new Error('Context title cannot be empty.');
    }

    const trimmedCategory = input.category ? input.category.trim() : '';
    if (!trimmedCategory) {
      throw new Error('Context category cannot be empty.');
    }

    const scope: ContextScope = input.scope || (input.sessionId ? 'session' : 'project');
    if (scope !== 'project' && scope !== 'session') {
      throw new Error(`Invalid context scope: ${scope}`);
    }

    const id = input.id || randomUUID();
    const content = input.contentMarkdown ?? '';
    const contentHash = computeSha256(content);
    const author = input.author || 'user';
    const provenance: ContextProvenance =
      input.provenance ||
      (author === 'chatgpt'
        ? 'chatgpt-authored'
        : author === 'antigravity'
          ? 'antigravity-reported'
          : 'user-authored');

    const now = new Date().toISOString();
    const requiresVerification = input.requiresVerification ? 1 : 0;

    const docStmt = this.db.prepare(`
      INSERT INTO context_documents (
        id, project_id, session_id, scope, category, title,
        content_markdown, author, provenance, content_hash,
        current_revision, is_archived, requires_verification,
        created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    docStmt.run(
      id,
      input.projectId,
      input.sessionId || null,
      scope,
      trimmedCategory,
      trimmedTitle,
      content,
      author,
      provenance,
      contentHash,
      1, // revision 1
      0, // is_archived
      requiresVerification,
      now,
      now,
      null
    );

    // Initial revision record
    const revId = randomUUID();
    const revStmt = this.db.prepare(`
      INSERT INTO context_revisions (
        id, context_id, revision, title, content_markdown,
        content_hash, author, provenance, requires_verification,
        change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    revStmt.run(
      revId,
      id,
      1,
      trimmedTitle,
      content,
      contentHash,
      author,
      provenance,
      requiresVerification,
      input.changeSummary || 'Initial document creation',
      now
    );

    return {
      id,
      projectId: input.projectId,
      sessionId: input.sessionId || null,
      scope,
      category: trimmedCategory,
      title: trimmedTitle,
      contentMarkdown: content,
      author,
      provenance,
      contentHash,
      currentRevision: 1,
      isArchived: false,
      requiresVerification: Boolean(requiresVerification),
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
  }

  public get(id: string): ContextDocument | null {
    const stmt = this.db.prepare('SELECT * FROM context_documents WHERE id = ?');
    const row = stmt.get(id) as unknown as ContextDocumentRecord | undefined;
    return row ? this.mapDocumentRow(row) : null;
  }

  public update(id: string, input: UpdateContextInput): ContextDocument {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Context document not found with id: ${id}`);
    }

    if (existing.isArchived) {
      throw new Error(`Cannot update archived context document with id: ${id}`);
    }

    const incomingTitle = input.title !== undefined ? input.title.trim() : existing.title;
    if (!incomingTitle) {
      throw new Error('Context title cannot be empty.');
    }

    const incomingContent = input.contentMarkdown !== undefined ? input.contentMarkdown : existing.contentMarkdown;
    const incomingCategory = input.category !== undefined ? input.category.trim() : existing.category;
    const incomingAuthor = input.author || existing.author;
    const incomingProvenance: ContextProvenance = input.provenance || existing.provenance;
    const incomingRequiresVerification =
      input.requiresVerification !== undefined ? input.requiresVerification : existing.requiresVerification;

    // Check Optimistic Concurrency Control
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== existing.currentRevision
    ) {
      const conflictId = randomUUID();
      const conflictStmt = this.db.prepare(`
        INSERT INTO context_conflicts (
          id, context_id, project_id, session_id, expected_revision, actual_revision,
          incoming_title, incoming_content, incoming_author, conflict_reason,
          is_resolved, resolved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      conflictStmt.run(
        conflictId,
        existing.id,
        existing.projectId,
        existing.sessionId || null,
        input.expectedRevision,
        existing.currentRevision,
        incomingTitle,
        incomingContent,
        incomingAuthor,
        `Revision mismatch: expected revision ${input.expectedRevision} but document is at revision ${existing.currentRevision}`,
        0,
        null,
        new Date().toISOString()
      );

      throw new Error(
        `Context conflict: Revision mismatch (expected ${input.expectedRevision}, actual ${existing.currentRevision})`
      );
    }

    if (
      input.expectedContentHash !== undefined &&
      input.expectedContentHash !== existing.contentHash
    ) {
      const conflictId = randomUUID();
      const conflictStmt = this.db.prepare(`
        INSERT INTO context_conflicts (
          id, context_id, project_id, session_id, expected_revision, actual_revision,
          incoming_title, incoming_content, incoming_author, conflict_reason,
          is_resolved, resolved_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      conflictStmt.run(
        conflictId,
        existing.id,
        existing.projectId,
        existing.sessionId || null,
        input.expectedRevision ?? null,
        existing.currentRevision,
        incomingTitle,
        incomingContent,
        incomingAuthor,
        `Content hash mismatch: expected hash ${input.expectedContentHash} but document hash is ${existing.contentHash}`,
        0,
        null,
        new Date().toISOString()
      );

      throw new Error(
        `Context conflict: Content hash mismatch (expected ${input.expectedContentHash}, actual ${existing.contentHash})`
      );
    }

    const newHash = computeSha256(incomingContent);
    const newRevision = existing.currentRevision + 1;
    const now = new Date().toISOString();

    const updateStmt = this.db.prepare(`
      UPDATE context_documents
      SET title = ?, category = ?, content_markdown = ?, author = ?,
          provenance = ?, content_hash = ?, current_revision = ?,
          requires_verification = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      incomingTitle,
      incomingCategory,
      incomingContent,
      incomingAuthor,
      incomingProvenance,
      newHash,
      newRevision,
      incomingRequiresVerification ? 1 : 0,
      now,
      id
    );

    // Insert Revision
    const revId = randomUUID();
    const revStmt = this.db.prepare(`
      INSERT INTO context_revisions (
        id, context_id, revision, title, content_markdown,
        content_hash, author, provenance, requires_verification,
        change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    revStmt.run(
      revId,
      id,
      newRevision,
      incomingTitle,
      incomingContent,
      newHash,
      incomingAuthor,
      incomingProvenance,
      incomingRequiresVerification ? 1 : 0,
      input.changeSummary || `Updated to revision ${newRevision}`,
      now
    );

    return {
      ...existing,
      title: incomingTitle,
      category: incomingCategory,
      contentMarkdown: incomingContent,
      author: incomingAuthor,
      provenance: incomingProvenance,
      contentHash: newHash,
      currentRevision: newRevision,
      requiresVerification: incomingRequiresVerification,
      updatedAt: now,
    };
  }

  public archive(id: string): ContextDocument {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Context document not found with id: ${id}`);
    }

    if (existing.isArchived) {
      return existing;
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE context_documents
      SET is_archived = 1, archived_at = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(now, now, id);

    return {
      ...existing,
      isArchived: true,
      archivedAt: now,
      updatedAt: now,
    };
  }

  public restore(id: string): ContextDocument {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Context document not found with id: ${id}`);
    }

    if (!existing.isArchived) {
      return existing;
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE context_documents
      SET is_archived = 0, archived_at = NULL, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(now, id);

    return {
      ...existing,
      isArchived: false,
      archivedAt: null,
      updatedAt: now,
    };
  }

  public list(filter: ContextFilterOptions): ContextDocument[] {
    let sql = 'SELECT * FROM context_documents WHERE project_id = ?';
    const params: any[] = [filter.projectId];

    if (!filter.includeArchived) {
      sql += ' AND is_archived = 0';
    }

    if (filter.scope) {
      sql += ' AND scope = ?';
      params.push(filter.scope);
    }

    if (filter.sessionId !== undefined) {
      if (filter.sessionId === null) {
        sql += ' AND session_id IS NULL';
      } else {
        if (!filter.scope) {
          sql += ' AND (session_id = ? OR scope = ?)';
          params.push(filter.sessionId, 'project');
        } else {
          sql += ' AND session_id = ?';
          params.push(filter.sessionId);
        }
      }
    }

    if (filter.category) {
      sql += ' AND category = ?';
      params.push(filter.category);
    }

    if (filter.searchQuery && filter.searchQuery.trim()) {
      sql += ' AND (title LIKE ? OR content_markdown LIKE ?)';
      const term = `%${filter.searchQuery.trim()}%`;
      params.push(term, term);
    }

    sql += ' ORDER BY updated_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = (stmt.all(...params) as unknown) as ContextDocumentRecord[];
    return rows.map((r) => this.mapDocumentRow(r));
  }

  public getRevisions(contextId: string): ContextRevision[] {
    const stmt = this.db.prepare(`
      SELECT * FROM context_revisions
      WHERE context_id = ?
      ORDER BY revision DESC
    `);
    const rows = (stmt.all(contextId) as unknown) as ContextRevisionRecord[];
    return rows.map((r) => this.mapRevisionRow(r));
  }

  public getRevision(contextId: string, revision: number): ContextRevision | null {
    const stmt = this.db.prepare(`
      SELECT * FROM context_revisions
      WHERE context_id = ? AND revision = ?
    `);
    const row = stmt.get(contextId, revision) as unknown as ContextRevisionRecord | undefined;
    return row ? this.mapRevisionRow(row) : null;
  }

  public listConflicts(projectId: string, unresolvedOnly = false): ContextConflict[] {
    let sql = 'SELECT * FROM context_conflicts WHERE project_id = ?';
    const params: any[] = [projectId];

    if (unresolvedOnly) {
      sql += ' AND is_resolved = 0';
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = (stmt.all(...params) as unknown) as ContextConflictRecord[];
    return rows.map((r) => this.mapConflictRow(r));
  }

  public resolveConflict(conflictId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE context_conflicts
      SET is_resolved = 1, resolved_at = ?
      WHERE id = ?
    `);
    stmt.run(now, conflictId);
  }

  public getHandoff(sessionId: string): ContextDocument | null {
    const stmt = this.db.prepare(`
      SELECT * FROM context_documents
      WHERE session_id = ? AND category = 'session_handoff' AND is_archived = 0
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    const row = stmt.get(sessionId) as unknown as ContextDocumentRecord | undefined;
    return row ? this.mapDocumentRow(row) : null;
  }
}
