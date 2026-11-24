# Knot: ChatGPT-Led Multi-Agent Orchestration Architecture

This document specifies the technical architecture, communication protocols, queue lifecycle, safety execution policies, and user interface of **Knot's Orchestration Engine**.

---

## 1. The 3-Participant Model

Knot establishes a multi-agent developer workspace connecting a user's web-based ChatGPT session to local repository code and Google Antigravity CLI execution. There are exactly three primary participants:

```
┌─────────────────────────────────────────────────────────────┐
│                 ChatGPT (The Orchestrator)                  │
│  - Sole planner & decision maker                            │
│  - Inspects code & reviews PRs via Desktop Commander MCP    │
│  - Formulates & assigns tasks to Antigravity                │
│  - Verifies results & plans next project milestones         │
└──────────────────────────────┬──────────────────────────────┘
                               │ Reads/Writes Markdown via
                               │ Desktop Commander Remote MCP
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Knot (The Workspace & Runtime)             │
│  - Local Electron app & persistent SQLite database          │
│  - Real-time workspace registry (workspace-index.md)        │
│  - Persistent FIFO Antigravity task queue                   │
│  - Safety policy engine (safe auto-approve vs sensitive gate)│
│  - Atomic outbox task result publisher                      │
│  - Canonical single-writer conversation log                 │
│  - 3-Panel Collaboration UI                                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ Dispatches prompt & captures
                               │ NDJSON event stream
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Antigravity (The Executor)                  │
│  - Focused implementation worker (Google Antigravity CLI)   │
│  - Executes tasks strictly inside project repository        │
│  - Reports tool actions, edits, test outcomes, and summary  │
│  - Never plans next steps or overrides project direction    │
└─────────────────────────────────────────────────────────────┘
```

### Roles and Boundaries

1. **ChatGPT — The Orchestrator**:
   - ChatGPT is the **sole planning and decision-making agent**.
   - Inspects project code directly using Desktop Commander Remote MCP tools (`read_file`, `list_directory`, `search_files`).
   - Reviews GitHub PRs and issues via existing browser connectors.
   - Breaks work into isolated, actionable implementation tasks.
   - Reports background progress (`activity`) and delegates tasks (`task_assignment`).
   - Reviews Antigravity's task completion reports and verifies code diffs and test suites.
   - Never directly modifies project code files when delegating to Antigravity; all code modifications are performed by the Executor.

2. **Antigravity — The Executor**:
   - Antigravity is the **implementation worker** running on the local machine.
   - Runs with its working directory strictly bound to the target project's repository.
   - Receives standardized task contracts from Knot containing objectives, constraints, and acceptance criteria.
   - Modifies files, runs test suites, and generates concise completion reports.
   - Never independently plans project milestones or manages GitHub repositories.

3. **Knot — The Workspace & Orchestration Runtime**:
   - Provides the local execution environment, process manager, and SQLite persistence.
   - Monitors the filesystem bridge mailbox (`app.getPath('userData')/bridge/v1/`).
   - Maintains a real-time global registry (`workspace-index.md`).
   - Ingests task assignments, validates protocols, and prevents duplicate deliveries.
   - Manages a persistent SQLite task queue with per-session isolation and FIFO priority sorting.
   - Enforces safety policies: auto-approves safe development tasks, gates sensitive operations for user confirmation.
   - Dispatches tasks to Antigravity and captures streaming NDJSON telemetry.
   - Publishes deterministic task results (`task-<id>-result.md`) to the outbox and appends canonical conversation records.

---

## 2. Desktop Commander MCP Configuration

ChatGPT interacts with the Knot filesystem bridge and the user's project repositories using **Desktop Commander Remote MCP**.

### Permissions Configuration

To enable full orchestration capability, Desktop Commander must be configured with access to **both**:
1. Knot's Bridge Root directory (`<bridgeRoot>`).
2. The Project's Repository directory (`<repositoryPath>`).

#### Example `allowedDirectories` Configuration:

```json
{
  "allowedDirectories": [
    "/home/username/.config/Knot/bridge/v1",
    "/home/username/Projects/my-app"
  ]
}
```

In Knot, users can copy this exact JSON snippet directly from the **Directory Access Diagnostic** chip in the workspace toolbar or the Bridge status panel.

---

## 3. Bridge Filesystem Protocols

All inter-agent communication occurs via standardized Markdown files with structured JSON headers.

