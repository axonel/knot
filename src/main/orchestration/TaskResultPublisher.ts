import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '../database/index.js';
import type { Task, TaskExecutionDetails } from '../../shared/types.js';
import { initSessionWorkspace, writeCanonicalConversation } from '../bridge/workspace.js';
import { formatBridgeMessage } from '../bridge/protocol.js';
import { sanitizeLogOutput, sanitizeObject } from '../logSanitizer.js';

export interface PublishTaskResultOptions {
  task: Task;
  agentResponse?: string;
  durationSeconds?: number;
  executionDetails?: TaskExecutionDetails;
}

export class TaskResultPublisher {
  constructor(
    private bridgeRoot: string,
    private dbService: DatabaseService
  ) {}

  public async publish(options: PublishTaskResultOptions): Promise<{
    messageId: string;
    filePath: string;
    deterministicFilePath: string;
  }> {
    const { task, agentResponse } = options;
    const session = this.dbService.sessions.get(task.sessionId);
    if (!session) {
      throw new Error(`Session "${task.sessionId}" not found.`);
    }

    const project = this.dbService.projects.get(session.projectId);
    if (!project) {
      throw new Error(`Project "${session.projectId}" not found.`);
    }

    const paths = initSessionWorkspace(this.bridgeRoot, project.id, session.id);
    const messageId = randomUUID();
    const now = new Date().toISOString();
    const details = options.executionDetails;
    const summary = details?.summary || (agentResponse ? agentResponse.trim() : task.status === 'succeeded' ? 'Task execution completed successfully.' : 'Task execution failed.');

    let bodyContent = `# Task Result: ${task.title}

- **Task ID**: \`${task.id}\`
- **Status**: **${task.status.toUpperCase()}**
- **Priority**: \`${task.priority || 'normal'}\`
- **Execution Mode**: \`${task.executionMode || 'default'}\`
- **Dispatched At**: \`${task.dispatchedAt || 'N/A'}\`
- **Completed At**: \`${task.completedAt || now}\`
${task.failureReason ? `- **Failure Reason**: ${task.failureReason}\n` : ''}${details?.commitHash ? `- **Commit Hash**: \`${details.commitHash}\`\n` : ''}
## Summary of Changes
${summary}
`;

    if (details?.changedFiles && details.changedFiles.length > 0) {
      bodyContent += `\n## Changed Files\n${details.changedFiles.map((f) => `- \`${f}\``).join('\n')}\n`;
    }

    if (details?.commandsExecuted && details.commandsExecuted.length > 0) {
      bodyContent += `\n## Executed Commands\n${details.commandsExecuted.map((c) => `- \`${c.command}\`${c.exitCode !== undefined ? ` (exit code ${c.exitCode})` : ''}`).join('\n')}\n`;
    }

    if (details?.testsExecuted && details.testsExecuted.length > 0) {
      bodyContent += `\n## Test Outcomes\n${details.testsExecuted.map((t) => `- \`${t.command}\`: **${t.outcome?.toUpperCase() || 'COMPLETED'}**`).join('\n')}\n`;
    }

    if (details?.errors && details.errors.length > 0) {
      bodyContent += `\n## Errors & Incomplete Work\n${details.errors.map((e) => `- ${e}`).join('\n')}\n`;
    }

    if (details?.limitations && details.limitations.length > 0) {
      bodyContent += `\n## Limitations\n${details.limitations.map((l) => `- ${l}`).join('\n')}\n`;
    }

    bodyContent += `\n---\n*Published by Knot Orchestration Runtime*\n`;
    const sanitizedBodyContent = sanitizeLogOutput(bodyContent);

    const rawMetadata: Record<string, unknown> = {
      taskId: task.id,
      status: task.status,
      sourceMessageId: task.sourceMessageId || undefined,
      priority: task.priority,
      executionMode: task.executionMode,
      failureReason: task.failureReason ? sanitizeLogOutput(task.failureReason) : undefined,
      durationSeconds: options.durationSeconds,
      changedFiles: details?.changedFiles,
      commitHash: details?.commitHash,
      commandsCount: details?.commandsExecuted?.length,
      testsCount: details?.testsExecuted?.length,
    };
    const sanitizedMetadata = sanitizeObject(rawMetadata);

    const formattedMessage = formatBridgeMessage(
      {
        id: messageId,
        protocol: 'v1',
        projectId: project.id,
        sessionId: session.id,
        sender: 'knot',
        recipient: 'chatgpt',
        type: 'task_result',
        createdAt: now,
        metadata: sanitizedMetadata,
      },
      sanitizedBodyContent
    );

    // 1. Write atomic outbox message: <messageId>.md
    const outboxFileName = `${messageId}.md`;
    const outboxFilePath = path.join(paths.outboxDir, outboxFileName);
    const tempFile1 = path.join(paths.outboxDir, `${outboxFileName}.tmp.${Date.now()}`);
    fs.writeFileSync(tempFile1, formattedMessage, 'utf-8');
    fs.renameSync(tempFile1, outboxFilePath);

    // 2. Also write deterministic file: task-<taskId>-result.md for easy discovery
    const deterministicFileName = `task-${task.id}-result.md`;
    const deterministicFilePath = path.join(paths.outboxDir, deterministicFileName);
    const tempFile2 = path.join(paths.outboxDir, `${deterministicFileName}.tmp.${Date.now()}`);
    fs.writeFileSync(tempFile2, formattedMessage, 'utf-8');
    fs.renameSync(tempFile2, deterministicFilePath);

    // 3. Persist result message in SQLite messages table
    const resultMsg = this.dbService.messages.append({
      id: messageId,
      sessionId: session.id,
      sender: 'knot',
      recipient: 'chatgpt',
      messageType: 'task_result',
      contentMarkdown: sanitizedBodyContent,
      correlationId: task.id,
      metadata: {
        taskId: task.id,
        status: task.status,
      },
    });

    // 4. Update task record with resultMessageId
    this.dbService.tasks.updateExecution(task.id, {
      resultMessageId: resultMsg.id,
    });

    // 5. Append event to SQLite
    this.dbService.events.append({
      sessionId: session.id,
      taskId: task.id,
      eventType: 'task_result_published',
      actor: 'knot',
      data: {
        taskId: task.id,
        messageId: resultMsg.id,
        filePath: outboxFilePath,
        deterministicFilePath,
        status: task.status,
      },
    });

    // 6. Sync canonical conversation
    const messages = this.dbService.messages.listBySession(session.id, { limit: 1000 });
    writeCanonicalConversation(paths.sessionDir, project, session, messages);

    return {
      messageId: resultMsg.id,
      filePath: outboxFilePath,
      deterministicFilePath,
    };
  }
}
