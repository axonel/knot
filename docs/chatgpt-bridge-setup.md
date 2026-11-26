# ChatGPT ↔ Knot Filesystem Bridge Setup & Protocol Specification

This guide documents the end-to-end integration and communication contract between **ChatGPT** (The Orchestrator), **Desktop Commander Remote MCP**, and **Knot** (The Runtime & Workspace).

---

## 1. Overview & Architecture Hierarchy

Knot implements a file-based, zero-direct-API-key communication mesh for multi-agent development:

```
┌─────────────────────────────────────────────────────────────┐
│                   ChatGPT (The Orchestrator)                │
│   • Plans development milestones & tasks                    │
│   • Reads repository & bridge via Desktop Commander MCP     │
│   • Writes task assignments to session inbox                │
└──────────────────────────────┬──────────────────────────────┘
                               │ Filesystem (MCP tools)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│            Knot Bridge Workspace (bridge/v1/)               │
│   • Central registry: workspace-index.md                    │
│   • Session inbox/ & outbox/ directories                    │
│   • Canonical shared conversation stream: conversation.md   │
└──────────────────────────────┬──────────────────────────────┘
                               │ Event-driven chokidar watcher
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Knot Desktop Runtime Engine                 │
│   • Validates payload schema, headers & idempotency keys    │
│   • Enforces FIFO task queuing & human safety gate          │
│   • Dispatches task execution turn to Antigravity CLI       │
└──────────────────────────────┬──────────────────────────────┘
                               │ Stdio streaming (NDJSON)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Antigravity (The Executor)                  │
│   • Runs isolated strictly in project repository root       │
│   • Modifies files, executes build & unit tests             │
│   • Structured telemetry captured & published to outbox     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Desktop Commander MCP Configuration

ChatGPT communicates with the local filesystem through the **Desktop Commander Remote MCP server**.

### The `allowedDirectories` Invariant

Desktop Commander restricts filesystem operations to explicit whitelist paths. For Knot collaboration to function, ChatGPT's MCP server configuration **MUST** include both:
1. **The Knot Bridge Root Directory**: Where `workspace-index.md`, session inboxes, and outboxes reside.
2. **The Project Repository Path**: Where ChatGPT reads source code, tests, and configuration to plan tasks.

> **Note**: Knot never hardcodes paths. The Bridge Root is dynamically located in Electron's persistent `userData` directory:
> - Linux: `~/.config/knot/bridge/v1/`
> - macOS: `~/Library/Application Support/knot/bridge/v1/`
> - Windows: `%APPDATA%\knot\bridge\v1\`

### Example Configuration Snippet

In your Desktop Commander MCP settings (or Desktop Commander configuration JSON):

```json
{
  "allowedDirectories": [
    "/home/username/.config/knot/bridge/v1",
    "/home/username/Projects/my-application"
  ]
}
```

> **Tip**: Inside the Knot desktop application, the **Directory Access Diagnostic** widget displays the exact active paths for your selected project and includes a **"Copy allowedDirectories"** button to copy this JSON snippet with one click.

---

## 3. How ChatGPT Navigates the Workspace

### Step 1: Discover Available Projects & Sessions

ChatGPT should first read the root index file using Desktop Commander's read file tool:

`[bridgeRoot]/workspace-index.md`

This file is maintained continuously by Knot and provides a structured overview:
- Active projects and repository paths.
- Active sessions per project and their IDs.
- Worker status (e.g. Antigravity idle/running).
- In-flight and queued tasks.
- Pointer to the project's **Context Manifest**: `[bridgeRoot]/projects/<projectId>/context-manifest.md`.

### Step 1b: Inspect the Project Context Manifest
Before formulating tasks, ChatGPT should inspect the project context index:
`[bridgeRoot]/projects/<projectId>/context-manifest.md`

This provides an up-to-date manifest of all active architectural decisions, technical constraints, coding standards, domain concepts, and session handoff notes, along with relative links to materialized markdown files in `projects/<projectId>/context/`.
For in-depth details, see [Project Context Vault Specification](context-management.md).

### Step 2: Locate the Session Directory

Each project session has its own isolated communication workspace:

`[bridgeRoot]/projects/<projectId>/sessions/<sessionId>/`

Directory layout:
```text
projects/<projectId>/sessions/<sessionId>/
├── inbox/
│   ├── chatgpt/    <── ChatGPT writes inbound messages & tasks here
│   └── user/       <── User instructions deposited here
├── outbox/
│   └── knot/       <── Knot & Antigravity publish results & replies here
├── state/
│   └── context.json
└── conversation.md <── Chronological human-readable shared transcript
```

---

## 4. The Inbound Protocol

All messages written by ChatGPT to `inbox/chatgpt/` must be Markdown files with **YAML/JSON frontmatter metadata**.

### Filename Convention

Files must follow timestamped, recognizable naming conventions:
- Tasks: `task-<timestamp>-<slug>.md` (e.g. `task-202611250215-auth-migration.md`)
- Activities: `activity-<timestamp>.md` (e.g. `activity-202611250215.md`)
- General messages: `msg-<timestamp>.md`

### Message Types

Knot supports two primary inbound message types from ChatGPT:

#### A. Activity Updates (`activity`)

Use `activity` when ChatGPT is performing research, inspecting files, reviewing PRs, or thinking through architectural decisions. Activities appear in Knot's left-hand Activity Feed without polluting the central conversation transcript.

```markdown
---
id: "act-550e8400-e29b-41d4-a716-446655440001"
timestamp: "2026-11-25T02:15:00.000Z"
sender: "chatgpt"
type: "activity"
category: "inspecting"
title: "Inspecting database migrations"
summary: "Reviewed 001-initial-schema.ts and identified missing index on task status."
---