### Directory Structure

```text
bridge/
└── v1/
    ├── bridge-instructions.md   <-- Instructions for ChatGPT Orchestrator
    ├── workspace-index.md       <-- Real-time registry of projects, sessions, tasks
    ├── projects/
    │   └── <project-id>/
    │       └── sessions/
    │           └── <session-id>/
    │               ├── inbox/
    │               │   └── chatgpt/       <-- ChatGPT drops inbound messages & tasks
    │               ├── processed/
    │               │   └── chatgpt/       <-- Accepted messages moved here
    │               ├── rejected/
    │               │   └── chatgpt/       <-- Malformed messages + .error.json diagnostic
    │               ├── outbox/
    │               │   └── knot/          <-- Outbound responses & task-<id>-result.md
    │               └── conversation.md    <-- Authoritative conversation log
    └── README.md
```

### Protocol Types

#### 1. Task Assignment (`type: "task_assignment"`)
ChatGPT delegates an implementation task to Antigravity by writing to `inbox/chatgpt/<uuid>.md`:

```markdown
<!-- KNOT_MESSAGE_V1
{
  "id": "c1f7b029-d50c-4ad9-906d-e490ad312384",
  "protocol": "v1",
  "projectId": "p-1001",
  "sessionId": "s-2002",
  "sender": "chatgpt",
  "recipient": "antigravity",
  "type": "task_assignment",
  "createdAt": "2026-11-24T12:00:00.000Z",
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
Update the auth token expiration check to handle expired tokens gracefully without throwing unhandled exceptions.

## Acceptance Criteria
- [ ] Unit tests pass for expired tokens
- [ ] No regression in login flow

## Constraints
- Modify only src/main/auth.ts and tests/auth.test.ts
- Run `npm test tests/auth.test.ts` to verify
```

#### 2. Orchestration Activity (`type: "activity"`)
ChatGPT reports research, code inspection, or PR reviews without creating tasks or polluting `conversation.md`:

```markdown
<!-- KNOT_MESSAGE_V1
{
  "id": "e2a4c108-b80c-4573-a81d-e591cf381921",
  "protocol": "v1",
  "projectId": "p-1001",
  "sessionId": "s-2002",
  "sender": "chatgpt",
  "recipient": "knot",
  "type": "activity",
  "createdAt": "2026-11-24T12:05:00.000Z",
  "metadata": {
    "category": "repo_inspection",
    "reference": "src/main/auth.ts"
  }
}
-->

# Repository Inspection: Token Validation Logic
Inspected token validation logic in `src/main/auth.ts`. Discovered that expired tokens return undefined instead of rejecting with `ERR_TOKEN_EXPIRED`.
```

Valid activity categories:
- `repo_inspection`
- `code_review`
- `pr_review`
- `planning`
- `verification`
- `other`

Activity events are stored in the SQLite `events` table as `chatgpt_activity` events and displayed in Knot's **ChatGPT-Reported Activity** panel.

#### 3. Task Result (`task-<taskId>-result.md`)
When Antigravity completes a task, Knot writes a deterministic result file to `outbox/knot/task-<taskId>-result.md`:

```markdown
<!-- KNOT_MESSAGE_V1
{
  "id": "d3810283-4a12-4211-9a71-f92182910245",
  "protocol": "v1",
  "projectId": "p-1001",
  "sessionId": "s-2002",
  "sender": "knot",
  "recipient": "chatgpt",
  "type": "task_result",
  "createdAt": "2026-11-24T12:10:00.000Z",
  "metadata": {
    "taskId": "task-uuid-1234",
    "status": "succeeded",
    "filesChanged": ["src/main/auth.ts", "tests/auth.test.ts"],
    "summary": "Updated token expiry check and added unit tests."
  }
}
-->

# Task Result: Fix token expiration edge case in auth module

- **Task ID**: `task-uuid-1234`
- **Status**: `succeeded`
- **Completed At**: `2026-11-24T12:10:00.000Z`

## Summary
Updated token expiry check and added unit tests.

## Files Changed
- `src/main/auth.ts`
- `tests/auth.test.ts`
```

#### 4. Real-time Workspace Index (`workspace-index.md`)
Knot maintains an atomic, up-to-date registry of all projects, sessions, active workers, and tasks at `<bridgeRoot>/workspace-index.md`:

```markdown
# Knot Workspace Index

Generated: 2026-11-24T12:10:00.000Z

## Projects & Sessions

### Alpha Project
- **Project ID**: `p-1001`
- **Repository Path**: `/home/user/Projects/alpha`
- **Sessions**:
  - `s-2002`: **Auth Orchestration** (active)
    - Worker Status: `ready`
    - Tasks (1 total, 0 queued, 0 running, 1 succeeded)
      - `[succeeded]` Fix token expiration edge case in auth module (priority: high)
```

---

## 4. Persistent Task Queue & Execution Policies

### Queue Lifecycle State Machine

```
                      ┌──────────────────────┐
                      │ Ingested from Inbox  │
                      └──────────┬───────────┘
                                 │
                   Policy: Is task sensitive?
                   ┌─────────────┴─────────────┐
          Safe     │                           │ Sensitive
                   ▼                           ▼
          ┌────────────────┐          ┌───────────────────┐
          │     queued     │          │ awaiting_approval │
          └────────┬───────┘          └─────────┬─────────┘
                   │                            │
                   │               User Action: │
                   │         ┌──────────────────┴──────────────────┐
                   │         │                                     │
                   │         ▼ Approve                             ▼ Reject
                   │  ┌──────────────┐                     ┌───────────────┐
                   └──►   approved   │                     │   cancelled   │
                      └──────┬───────┘                     └───────────────┘
                             │
                             ▼ Concurrency Gate (1 active task per session)
                      ┌──────────────┐
                      │   running    │
                      └──────┬───────┘
                             │
            Execution Outcome│
            ┌────────────────┴────────────────┐
            │                                 │
            ▼ Succeeded                       ▼ Failed
     ┌──────────────┐                  ┌──────────────┐
     │  succeeded   │                  │    failed    │
     └──────────────┘                  └──────┬───────┘
                                              │ User Action: Retry
                                              ▼
                                       ┌──────────────┐
                                       │    queued    │
                                       └──────────────┘
```

### Safety Execution Policies

Knot inspects every task assignment's title, body, and acceptance criteria against safety heuristics:

| Category | Indicators / Patterns | Action |
|---|---|---|
| **Safe Tasks** | Implementation, refactoring, unit tests, bug fixes, documentation, styling | Auto-approved into `queued` state |
| **Sensitive Tasks** | `git push`, `force push`, `drop table`, `rm -rf`, delete, production deploy, migrations, secrets | Placed into `awaiting_approval` state requiring explicit user approval |

#### Concurrency and FIFO Guarantees
- Concurrency limit is strictly **1 active task per session**.
- Tasks are ordered by Priority (`urgent` > `high` > `normal` > `low`) and then FIFO (`created_at ASC`).
- When a task completes, the next eligible approved task in the session queue is dispatched automatically.
- Upon application restart, tasks left in `running` state are safely reset to `queued` to prevent dropped execution.

---

## 5. Multi-Project Collaboration Workspace UI

The Knot workspace provides a unified, 3-panel command center:

1. **Workspace Tree Sidebar**:
   - Displays all registered projects, repository paths, and active sessions.
   - Shows live task count badges per session.
   - Allows instant creation of new projects and sessions.

2. **Left Panel — ChatGPT-Reported Activity**:
   - Filter chips: All, Repo Inspection, Code Review, PR Review, Planning, Verification.
   - Chronological feed of ChatGPT's research findings and architectural decisions.
   - Keeps canonical conversation clean and free of background noise.

3. **Center Panel — Shared Conversation**:
   - Clean transcript of authoritative messages between ChatGPT, Knot, and Antigravity.
   - Color-coded participant badges: `#004E72` (ChatGPT), `#FF6E42` (Antigravity), `#092634` (Knot).
   - Instant copy buttons for markdown blocks and task instructions.

4. **Right Panel — Antigravity Execution**:
   - Worker readiness indicator (Ready, Thinking, Stopped, Auth Required).
   - Highlighted active task card or pending approval gate.
   - Interactive Acceptance Criteria checklist.
   - Approve & Dispatch, Reject, Cancel, and Retry actions.
   - Tabbed view: Pending Task Queue vs Live Streaming Event Console.

5. **Directory Access Diagnostic**:
   - Live checks for bridge folder accessibility and repository directory configuration.
   - One-click copy of the required Desktop Commander `allowedDirectories` JSON.
