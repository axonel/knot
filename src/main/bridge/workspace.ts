import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { SessionBridgePaths } from './types.js';
import type { Project, Session, Task } from '../../shared/types.js';

export function resolveBridgeRoot(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }
  if (process.env.KNOT_BRIDGE_ROOT) {
    return path.resolve(process.env.KNOT_BRIDGE_ROOT);
  }
  return path.join(app.getPath('userData'), 'bridge', 'v1');
}

export function ensureBridgeRoot(bridgeRoot: string): void {
  fs.mkdirSync(bridgeRoot, { recursive: true });

  const readmePath = path.join(bridgeRoot, 'README.md');
  if (!fs.existsSync(readmePath)) {
    const readmeContent = `# Knot ChatGPT Bridge Workspace (v1)

This directory serves as the local filesystem communication mailbox between **Knot** and **ChatGPT** (via the Desktop Commander Remote MCP connection).

## Directory Structure

\`\`\`text
bridge/
└── v1/
    ├── bridge-instructions.md   <-- Instructions for ChatGPT Orchestrator
    ├── workspace-index.md       <-- Real-time registry of projects, sessions, tasks
    ├── projects/
    │   └── <project-id>/
    │       └── sessions/
    │           └── <session-id>/
    │               ├── inbox/
    │               │   └── chatgpt/       <-- ChatGPT writes inbound messages & task assignments here
    │               ├── processed/
    │               │   └── chatgpt/       <-- Accepted messages moved here
    │               ├── rejected/
    │               │   └── chatgpt/       <-- Malformed messages moved here
    │               ├── outbox/
    │               │   └── knot/          <-- Knot publishes outbound responses & task results here
    │               └── conversation.md    <-- Authoritative conversation log
    └── README.md
\`\`\`

## Roles & Rules
1. **ChatGPT is the Orchestrator**: Inspects repository, plans work, delegates tasks, reviews reports, verifies results.
2. **Antigravity is the Executor**: Receives tasks from ChatGPT, executes them in the repository, returns structured reports.
3. **Knot is the Workspace**: Connects participants, validates messages, manages persistent task queue, publishes results.
`;
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
  }

  const instructionsPath = path.join(bridgeRoot, 'bridge-instructions.md');
  const instructionsContent = `# Knot Bridge Instructions for ChatGPT

You are the **Lead Orchestrator** in Knot, connected via Desktop Commander Remote MCP.

## Your Role as Orchestrator
1. **Understand Project Goals**: Read repository source code, issues, PRs, and user instructions.
2. **Inspect Repositories**: Use Desktop Commander tools (\`read_file\`, \`list_directory\`, \`search_files\`) to inspect project code directly in the project repository.
3. **Plan & Delegate Tasks**: Break complex work into clear, isolated tasks and assign them to **Antigravity** (the Executor).
4. **Review & Verify**: Review Antigravity's task execution reports, verify changes and test suites, and decide next steps.

---

## Desktop Commander Permissions
Ensure Desktop Commander has access to BOTH:
1. The Knot Bridge Root directory: \`${bridgeRoot}\`
2. The Project's Repository directory (e.g. \`/path/to/project\`)

\`\`\`json
{
  "allowedDirectories": [
    "${bridgeRoot}",
    "<project-repository-path>"
  ]
}
\`\`\`

---

## Workspace Index
Read the real-time project and session index at:
\`${path.join(bridgeRoot, 'workspace-index.md')}\`

---

## How to Report Orchestration Activity
To report research, code review, or planning without creating a task:
Write to: \`<bridge-root>/projects/<project-id>/sessions/<session-id>/inbox/chatgpt/<unique-uuid>.md\`

\`\`\`markdown
<!-- KNOT_MESSAGE_V1
{
  "id": "<uuid-v4>",
  "protocol": "v1",
  "projectId": "<project-id>",
  "sessionId": "<session-id>",
  "sender": "chatgpt",
  "recipient": "knot",
  "type": "activity",
  "createdAt": "<iso-8601-timestamp>",
  "metadata": {
    "category": "repo_inspection",
    "reference": "src/main/auth.ts"
  }
}
-->

# Repository Inspection: Auth Flow
Inspected auth flow and discovered token refresh edge case.
\`\`\`

Valid activity categories: \`repo_inspection\`, \`code_review\`, \`pr_review\`, \`planning\`, \`verification\`, \`other\`.

---

## How to Assign Tasks to Antigravity
Write to: \`<bridge-root>/projects/<project-id>/sessions/<session-id>/inbox/chatgpt/<unique-uuid>.md\`

\`\`\`markdown
<!-- KNOT_MESSAGE_V1
{
  "id": "<uuid-v4>",
  "protocol": "v1",
  "projectId": "<project-id>",
  "sessionId": "<session-id>",
  "sender": "chatgpt",
  "recipient": "antigravity",
  "type": "task_assignment",
  "createdAt": "<iso-8601-timestamp>",
  "metadata": {
    "title": "Fix token expiration edge case in auth module",
    "priority": "high",
    "executionMode": "default",
    "acceptanceCriteria": [
      "Unit tests pass for expired tokens",
      "No regression in login flow"
    ]
  }
}
-->

# Fix token expiration edge case

## Objective
Update auth token expiration check to handle expired tokens gracefully.

## Acceptance Criteria
- [ ] Unit tests pass for expired tokens
- [ ] No regression in login flow

## Constraints
- Modify only src/main/auth.ts and tests/auth.test.ts
- Run tests and report results
\`\`\`

---

## How to Read Task Results
When Antigravity finishes a task, Knot writes the result to:
\`<bridge-root>/projects/<project-id>/sessions/<session-id>/outbox/knot/task-<taskId>-result.md\`

The result contains the execution status, files changed, and Antigravity's summary report.

---

## Canonical Conversation
A complete chronological transcript is maintained by Knot at:
\`<bridge-root>/projects/<project-id>/sessions/<session-id>/conversation.md\`
`;
  // Always update instructions atomically so improvements persist across sessions
  const tempFile = path.join(bridgeRoot, `bridge-instructions.tmp.${Date.now()}`);
  fs.writeFileSync(tempFile, instructionsContent, 'utf-8');
  fs.renameSync(tempFile, instructionsPath);
}

