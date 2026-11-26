import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Project, CreateProjectInput, UpdateProjectInput, ProjectTrustPolicy } from '../../../shared/types.js';
import type { ProjectRecord } from '../types.js';

export class ProjectRepository {
  constructor(private db: DatabaseSync) {}

  private mapRow(row: ProjectRecord & { session_count?: number | bigint }): Project {
    return {
      id: row.id,
      name: row.name,
      repositoryPath: row.repository_path,
      repositoryRemote: row.repository_remote,
      trustPolicy: (row.trust_policy as ProjectTrustPolicy) || 'approval_required',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
      sessionCount: row.session_count !== undefined ? Number(row.session_count) : 0,
    };
  }

  public create(data: CreateProjectInput): Project {
    const trimmedName = data.name ? data.name.trim() : '';
    if (!trimmedName) {
      throw new Error('Project name cannot be empty.');
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const repoPath = data.repositoryPath ? data.repositoryPath.trim() : null;
    const repoRemote = data.repositoryRemote ? data.repositoryRemote.trim() : null;
    const trustPolicy: ProjectTrustPolicy = data.trustPolicy || 'approval_required';

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, repository_path, repository_remote, trust_policy, created_at, updated_at, archived_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `);

    stmt.run(id, trimmedName, repoPath, repoRemote, trustPolicy, now, now);

    return {
      id,
      name: trimmedName,
      repositoryPath: repoPath,
      repositoryRemote: repoRemote,
      trustPolicy,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      sessionCount: 0,
    };
  }

  public get(id: string): Project | null {
    const stmt = this.db.prepare(`
      SELECT p.*, (SELECT COUNT(*) FROM sessions s WHERE s.project_id = p.id) AS session_count
      FROM projects p
      WHERE p.id = ?
    `);

    const row = stmt.get(id) as unknown as (ProjectRecord & { session_count?: number | bigint }) | undefined;
    return row ? this.mapRow(row) : null;
  }

  public list(includeArchived = false): Project[] {
    const stmt = this.db.prepare(`
      SELECT p.*, (SELECT COUNT(*) FROM sessions s WHERE s.project_id = p.id) AS session_count
      FROM projects p
      WHERE (? OR p.archived_at IS NULL)
      ORDER BY p.updated_at DESC
    `);

    const rows = (stmt.all(includeArchived ? 1 : 0) as unknown) as (ProjectRecord & { session_count?: number | bigint })[];
    return rows.map((r) => this.mapRow(r));
  }

  public update(id: string, data: UpdateProjectInput): Project {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Project not found with id: ${id}`);
    }

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    if (!name) {
      throw new Error('Project name cannot be empty.');
    }

    const repoPath = data.repositoryPath !== undefined ? data.repositoryPath : existing.repositoryPath;
    const repoRemote = data.repositoryRemote !== undefined ? data.repositoryRemote : existing.repositoryRemote;
    const trustPolicy: ProjectTrustPolicy = data.trustPolicy !== undefined ? data.trustPolicy : existing.trustPolicy;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE projects
      SET name = ?, repository_path = ?, repository_remote = ?, trust_policy = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(name, repoPath, repoRemote, trustPolicy, now, id);

    return {
      ...existing,
      name,
      repositoryPath: repoPath,
      repositoryRemote: repoRemote,
      trustPolicy,
      updatedAt: now,
    };
  }

  public updateTrustPolicy(id: string, trustPolicy: ProjectTrustPolicy): Project {
    if (trustPolicy !== 'approval_required' && trustPolicy !== 'trusted') {
      throw new Error(`Invalid project trust policy: "${trustPolicy}". Allowed policies: "approval_required", "trusted".`);
    }

    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Project not found with id: ${id}`);
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE projects
      SET trust_policy = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(trustPolicy, now, id);

    return {
      ...existing,
      trustPolicy,
      updatedAt: now,
    };
  }

  public archive(id: string): Project {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Project not found with id: ${id}`);
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?');
    stmt.run(now, now, id);

    return {
      ...existing,
      archivedAt: now,
      updatedAt: now,
    };
  }

  public unarchive(id: string): Project {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Project not found with id: ${id}`);
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE projects SET archived_at = NULL, updated_at = ? WHERE id = ?');
    stmt.run(now, id);

    return {
      ...existing,
      archivedAt: null,
      updatedAt: now,
    };
  }
}
