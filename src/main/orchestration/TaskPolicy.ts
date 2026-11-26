import { createHash } from 'node:crypto';
import type { TaskPriority, ProjectTrustPolicy } from '../../shared/types.js';

export type PolicyCategory = 'safe' | 'sensitive' | 'ambiguous';

export interface PolicyEvaluation {
  requiresApproval: boolean;
  reason?: string;
  category: PolicyCategory;
}

export class TaskPolicy {
  /**
   * Sensitive keyword and command patterns that strictly trigger required user approval
   */
  private static SENSITIVE_PATTERNS = [
    { pattern: /\bgit\s+push\b/i, reason: 'Remote git push operations require explicit approval' },
    { pattern: /\bforce[- ]push\b/i, reason: 'Force push operations require explicit approval' },
    { pattern: /\bgit\s+merge\b/i, reason: 'Branch merge operations require explicit approval' },
    { pattern: /\b(pull[- ]request|pr)\b.*\bmerge\b/i, reason: 'PR merge operations require explicit approval' },
    { pattern: /\b(publish|release)\b.*\b(npm|package|gem|pip|cargo)\b/i, reason: 'Package release / publish operations require approval' },
    { pattern: /\b(deploy|deployment)\b/i, reason: 'Production / staging deployment operations require explicit approval' },
    { pattern: /\b(delete|remove|rm\s+-rf)\b.*\b(all|entire|recursive|database|table)\b/i, reason: 'Destructive deletion operations require explicit approval' },
    { pattern: /\b(drop|truncate)\b.*\b(table|database|schema|log)\b/i, reason: 'Database drop or truncate operations require explicit approval' },
    { pattern: /(?:\.env\b|\b(?:secrets?|tokens?|private[-_]key|credentials?|api_?keys?|passwords?|passwd)\b|aws_secret|access_key|_secret)/i, reason: 'Access to credentials or secrets requires explicit approval' },
    { pattern: /\b(systemctl|chmod\s+777|chown|sudo|iptables|sysctl|global\s+config)\b/i, reason: 'System-level or global configuration changes require explicit approval' },
    { pattern: /\b(\.\.\/|\/etc\/|\/var\/|\/usr\/|\/root|~\/)\b/i, reason: 'Modifying files outside the selected repository requires explicit approval' },
    { pattern: /\b(security[- ]settings|trust[- ]policy|bypass[- ]approval)\b/i, reason: 'Modifying security or trust policy settings requires explicit approval' },
  ];

  /**
   * Patterns indicating standard, project-local development tasks
   */
  private static ORDINARY_PATTERNS = [
    /\b(edit|modify|update|refactor|fix|add|implement|write|create)\b.*\b(function|class|method|component|file|type|tests?|code|docs?|readme|bugs?|features?|lint|module)\b/is,
    /\b(unit\s+tests?|test\s+suites?|run\s+tests?|npm\s+test|vitest|jest|pytest|cargo\s+test)\b/i,
    /\b(format|prettier|eslint|typecheck|build)\b/i,
    /\b(docs?|documentation|readme\.md|changelog)\b/i,
  ];

  /**
   * Evaluates a task assignment against safety policies and project trust mode.
   * Fail-Safe Principle:
   * 1. Sensitive tasks ALWAYS require approval in all modes.
   * 2. Ambiguous tasks ALWAYS require approval in all modes.
   * 3. Safe tasks require approval in 'approval_required' mode (default).
   * 4. Safe tasks are auto-approved ONLY in 'trusted' project mode.
   */
  public static evaluate(
    title: string,
    description: string,
    options?: {
      priority?: TaskPriority | string;
      executionMode?: string;
      explicitApprovalRequested?: boolean;
      projectTrustPolicy?: ProjectTrustPolicy;
    }
  ): PolicyEvaluation {
    if (options?.explicitApprovalRequested) {
      return {
        requiresApproval: true,
        reason: 'Approval was explicitly requested for this task',
        category: 'sensitive',
      };
    }

    const combinedText = `${title}\n${description}`;

    // 1. Check for sensitive operations (highest priority)
    for (const { pattern, reason } of TaskPolicy.SENSITIVE_PATTERNS) {
      if (pattern.test(combinedText)) {
        return {
          requiresApproval: true,
          reason,
          category: 'sensitive',
        };
      }
    }

    // 2. High/Urgent priority or Plan mode review
    if (options?.executionMode === 'plan') {
      return {
        requiresApproval: true,
        reason: 'Plan mode requires user review and approval before execution',
        category: 'sensitive',
      };
    }

    // 3. Check for ordinary project-local work
    let isOrdinary = false;
    for (const pattern of TaskPolicy.ORDINARY_PATTERNS) {
      if (pattern.test(combinedText)) {
        isOrdinary = true;
        break;
      }
    }

    if (isOrdinary) {
      if (options?.projectTrustPolicy === 'approval_required') {
        return {
          requiresApproval: true,
          reason: 'Project policy requires explicit user approval before task dispatch',
          category: 'safe',
        };
      }
      return {
        requiresApproval: false,
        category: 'safe',
      };
    }

    // 4. Ambiguous / Unknown operations fail-safe to requiring user approval
    return {
      requiresApproval: true,
      reason: 'Ambiguous or unclassified operation: cannot deterministically verify as safe project-local work',
      category: 'ambiguous',
    };
  }
}

/**
 * Computes a deterministic SHA-256 hash of a task's core instructions and criteria.
 */
export function computeTaskContentHash(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string[] | null;
}): string {
  const normTitle = (task.title || '').trim();
  const normDesc = (task.description || '').trim();
  const criteria = (task.acceptanceCriteria || []).map((c) => c.trim()).filter(Boolean);
  const canonical = `${normTitle}\n---\n${normDesc}\n---\n${criteria.join('\n')}`;
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

/**
 * Verifies that a task's current instructions match the hash approved by the user.
 */
export function verifyTaskContentIntegrity(task: {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string[] | null;
  approvedContentHash?: string | null;
}): { valid: boolean; currentHash: string; expectedHash: string | null } {
  const currentHash = computeTaskContentHash(task);
  const expectedHash = task.approvedContentHash || null;
  if (!expectedHash) {
    return { valid: false, currentHash, expectedHash: null };
  }
  return { valid: currentHash === expectedHash, currentHash, expectedHash };
}
