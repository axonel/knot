# Knot — Unified Execution Timeline & Audit Trail Architecture

## 1. Overview & Objective

Knot connects a user's ChatGPT browser session (the **Orchestrator**) to their local environment and Google Antigravity CLI (the **Executor**).

The **Unified Execution Timeline & Audit Trail** provides a chronological, persistent, project-aware record of all activities and state transitions across the multi-agent development lifecycle.

A user or orchestrator can inspect any project, session, or specific task and reconstruct the complete chain of events:
1. **Repository Inspection & Planning**: ChatGPT inspects repository files or context.
2. **Task Assignment**: ChatGPT formulates instructions and assigns a task.
3. **Queue & Policy Evaluation**: Knot validates, evaluates safety policies, and queues the task.
4. **Approval Gate**: Human approval is requested, granted, or rejected if required by policy.
5. **Git Baseline Capture**: Knot records a clean/dirty repository snapshot prior to execution.
6. **Execution & Tool Operations**: Antigravity process executes tools (`write_to_file`, `run_command`, etc.).
7. **Git Verification**: Knot captures working-tree changes, unified diffs, and commit hashes.
8. **Result Publication**: Knot publishes structured markdown results into ChatGPT's outbox.
9. **Subsequent Verification**: ChatGPT inspects the result and records verification.
10. **Context Evolution**: Project or session context documents are updated or archived.

---

## 2. Fundamental Principles

### 2.1 The Invariant Participant Roles
- **ChatGPT — Sole Planner & Decision Maker**: Plans implementation, assigns tasks, verifies results, and authors project context updates.
- **Antigravity — Dedicated Executor**: Receives task instructions, runs tools, writes files, runs tests, and reports outcomes.
- **Knot — Runtime & Audit Trail**: Ingests, queues, enforces safety policies, records telemetry, verifies Git state, and logs all events immutably without inventing AI decisions or summaries.

### 2.2 Explicit Provenance vs Independent Observation
A core requirement is making the distinction between **reported activity** and **independently observed telemetry** explicit:
- When ChatGPT reports that it inspected code or verified results, that event is tagged with `chatgpt_reported`. Knot does not present this as independently verified telemetry.
- When Antigravity reports tool execution and internal status, it is tagged with `antigravity_reported`.
- When Knot observes process lifecycle, IPC invocations, or outbox publications, it is tagged with `knot_observed`.
- When Knot executes `git status` or verifies commit hashes in the local repo, it is tagged with `git_verified`.
- When a human user approves, cancels, or modifies a task in the interface, it is tagged with `user_recorded`.

---

## 3. Canonical Event Data Model

All timeline events are persisted in the SQLite `events` table (upgraded via migration `006-unified-timeline.ts`):

```typescript
export interface EventItem {
  id: string;                         // UUID primary key (idempotency key)
  projectId?: string | null;          // Project scope (auto-resolved from session/task)
  sessionId: string | null;           // Session scope (nullable for project-level events)
  taskId: string | null;              // Associated task (if event belongs to a task lifecycle)
  correlationId?: string | null;      // Cross-agent tracing ID
  eventType: string;                  // Canonical event type identifier
  actor: EventActor;                  // 'chatgpt' | 'antigravity' | 'knot' | 'user' | 'system' | 'git'
  source: EventSource;                // 'chatgpt_bridge' | 'filesystem_bridge' | 'antigravity_cli' | 'orchestration_runtime' | 'local_git' | 'context_vault' | 'user_ui' | 'sqlite'
  provenance: EventProvenance;        // 'chatgpt_reported' | 'antigravity_reported' | 'knot_observed' | 'git_verified' | 'user_recorded'
  title: string;                      // Human-readable summary title
  severity: EventSeverity;            // 'info' | 'success' | 'warning' | 'warn' | 'error'
  data?: Record<string, unknown> | null; // Structured JSON payload
  timestamp: string;                  // ISO 8601 occurrence timestamp
  createdAt: string;                  // ISO 8601 SQLite ingestion timestamp
}
```

### Deterministic Ordering & Idempotency
- Events are ordered deterministically by:
  ```sql
  ORDER BY event_timestamp ASC, created_at ASC, id ASC
  ```
- Event insertion is **idempotent**: re-inserting an event with an existing `id` returns the existing record rather than duplicating or corrupting the audit log.

---

## 4. The Three Timeline Scopes

### 4.1 Project Timeline
- Displays all events across all sessions and tasks for a given project.
- Shows cross-session continuity, context evolution (created/updated/archived documents), and global project history.

### 4.2 Session Timeline
- Displays the chronological activity stream for the active session.
- Captures inbound bridge messages, queueing, active task transitions, and intermediate execution events.

### 4.3 Task Execution Trace (Deep Inspection)
- Focused audit trail for a specific `taskId`.
- Automatically partitions events into **7 Lifecycle Stages**:
  1. `assignment`: ChatGPT task formulation, prompt, and parameters.
  2. `queue`: Knot ingestion, priority queueing, and dispatch locks.
  3. `approval`: Policy evaluation, approval requests, grants, or rejections.
  4. `execution`: Antigravity CLI process startup, streaming tool actions, and turn outcomes.
  5. `git`: Baseline status check, working-tree changes, and verified commit hashes.
  6. `completion`: Structured result outbox publication and completion status transitions.
  7. `verification`: Subsequent review and verification recorded by ChatGPT.
- Summarizes total duration, queue wait duration, execution duration, approver identity, verified commit hash, and ChatGPT verification summary.

---

## 5. Trace Export & Secret Redaction

Tasks can be exported in two formats for audits, debugging, or sharing:
- **Markdown (`.md`)**: Human-readable report containing header metrics, lifecycle stages breakdown, and full chronological audit table.
- **JSON (`.json`)**: Machine-readable full trace with raw events and metrics.

### Sensitive Secret Sanitization
Both export formats automatically pass payloads through `sanitizeLogOutput`, which redacts:
- Bearer tokens (`Bearer [REDACTED_TOKEN]`)
- API keys (`sk-[REDACTED_CREDENTIAL]`, `AIzaSy[REDACTED_KEY]`)
- Passwords and auth tokens in JSON fields (`authorization`, `apiKey`, `password`, `secret`)
- Private keys (`-----BEGIN PRIVATE KEY----- ... [REDACTED_PRIVATE_KEY]`)

---

## 6. User Interface & Color Compliance

The `UnifiedTimelinePanel` is rendered in Knot's central workspace panel (alongside Conversation and Context Vault) and strictly adheres to Knot's 5-color palette:

| Color | Hex | Role |
| :--- | :--- | :--- |
| **Deepest Background** | `#090B0D` | Canvas, code payload backgrounds, input fields |
| **Panel Surface** | `#092634` | Cards, stage accordions, timeline entries, toolbars |
| **Teal / Cyan Border** | `#004E72` | Timeline lines, active filter chips, secondary accents |
| **Warm Coral** | `#FF6E42` | Highlights, Antigravity badges, errors, warnings |
| **Off-White Text** | `#F9F9F9` | Primary typography, icons, borders (`#F9F9F9`/10) |