Completed review of existing migration files. Found that task queries by status will require an index for performance under high concurrency.
```

Supported categories: `planning`, `inspecting`, `reviewing`, `testing`, `analyzing`.

#### B. Task Assignments (`task_assignment`)

Use `task_assignment` to delegate an implementation task to Google Antigravity. Knot parses the frontmatter, queues the task, verifies safety policies, and dispatches it to the Antigravity CLI.

```markdown
---
id: "task-550e8400-e29b-41d4-a716-446655440002"
timestamp: "2026-11-25T02:16:00.000Z"
sender: "chatgpt"
type: "task_assignment"
title: "Implement Task Result Publisher in Orchestration Engine"
description: "Publish structured execution outcomes to outbox/knot/ with changed files and test reports."
priority: "high"
executionMode: "auto"
acceptanceCriteria:
  - "Outbox result file is written with frontmatter containing execution metrics."
  - "Changed files and test exit codes are captured."
  - "Unit tests verify outbox publishing."
contextFiles:
  - "src/main/orchestration/TaskResultPublisher.ts"
  - "tests/taskResultPublisher.test.ts"
affectedFiles:
  - "src/main/orchestration/TaskResultPublisher.ts"
allowedOperations:
  - "read"
  - "write"
  - "bash"
contextReferences:
  - id: "ctx-4f8a-91b2"
    revision: 2
  - id: "ctx-7a8b-9c0d"
---

## Objective
Implement structured outbox publishing when Antigravity completes a delegated task turn.

## Instructions
1. Inspect `src/main/orchestration/TaskResultPublisher.ts`.
2. Format the Markdown frontmatter with taskId, durationMs, filesChanged, and testsExecuted.
3. Include summary of code diffs and commit hashes in the Markdown body.
4. Run `npm test tests/taskResultPublisher.test.ts` to confirm functionality.

## Expected Outcomes
- Clean execution result Markdown published to `outbox/knot/task-<taskId>-result.md`.
```

> **Context Injection**: When `contextReferences` are provided, Knot verifies project ownership and active status, then injects read-only context sections into the task contract dispatched to Antigravity (`## Attached Project & Session Context (Read-Only)`).

#### C. Context Updates (`context_update`)

Use `context_update` when ChatGPT establishes architectural decisions, records technical constraints, updates domain models, or deposits session handoff notes for the next active session.

