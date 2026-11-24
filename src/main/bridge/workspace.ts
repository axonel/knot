import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { SessionBridgePaths } from './types.js';

export function resolveBridgeRoot(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
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
    ├── bridge-instructions.md
    ├── projects/
    │   └── <project-id>/
    │       └── sessions/
    │           └── <session-id>/
    │               ├── inbox/
    │               │   └── chatgpt/       <-- ChatGPT writes inbound messages here
    │               ├── processed/
    │               │   └── chatgpt/       <-- Accepted messages moved here
    │               ├── rejected/
    │               │   └── chatgpt/       <-- Malformed messages moved here
    │               ├── outbox/
    │               │   └── knot/          <-- Knot publishes outbound messages here
    │               └── conversation.md    <-- Knot's canonical conversation snapshot
    └── README.md
\`\`\`

## Rules for Agents & Tools

1. **Inbound Messages (ChatGPT -> Knot)**: Write individual Markdown files into \`inbox/chatgpt/<message-id>.md\` using the documented \`<!-- KNOT_MESSAGE_V1 ... -->\` header.
2. **Outbound Messages (Knot -> ChatGPT)**: Read published responses from \`outbox/knot/<message-id>.md\`.
3. **Canonical Conversation**: Do NOT edit \`conversation.md\` directly. Knot maintains this file as the single authoritative writer.
`;
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
  }

  const instructionsPath = path.join(bridgeRoot, 'bridge-instructions.md');
  if (!fs.existsSync(instructionsPath)) {
    const instructionsContent = `# Knot Bridge Instructions for ChatGPT

You are communicating with **Knot**, an autonomous multi-agent developer environment.

## How to Send Messages to Knot
When you need to send a message, task update, or inquiry to Knot, use Desktop Commander's \`write_file\` tool to create a new Markdown file inside the active session's inbox:
\`<bridge-root>/projects/<project-id>/sessions/<session-id>/inbox/chatgpt/<message-id>.md\`

### Required Message Format
Every message must begin with the following metadata header block:

\`\`\`markdown
<!-- KNOT_MESSAGE_V1
{
  "id": "<generate-unique-uuid-v4>",
  "protocol": "v1",
  "projectId": "<active-project-id>",
  "sessionId": "<active-session-id>",
  "sender": "chatgpt",
  "recipient": "knot",
  "type": "message",
  "createdAt": "<iso-8601-timestamp>"
}
-->

# Message Title or Summary

Your response or question content here.
\`\`\`

## How to Read Knot's Responses
Knot publishes responses into the session outbox:
\`<bridge-root>/projects/<project-id>/sessions/<session-id>/outbox/knot/\`

Use Desktop Commander's \`read_file\` or \`read_multiple_files\` to check for new messages in this folder.

## Canonical Conversation
A complete chronological conversation log is maintained at:
\`<bridge-root>/projects/<project-id>/sessions/<session-id>/conversation.md\`
You may read this file at any time to understand full conversation context. Do NOT modify this file directly.
`;
    fs.writeFileSync(instructionsPath, instructionsContent, 'utf-8');
  }
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
