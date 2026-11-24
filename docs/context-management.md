# Knot: Project Context Vault & Session Continuity Specification

This document details the architecture, filesystem bridge protocol, optimistic concurrency control, task contract injection, and user interface of **Knot's Project Context Vault**.

---

## 1. Overview & Core Philosophy

When ChatGPT leads development across multiple sessions or resumes work after time away, it needs rapid, durable access to project decisions, architectural rules, domain concepts, and handoff notes. While `conversation.md` and task result logs capture execution events, they do not provide a structured, versioned knowledge repository.

The **Project Context Vault** provides this persistent context layer.

```text
┌─────────────────────────────────────────────────────────────┐
│                 ChatGPT (The Orchestrator)                  │
│  - Reads context-manifest.md on session startup             │
│  - Retrieves relevant project and session context           │
│  - Writes/updates context via context_update bridge msgs    │
│  - Selects context references when assigning tasks          │
└──────────────────────────────┬──────────────────────────────┘
                               │ Markdown Bridge (context_update)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Knot (The Workspace Runtime)               │
│  - Validates schema & enforces optimistic concurrency (OCC) │
│  - SQLite persistence (context_documents, context_revisions)│
│  - Detects & records conflicts without overwriting state    │
│  - Materializes markdown docs & atomic context-manifest.md  │
│  - Injects referenced context into Antigravity task contract│
│  - Provides interactive Context Vault UI in Knot desktop    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Read-Only Injected Context
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Antigravity (The Executor)                  │
│  - Receives read-only context in task dispatch contract     │
│  - Executes task adhering to architecture & constraints     │
│  - Cannot modify or overwrite context vault documents       │
└─────────────────────────────────────────────────────────────┘
```

> **Strict Architectural Invariant:**
> **Knot must NOT generate AI summaries, make decisions, plan tasks, or determine what information ChatGPT needs.**
> ChatGPT authored context is the source of truth for project design and handoff notes. Knot strictly validates, versions, persists, and visualizes that context.

---

## 2. Context Scopes & Categories

The Context Vault organizes knowledge into two distinct operational scopes:

### 2.1 Project Scope (`scope: "project"`)
- **Lifecycle**: Persists across all sessions throughout the project lifetime.
- **Purpose**: Durable technical guidelines, architectural decisions, domain models, coding standards, and repository constraints.
- **Filesystem Location**: `bridge/v1/projects/<projectId>/context/<contextId>.md`

### 2.2 Session Scope (`scope: "session"`)
- **Lifecycle**: Tied to a specific session ID (`sessionId`).
- **Purpose**: Ephemeral handoff notes, work-in-progress state, focused next steps, and task coordination for the next active session.
- **Filesystem Location**: `bridge/v1/projects/<projectId>/sessions/<sessionId>/context/<contextId>.md`

### 2.3 Supported Categories

| Category | Typical Scope | Description |
| :--- | :--- | :--- |
| `architecture_decisions` | Project | Architectural choices, module boundaries, database technology (ADRs). |
| `technical_constraints` | Project | Runtime versions, platform limits, required libraries, disallowed patterns. |
| `domain_concepts` | Project | Core domain terminology, entity relationships, business logic rules. |
| `coding_standards` | Project | Code formatting, testing requirements, error handling guidelines. |
| `session_handoff` | Session | Summary of work completed in the session and clear next steps for the next session. |
| `custom` | Project / Session | User-defined or project-specific context documents. |

---

## 3. SQLite Persistence & Schema (Migration 005)

The vault uses three SQLite tables with foreign keys and index optimizations:

### 3.1 `context_documents` (Current State)
- `id`: Unique document ID (`ctx-<uuid>`).
- `project_id`: Foreign key referencing `projects.id` (`ON DELETE CASCADE`).
- `session_id`: Optional foreign key referencing `sessions.id` (`ON DELETE SET NULL`).
- `scope`: `'project'` or `'session'`.
- `category`: Category string identifier.
- `title`: Human-readable document title.
- `content_markdown`: Current Markdown body.
- `author`: Author identity (e.g. `'chatgpt'` or `'user'`).
- `provenance`: Origin indicator (`'chatgpt-authored'` or `'user-authored'`).
- `content_hash`: SHA-256 hash of `content_markdown` for integrity verification.
- `current_revision`: Integer counter starting at 1.
- `is_archived`: 0 for active, 1 for soft-deleted/archived.
- `requires_verification`: 1 if document contains claims requiring human/repository verification.
- `created_at`, `updated_at`, `archived_at`: ISO 8601 timestamps.