Knot validates the payload, applies **Optimistic Concurrency Control (OCC)**, versions changes in SQLite (`context_documents` and `context_revisions`), materializes individual markdown documents to disk, and updates `context-manifest.md`.

##### Creating a Document:
```markdown
---
id: "ctx-msg-202611250300"
protocol: "v1"
projectId: "p-4f8a-91b2"
sessionId: "s-1234-abcd"
sender: "chatgpt"
recipient: "knot"
type: "context_update"
createdAt: "2026-11-25T03:00:00.000Z"
metadata:
  scope: "project"
  category: "architecture_decisions"
  title: "Database Architecture: SQLite WAL Mode"
  changeSummary: "Adopted SQLite with WAL mode"
---
# Database Architecture: SQLite WAL Mode

All persistent storage must use `node:sqlite` with WAL mode enabled.
```

##### Updating a Document (OCC Protected):
```markdown
---
id: "ctx-msg-202611250310"
protocol: "v1"
projectId: "p-4f8a-91b2"
sessionId: "s-1234-abcd"
sender: "chatgpt"
recipient: "knot"
type: "context_update"
createdAt: "2026-11-25T03:10:00.000Z"
metadata:
  contextId: "ctx-4f8a-91b2"
  expectedRevision: 1
  category: "architecture_decisions"
  title: "Database Architecture: SQLite WAL Mode with Busy Timeout"
  changeSummary: "Configured 5000ms busy timeout"
---
# Database Architecture: SQLite WAL Mode with Busy Timeout

Configure `PRAGMA busy_timeout = 5000` to prevent concurrent locks.
```

> **Concurrency Conflicts**: If `expectedRevision` does not match the current revision in Knot's SQLite vault, the current document is preserved intact, the collision is stored in `context_conflicts`, and a warning banner appears in Knot's Context Vault Panel for user review.

---

## 5. What Happens During Execution

1. **Ingestion & Validation**: Knot's active watcher detects the file in `inbox/chatgpt/`. It validates file size (<256 KB), frontmatter schema, and checks the idempotency key in SQLite to avoid duplicate processing.
2. **Task Enqueueing**: The task is stored in SQLite with initial status `pending` or `awaiting_approval`.
3. **Safety Evaluation**:
   - If the task only performs standard file edits and tests, it is auto-approved.
   - If the task requests destructive operations, deployment, or git pushes, it is held in `awaiting_approval` until the user clicks **Approve & Dispatch** in Knot.
4. **Antigravity Turn Execution**:
   - The session execution lock ensures single-task concurrency.
   - Knot launches or connects to `agy` running with `cwd` set strictly to the project repository.
   - Knot sends the task prompt via `stream-json`.
   - Real-time tool executions, file edits, and bash commands are recorded.
5. **Completion & Publication**:
   - Antigravity signals completion.
   - Knot compiles the execution details: files touched, commands executed, tests run, git commit hash, errors, and duration.
   - Knot writes the structured report to `outbox/knot/task-<taskId>-result.md` and appends a summary to `conversation.md`.

---

## 6. How ChatGPT Reads the Result

ChatGPT should check `outbox/knot/` in the session workspace:

`[sessionDir]/outbox/knot/task-<taskId>-result.md`

### Structure of the Result Document

```markdown
---
id: "res-550e8400-e29b-41d4-a716-446655440003"
timestamp: "2026-11-25T02:18:30.000Z"
sender: "knot"
type: "task_result"
taskId: "task-550e8400-e29b-41d4-a716-446655440002"
status: "completed"
durationMs: 42350
filesChanged:
  - "src/main/orchestration/TaskResultPublisher.ts"
testsExecuted:
  - name: "TaskResultPublisher unit tests"
    command: "npm test tests/taskResultPublisher.test.ts"
    outcome: "passed"
    exitCode: 0
commitHash: "a1b2c3d"
errors: []
---

# Task Execution Report: Implement Task Result Publisher

## Summary
Successfully implemented structured outbox publishing. All test cases passed.

## Changed Files
- `src/main/orchestration/TaskResultPublisher.ts`

## Test Verification
- `npm test tests/taskResultPublisher.test.ts`: Passed (exit code 0)

## Commit
- Commit: `a1b2c3d`
```