export function resolveSessionPaths(
  bridgeRoot: string,
  projectId: string,
  sessionId: string
): SessionBridgePaths {
  const projectDir = path.join(bridgeRoot, 'projects', projectId);
  const sessionDir = path.join(projectDir, 'sessions', sessionId);
  const inboxDir = path.join(sessionDir, 'inbox', 'chatgpt');
  const processedDir = path.join(sessionDir, 'processed', 'chatgpt');
  const rejectedDir = path.join(sessionDir, 'rejected', 'chatgpt');
  const outboxDir = path.join(sessionDir, 'outbox', 'knot');
  const conversationFile = path.join(sessionDir, 'conversation.md');

  return {
    projectDir,
    sessionDir,
    inboxDir,
    processedDir,
    rejectedDir,
    outboxDir,
    conversationFile,
  };
}

export function initSessionWorkspace(
  bridgeRoot: string,
  projectId: string,
  sessionId: string
): SessionBridgePaths {
  ensureBridgeRoot(bridgeRoot);
  const paths = resolveSessionPaths(bridgeRoot, projectId, sessionId);

  fs.mkdirSync(paths.inboxDir, { recursive: true });
  fs.mkdirSync(paths.processedDir, { recursive: true });
  fs.mkdirSync(paths.rejectedDir, { recursive: true });
  fs.mkdirSync(paths.outboxDir, { recursive: true });

  if (!fs.existsSync(paths.conversationFile)) {
    const initialConversation = `# Knot Session Conversation

- **Project ID**: \`${projectId}\`
- **Session ID**: \`${sessionId}\`
- **Initialized**: \`${new Date().toISOString()}\`

---
*No messages exchanged yet.*
`;
    fs.writeFileSync(paths.conversationFile, initialConversation, 'utf-8');
  }

  return paths;
}

