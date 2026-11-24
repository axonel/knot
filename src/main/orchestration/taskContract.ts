import type { Task } from '../../shared/types.js';

export function formatTaskContract(task: Task, workingDirectory: string): string {
  let criteriaSection = '';
  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    criteriaSection = `## Acceptance Criteria\n${task.acceptanceCriteria
      .map((c) => `- [ ] ${c}`)
      .join('\n')}\n\n`;
  }

  const prompt = `# Task: ${task.title}

## Objective
${task.description || task.title}

${criteriaSection}## Constraints & Guidelines
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