### Interpreting Status
- `completed`: Implementation finished and verified.
- `failed`: Antigravity encountered errors or tests failed. Inspect the `errors` array and test logs.
- `cancelled`: Task was cancelled by the user or invalidated by session archival.

---

---

## 7. Bridge Security Boundaries & Human Review Workflow

### 7.1 The Bridge Trust Model & Limitations
- **Transport Attribution Only**: A metadata header stating `sender: chatgpt` indicates transport-level intent, **not cryptographic authentication**. Any local process with write permissions to the user's bridge directory can create a file with that header.
- **Untrusted Input Invariant**: Knot treats all bridge inbox files as untrusted user input. Files are checked via `fs.lstat` before opening:
  - **Symlinks Prohibited**: Symbolic links are immediately unlinked and moved to `rejected/chatgpt/` (`SYMLINK_NOT_ALLOWED`) without following.
  - **Payload Limit**: Files larger than **256 KB** are rejected prior to memory allocation (`MESSAGE_TOO_LARGE`).
  - **Path Confinement**: Directory path parameters are strictly validated to prevent path traversal (`../`) outside the session inbox.
  - **No Shell Execution**: Markdown text is strictly inert prompt text and never passed to a system shell.
  - **No Self-Elevation**: Messages cannot grant themselves bypass flags, elevated privileges, or project trust status.

### 7.2 Project Trust Policies
- **Approval Required (`approval_required`, Default)**: All incoming tasks, even safe implementation tasks, are held in `awaiting_approval` until approved by the user in Knot.
- **Trusted Project Mode (`trusted`, Opt-In)**: The user may explicitly promote a project in the UI. Safe ordinary tasks are automatically queued and dispatched.
- **Strict Sensitive Gating**: Sensitive operations (e.g. `git push`, branch merge, deployments, deletions, secret access) and ambiguous tasks **always require explicit user approval**, regardless of project trust mode.

### 7.3 Content Integrity & Cryptographic Approval Binding
- Task title, description, and acceptance criteria are hashed using deterministic **SHA-256**.
- User approvals are cryptographically bound to the content hash (`approvedContentHash`).
- Modifying instructions on an approved task invalidates approval and returns the task to `awaiting_approval`.
- Retries with modified instructions require re-approval before dispatch.

### 7.4 Antigravity Execution Safeguards
- Knot enforces strict human-in-the-loop governance:
  - Antigravity is **never** run with flags that bypass tool confirmations (`--dangerously-skip-permissions` or `--always-proceed` are strictly forbidden).
  - Working directory is validated against registered repository path; escaping repo bounds is blocked.
  - Sensitive tasks appear in the UI with amber warning badges, policy rationale, and explicit approval buttons.
  - The user may reject or cancel any task, returning a cancelled result to the outbox with explanation.

---

## 8. Common Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| **MCP Permission Denied** | Desktop Commander configuration is missing the bridge root or project path in `allowedDirectories`. | Copy the JSON from Knot's **Directory Access Diagnostic** panel into Desktop Commander settings and restart the MCP server. |
| **Inbound Message Ignored** | Message written to wrong folder or missing frontmatter. | Ensure the file is written to `inbox/chatgpt/` (not `inbox/`) and has valid YAML/JSON frontmatter starting with `---`. |
| **Duplicate Task Ignored** | Same `id` or identical content was delivered twice. | Use a fresh UUID or unique timestamp for new task assignments. |
| **Session Inactive / Archived** | Writing to an archived session directory. | Check `workspace-index.md` to ensure the session is active before writing. |
| **Antigravity CLI Not Found** | Antigravity (`agy`) is not in system `PATH` or user bin directory. | Install Antigravity CLI and ensure `agy` is accessible in `PATH` (e.g. `~/.local/bin/agy`). |
| **Unread Results Accumulating** | ChatGPT hasn't read outbox results. | Check `outbox/knot/` for pending `task-*-result.md` files after task dispatch. |