### 3.2 `context_revisions` (Historical Audit Log)
Every document modification or creation appends an immutable revision row:
- `id`: Revision ID (`ctx-rev-<uuid>`).
- `context_id`: References `context_documents.id` (`ON DELETE CASCADE`).
- `revision`: Revision sequence number (1, 2, 3...).
- `title`: Snapshot of title.
- `content_markdown`: Snapshot of body.
- `content_hash`: SHA-256 hash of content snapshot.
- `author`: Author who authored this revision.
- `provenance`: Provenance mode.
- `requires_verification`: Verification flag snapshot.
- `change_summary`: Summary explaining why the change was made.
- `created_at`: ISO 8601 timestamp.

### 3.3 `context_conflicts` (Optimistic Concurrency Violations)
When a concurrent update fails revision or content hash checks, the conflict is preserved:
- `id`: Conflict ID (`ctx-conf-<uuid>`).
- `context_id`: Target document ID.
- `project_id`, `session_id`: Project and session context.
- `expected_revision`: The revision the sender expected.
- `actual_revision`: The actual current revision in SQLite.
- `incoming_title`, `incoming_content`, `incoming_author`: Incoming payload.
- `conflict_reason`: Explanatory message.
- `is_resolved`: 0 if active, 1 when dismissed or reconciled by user.
- `created_at`, `resolved_at`: ISO 8601 timestamps.

---

## 4. Markdown Bridge Protocol Extension (`context_update`)

ChatGPT creates or updates context documents by writing a message of type `context_update` to its session inbox:
`bridge/v1/projects/<projectId>/sessions/<sessionId>/inbox/chatgpt/<messageId>.md`

### 4.1 Creating a New Context Document
```markdown
---
id: "550e8400-e29b-41d4-a716-446655440000"
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
  changeSummary: "Initial decision to use SQLite with WAL mode"
---
# Database Architecture: SQLite WAL Mode

## Context & Problem
We require embedded, fast, serverless persistence with concurrent read access.

## Decision
We choose `node:sqlite` with WAL mode enabled.
```

### 4.2 Updating an Existing Document (OCC Protected)
To update an existing document, ChatGPT includes `contextId` and `expectedRevision`:
```markdown
---
id: "660e8400-e29b-41d4-a716-446655440001"
protocol: "v1"
projectId: "p-4f8a-91b2"
sessionId: "s-1234-abcd"
sender: "chatgpt"
recipient: "knot"
type: "context_update"
createdAt: "2026-11-25T03:30:00.000Z"
metadata:
  contextId: "ctx-7a8b-9c0d"
  expectedRevision: 1
  category: "architecture_decisions"
  title: "Database Architecture: SQLite WAL Mode with Busy Timeout"
  changeSummary: "Added busy timeout configuration of 5000ms"
---
# Database Architecture: SQLite WAL Mode with Busy Timeout

## Updated Configuration
Set `PRAGMA busy_timeout = 5000` to prevent locked database errors under concurrent read/write transactions.
```

### 4.3 Concurrency Control & Conflict Resolution
- If `expectedRevision` matches `current_revision`, Knot:
  1. Increments `current_revision` to `current_revision + 1`.
  2. Updates `context_documents` and appends a `context_revisions` entry.
  3. Re-materializes the markdown file and regenerates `context-manifest.md`.
  4. Emits `context-updated` event.
- If `expectedRevision` does **not** match:
  1. The existing document in SQLite and on disk is **strictly preserved**.
  2. A row is inserted into `context_conflicts`.
  3. A warning is logged and a `context-updated` event is dispatched.
  4. Knot UI surfaces a prominent conflict banner allowing the user to view the discrepancy and mark it resolved.

---

## 5. Materialized Context Files & Manifest

For ChatGPT to inspect context using Desktop Commander Remote MCP without query latency, Knot automatically materializes context into structured Markdown files on disk whenever changes occur.

### 5.1 Directory Tree
```text
bridge/
└── v1/
    ├── workspace-index.md
    └── projects/
        └── <projectId>/
            ├── context-manifest.md
            ├── context/
            │   ├── ctx-1.md
            │   └── ctx-2.md
            └── sessions/
                └── <sessionId>/
                    ├── context/
                    │   └── ctx-3.md
                    ├── inbox/
                    ├── processed/
                    ├── rejected/
                    ├── outbox/
                    └── conversation.md
```

