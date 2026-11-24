import type { TaskPriority } from '../../shared/types.js';

export interface PolicyEvaluation {
  requiresApproval: boolean;
  reason?: string;
  category: 'safe' | 'sensitive';
}

export class TaskPolicy {
  /**
   * Sensitive keyword patterns that trigger required user approval
   */
  private static SENSITIVE_PATTERNS = [
    { pattern: /\bgit\s+push\b/i, reason: 'Remote git push operations require explicit approval' },
    { pattern: /\bforce[- ]push\b/i, reason: 'Force push operations require explicit approval' },
    { pattern: /\bgit\s+merge\b/i, reason: 'Branch merge operations require explicit approval' },
    { pattern: /\b(publish|release)\b.*\b(npm|package|gem|pip|cargo)\b/i, reason: 'Package release / publish operations require approval' },
    { pattern: /\b(delete|remove|rm\s+-rf)\b.*\b(all|entire|recursive)\b/i, reason: 'Destructive deletion operations require explicit approval' },
    { pattern: /\b(\.env|secret|token|private[-_]key|credentials)\b/i, reason: 'Access to credentials or secrets requires explicit approval' },
  ];

  /**
   * Evaluates a task assignment against safety policies.
   */
  public static evaluate(
    title: string,
    description: string,
    options?: {
      priority?: TaskPriority | string;
      executionMode?: string;
      explicitApprovalRequested?: boolean;
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

    for (const { pattern, reason } of TaskPolicy.SENSITIVE_PATTERNS) {
      if (pattern.test(combinedText)) {
        return {
          requiresApproval: true,
          reason,
          category: 'sensitive',
        };
      }
    }

    // High/Urgent priority alone does not require approval, but executionMode 'plan' or 'manual' might
    if (options?.executionMode === 'plan') {
      return {
        requiresApproval: true,
        reason: 'Plan mode requires user review and approval before execution',
        category: 'sensitive',
      };
    }

    // Default: ordinary implementation work (edit, test, lint, build) is auto-approved
    return {
      requiresApproval: false,
      category: 'safe',
    };
  }
}
