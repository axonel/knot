import type { Task } from '../../shared/types.js';

export interface AttachedTaskContext {
  id: string;
  title: string;
  category: string;
  contentMarkdown: string;
  revision: number;
}

export function formatTaskContract(
  task: Task,
  workingDirectory: string,
  referencedContexts?: AttachedTaskContext[]
): string {
  let criteriaSection = '';
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    criteriaSection = `## Acceptance Criteria\n${task.acceptanceCriteria
      .map((c) => `- [ ] ${c}`)
      .join('\n')}\n\n`;
  }

  let contextSection = '';
  if (referencedContexts && referencedContexts.length > 0) {
    contextSection = `## Attached Project & Session Context (Read-Only)
> Note: The following context documents have been attached by ChatGPT for this task. They are for your reference only. You cannot modify them.

${referencedContexts
  .map(
    (ctx) =>
      `### [${ctx.category}] ${ctx.title} (Revision ${ctx.revision})\n\n${ctx.contentMarkdown.trim()}`
  )
  .join('\n\n---\n\n')}\n\n`;
  }

  const prompt = `# Task: ${task.title}

## Objective
${task.description || task.title}

${criteriaSection}${contextSection}## Constraints & Guidelines
- Target Working Directory: \`${workingDirectory}\`
- Execution Mode: \`${task.executionMode || 'default'}\`
- Focus strictly on the requirements stated above.
- Never make modifications outside of the repository path.
- Test and verify your changes before finishing.
- Never run dangerous or destructive commands without explicit instruction.

## Expected Report
When you complete this task, provide a structured summary report containing:
1. **Status**: Succeeded or Failed
2. **Files Changed**: List of created, modified, or deleted files
3. **Verification**: Tests run, linters, or manual verification steps taken
4. **Summary**: Brief description of the solution implemented
`;

  return prompt;
}