### 5.2 Context File Header Format
Each materialized context file contains machine-readable metadata in an HTML comment followed by formatted markdown:
```markdown
<!-- KNOT_CONTEXT_V1
{
  "id": "ctx-1",
  "projectId": "p-1",
  "sessionId": null,
  "scope": "project",
  "category": "architecture_decisions",
  "title": "Database Architecture",
  "revision": 2,
  "contentHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "author": "chatgpt",
  "provenance": "chatgpt-authored",
  "requiresVerification": false,
  "updatedAt": "2026-11-25T03:30:00.000Z"
}
-->
# Database Architecture
...
```

### 5.3 Deterministic Context Manifest (`context-manifest.md`)
Knot atomically writes `context-manifest.md` in the project bridge folder. It provides a quick reference index for ChatGPT on startup:
```markdown
# Knot Context Manifest: Knot Desktop Workspace

**Project ID:** `p-1`
**Last Updated:** 2026-11-25T03:30:00.000Z
**Active Documents:** 3

---

## Project Context
- [Database Architecture](context/ctx-1.md) (`architecture_decisions`, Rev 2)
- [Coding Standards](context/ctx-2.md) (`coding_standards`, Rev 1)

## Session Context
- [Session 1 Handoff Note](sessions/s-1/context/ctx-3.md) (`session_handoff`, Rev 1)
```

---

## 6. Task Contract Context Injection

When ChatGPT assigns a task to Antigravity via `task_assignment`, it can attach relevant context documents by reference:

```markdown
---
id: "770e8400-e29b-41d4-a716-446655440002"
protocol: "v1"
projectId: "p-1"
sessionId: "s-1"
sender: "chatgpt"
recipient: "knot"
type: "task_assignment"
createdAt: "2026-11-25T03:40:00.000Z"
metadata:
  title: "Implement User Preferences Repository"
  priority: "high"
  contextReferences:
    - id: "ctx-1"
      revision: 2
    - id: "ctx-2"
---
# Implement User Preferences Repository
Implement SQLite persistence for user settings adhering to our architecture decisions.
```

### 6.1 Injection Rules & Isolation Boundary
1. **Validation**: Knot's `TaskDispatcher` resolves each reference against SQLite:
   - Verifies the document belongs to the active project (`project_id == task.project_id`).
   - Verifies the document is active (`is_archived == 0`).
   - If a revision number is specified, fetches that exact historical snapshot; otherwise fetches the current revision.
2. **Read-Only Injection**: Injected context is formatted in the task contract under:
   `## Attached Project & Session Context (Read-Only)`
3. **Strict Boundaries**:
   - Documents NOT referenced by ChatGPT are never injected.
   - Antigravity cannot modify or create context documents.
   - Cross-project context retrieval is blocked.

---

## 7. Context Vault User Interface

The Knot Desktop workspace includes a dedicated Context Vault Panel rendered with Knot's strict 5-color palette:
- `#090B0D`: Workspace background
- `#092634`: Surface background
- `#004E72`: Accent blue
- `#FF6E42`: Action coral / warning
- `#F9F9F9`: Text and high contrast foreground

### Key UI Features:
1. **View Switcher**: Toggle between **Conversation** and **Context Vault** in the collaboration workspace.
2. **Active Handoff Card**: Highlights the current session's handoff notes with verification badges.
3. **Conflict Banner**: Alert banner displaying unresolved concurrency conflicts with a direct "Mark Resolved" action.
4. **Sidebar Document Browser**:
   - Scope filters (All, Project, Session).
   - Category filtering dropdown.
   - Real-time text search.
   - Show/hide archived documents toggle.
5. **Document Detail View**:
   - **Content Tab**: Rendered Markdown viewer with metadata chips (Author, Provenance, Revision, Content Hash, Verification flag).
   - **History Tab**: Revision timeline listing every historical change with author, timestamp, and change summary.
   - **Diff Tab**: Line-by-line unified diff comparison against previous revisions powered by `diffLines`.
6. **User Modals**:
   - **Create Document Modal**: Form for creating manual project or session context.
   - **Edit Document Modal**: Concurrency-safe editing interface requiring a change summary.
   - **Archive Confirmation Modal**: Explicit safety confirmation modal before soft-deleting any document.