export function writeCanonicalConversation(
  sessionDir: string,
  project: { id: string; name: string },
  session: { id: string; title: string },
  messages: Array<{
    sequence: number;
    sender: string;
    createdAt: string;
    contentMarkdown: string;
  }>
): void {
  const conversationFile = path.join(sessionDir, 'conversation.md');
  const tempFile = path.join(sessionDir, `conversation.tmp.${Date.now()}`);

  let content = `# ${session.title}\n\n`;
  content += `- **Project**: ${project.name} (\`${project.id}\`)\n`;
  content += `- **Session ID**: \`${session.id}\`\n`;
  content += `- **Last Updated**: \`${new Date().toISOString()}\`\n`;
  content += `- **Total Messages**: ${messages.length}\n\n`;
  content += `---\n\n`;

  if (messages.length === 0) {
    content += `*No messages recorded yet.*\n`;
  } else {
    for (const msg of messages) {
      content += `### #${msg.sequence} | ${msg.sender.toUpperCase()} | ${msg.createdAt}\n\n`;
      content += `${msg.contentMarkdown.trim()}\n\n---\n\n`;
    }
  }

  // Atomic write via temporary file and rename
  fs.writeFileSync(tempFile, content, 'utf-8');
  fs.renameSync(tempFile, conversationFile);
}

export function writeWorkspaceIndex(
  bridgeRoot: string,
  projects: Project[],
  sessionsByProject: Map<string, Session[]>,
  tasksBySession: Map<string, Task[]>
): void {
  ensureBridgeRoot(bridgeRoot);
  const indexPath = path.join(bridgeRoot, 'workspace-index.md');
  const tempFile = path.join(bridgeRoot, `workspace-index.tmp.${Date.now()}`);

  let content = `# Knot Workspace Index\n\n`;
  content += `> Authoritative registry of active projects, development sessions, and tasks in Knot.\n\n`;
  content += `- **Bridge Root**: \`${bridgeRoot}\`\n`;
  content += `- **Last Synced**: \`${new Date().toISOString()}\`\n`;
  content += `- **Total Projects**: ${projects.length}\n\n`;
  content += `---\n\n`;

  if (projects.length === 0) {
    content += `*No projects created yet.*\n`;
  } else {
    for (const project of projects) {
      content += `## Project: ${project.name}\n\n`;
      content += `- **Project ID**: \`${project.id}\`\n`;
      content += `- **Repository Path**: \`${project.repositoryPath || 'Not configured'}\`\n`;
      if (project.repositoryRemote) {
        content += `- **Repository Remote**: \`${project.repositoryRemote}\`\n`;
      }
      content += `\n`;

      const sessions = sessionsByProject.get(project.id) || [];
      if (sessions.length === 0) {
        content += `*No sessions for this project.*\n\n`;
      } else {
        content += `### Sessions\n\n`;
        for (const session of sessions) {
          const paths = resolveSessionPaths(bridgeRoot, project.id, session.id);
          content += `#### ${session.title} (\`${session.id}\`)\n`;
          content += `- **Status**: \`${session.status}\`\n`;
          content += `- **Inbox Path**: \`${paths.inboxDir}\`\n`;
          content += `- **Outbox Path**: \`${paths.outboxDir}\`\n`;
          content += `- **Conversation**: \`${paths.conversationFile}\`\n`;

          const tasks = tasksBySession.get(session.id) || [];
          if (tasks.length > 0) {
            content += `- **Tasks (${tasks.length})**:\n`;
            for (const t of tasks.slice(0, 10)) {
              content += `  - [\`${t.status}\`] **${t.title}** (Priority: \`${t.priority || 'normal'}\`, ID: \`${t.id}\`)\n`;
            }
          } else {
            content += `- **Tasks**: None\n`;
          }
          content += `\n`;
        }
      }
      content += `---\n\n`;
    }
  }

  fs.writeFileSync(tempFile, content, 'utf-8');
  fs.renameSync(tempFile, indexPath);
}
