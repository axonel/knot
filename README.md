# Knot

> **Where AI agents work together.**

![Knot Logo](public/knot-logo.svg)

**Knot** (repository `axonel/knot`) is a desktop developer environment designed for autonomous AI agent collaboration. It provides unified orchestration, process management, and communication mesh for independent AI agents to share context, inspect files, and execute commands safely.

---

## 🎨 Visual Identity & Design System

Knot features an original geometric mark symbolizing two independent agents collaborating across an intertwined, real-time connection knot, rendered in vivid brand orange (`#FE6102`).

The application strictly enforces the Blackout / Signal developer tool design system:

| Role | Color | Hex Code | Intended Usage |
|---|---|---|---|
| **Brand Mark** | **Vivid Orange** | `#FE6102` | Interlocking Knot brand mark, master icons, and favicon |
| **Canvas** | **Solid Black** | `#000000` | Main application background, canvas, and root surfaces |
| **Panels** | **Blackout Charcoal** | `#1B1D1F` | Main cards, sidebar, navigation, toolbars, and containers |
| **Surfaces** | **Elevated Dark** | `#292C2F` | Elevated cards, input fields, badges, dividers, and borders |
| **Primary Text** | **Off-White** | `#F0F0ED` | Primary headers, values, active states, and labels |
| **Secondary Text** | **Muted Silver** | `#A5A5A0` | Secondary copy, metadata, timestamps, and subtitles |
| **Signal Accent** | **Signal Red** | `#E05252` | Status indicators, active agent pulses, and critical actions |

---

## 🚀 Desktop Commander Process Manager

Starting Desktop Commander Remote previously required running manual terminal commands:

```bash
npx @wonderwhy-er/desktop-commander@latest remote
```

Knot replaces this manual command with a fully managed, UI-based process controller built directly into the desktop workspace.

### Key Capabilities

- **Managed Process Execution**: Launches the exact `npx @wonderwhy-er/desktop-commander@latest remote` command as an isolated child process directly from the trusted main process.
- **Accurate Real-Time Lifecycle States**:
  - `Stopped`: Process is inactive and resources are released.
  - `Starting`: Process is spawning, verifying startup integrity and readiness.
  - `Running`: Process is active, alive, and communicating.
  - `Stopping`: Graceful shutdown signal has been dispatched.
  - `Error`: Startup failure or unexpected exit occurred with diagnostic telemetry.
- **Remote Connection Verification**:
  - Explicitly distinguishes between process-level execution and verified remote connectivity (`Unverified`, `Pairing Required`, or `Remote Connected`).
  - Detects remote broker connection and device pairing requirements from process telemetry output rather than assuming connection merely because the child process is alive.
- **Graceful Termination & Fallback**:
  - Sends `SIGINT` (with fallback to `SIGTERM`) to permit Desktop Commander to revoke MQTT sessions cleanly.
  - Automatically escalates to `SIGKILL` only if the process fails to terminate within the grace timeout.
- **Duplicate Launch Prevention**: Guaranteed single-instance process execution.
- **Targeted Process Management**: Strictly kills only the managed child process reference by PID; never executes broad `pkill` or arbitrary shell termination.
- **Automatic Lifecycle Cleanup**: Registers application shutdown hooks (`before-quit`) to cleanly terminate active child processes, ensuring no orphaned processes remain upon restart or exit.
- **Log Sanitization & Secret Redaction**: Diagnostic logs are scrubbed in real-time to redact JWT tokens, bearer headers, MQTT credentials, passwords, and private keys before appearing in the UI.
- **Diagnostic Console**: Collapsible, searchable log monitor with log-level filtering (`stdout`, `stderr`, `system`), auto-scroll locking, clipboard export, and log clearing.

---

## 📋 Prerequisites

- **Node.js**: `v18.0.0` or higher (tested on Node v20+ and v26+)
- **npm**: `v9.0.0` or higher
- **Operating System**: Linux (X11 / Wayland), macOS, or Windows

---

## 📦 Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/axonel/knot.git
cd knot
npm install
```

---

## 🛠️ Development & Building

### Type Checking
Validate TypeScript types across main, preload, renderer, and test suites:
```bash
npm run typecheck
```

### Linting
Run ESLint to check for code quality and adherence:
```bash
npm run lint
```

### Running Tests
Run the comprehensive test suite with Vitest:
```bash
npm test
```

### Local Development
Launch the Electron desktop application with Vite Hot Module Replacement (HMR):
```bash
npm run dev
```

### Production Build
Compile renderer, Electron main process, and preload scripts:
```bash
npm run build
```

### Starting the Compiled Application
Launch the compiled desktop application in Electron:
```bash
npm start
```

---

## 🐧 Linux Desktop Integration & Packaging

Knot is fully integrated into the Linux desktop environment (tested on Arch Linux / Omarchy / Hyprland / Wayland).

### Packaging
Knot uses `electron-builder` to produce standalone Linux distributions:
- **Build AppImage and Unpacked directory**:
  ```bash
  npm run pack
  ```
- **Build AppImage only**:
  ```bash
  npm run package:appimage
  ```
- **Build Unpacked Linux binary**:
  ```bash
  npm run package:dir
  ```

Packaged artifacts are placed into the `release/` directory:
- `release/Knot-1.0.0.AppImage`
- `release/linux-unpacked/knot`

### Installing to Application Launcher
To make Knot immediately discoverable in your desktop environment's application launcher (such as Omarchy launcher / wofi / rofi / GNOME / KDE):

```bash
npm run install:desktop
```

This automated installation:
1. Installs `knot.desktop` to `~/.local/share/applications/` with standard XDG categories (`Development;`), keywords, and WMClass.
2. Installs high-resolution application icons (16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512, and scalable SVG) into `~/.local/share/icons/hicolor/`.
3. Creates an executable launcher wrapper at `~/.local/bin/knot`.
4. Runs `desktop-file-validate`, `update-desktop-database`, and `gtk-update-icon-cache`.

You can then launch Knot from the application launcher or directly from the terminal with:
```bash
knot
```

### Uninstalling Desktop Launcher Integration
To cleanly remove the desktop launcher entry, icons, and executable wrapper:
```bash
npm run uninstall:desktop
```


---

## 🗄️ Persistent Database & Project/Session Management

Knot includes an integrated local persistent database layer built with **SQLite** (`node:sqlite` via `DatabaseSync`), avoiding external C++ ABI incompatibilities and ensuring zero-overhead integration with Electron.

### Database Location & Configuration

- **Storage Location**: `app.getPath('userData')/knot.sqlite` (e.g., `~/.config/knot/knot.sqlite` on Linux).
- **Persistent by Default**: Automatically created and migrated on startup, persisting across application restarts. The database is never stored inside the repository or `app.asar`.
- **WAL Journaling**: Configured with `PRAGMA journal_mode = WAL;` for concurrent reading and writing.
- **Foreign Key Enforcement**: Configured with `PRAGMA foreign_keys = ON;` ensuring strict referential integrity across projects, sessions, messages, tasks, and events.
- **Busy Timeout**: Configured with `PRAGMA busy_timeout = 5000;` to handle transient lock contentions.
- **Atomic Operations & Rollback**: All multi-step operations and schema migrations execute within transactional boundaries (`withTransaction`).
- **Graceful Shutdown**: Electron application shutdown hooks (`before-quit`) close the database cleanly.

### Versioned Schema & Tables

The schema is maintained by an idempotent, transactional migration engine (`schema_migrations` table):

| Table | Primary Key | Key Fields & Constraints | Purpose |
|---|---|---|---|
| `projects` | `id` (UUID) | `name`, `repository_path`, `repository_remote`, `created_at`, `updated_at`, `archived_at` | Top-level project repositories |
| `sessions` | `id` (UUID) | `project_id` (FK), `title`, `status`, `last_activity_at`, `started_at`, `ended_at`, `metadata_json` | Independent agent coordination sessions |
| `messages` | `id` (UUID) | `session_id` (FK), `sequence` (UNIQUE per session), `sender`, `recipient`, `message_type`, `content_markdown` | Chronological agent conversation history |
| `tasks` | `id` (UUID) | `session_id` (FK), `title`, `description`, `assigned_to`, `status`, `payload_json` | Agent tasks and sub-operations |
| `events` | `id` (UUID) | `session_id` (FK), `task_id` (FK NULL), `event_type`, `actor`, `data_json` | Audit trail and telemetry events |

### Monotonic Sequence Numbering

Messages in a session are guaranteed atomic, monotonically increasing sequence numbers (`1, 2, 3...`) enforced via atomic transactions (`SELECT COALESCE(MAX(sequence), 0) + 1`), ensuring exact ordering without sequence collisions.

### Session Lifecycle State Machine

Session status transitions follow a strict lifecycle state machine:
- `active` ➔ `paused`, `completed`, `archived`
- `paused` ➔ `active`, `completed`, `archived`
- `completed` ➔ `active`, `archived` (cannot transition directly to `paused`)
- `archived` ➔ `active` (cannot transition directly to `paused` or `completed`)

Invalid transitions are rejected immediately with descriptive errors.

---

## 🌉 ChatGPT ↔ Knot Filesystem Communication Bridge

Knot provides a real, bidirectional filesystem communication bridge between ChatGPT and the Knot developer desktop environment using the active Desktop Commander Remote MCP connection.

This enables ChatGPT to collaborate with Knot without requiring OpenAI API keys, browser automation, DOM scraping, or custom AI models.

### Shared Workspace Architecture

All bridge interactions occur in a dedicated, isolated directory located inside Electron's persistent `userData` path:

```text
app.getPath('userData')/bridge/v1/
├── bridge-instructions.md          # Comprehensive instruction manual for ChatGPT
├── README.md                       # Workspace overview and protocol specification
└── projects/
    └── <project-id>/
        └── sessions/
            └── <session-id>/
                ├── inbox/
                │   └── chatgpt/    # ChatGPT writes inbound messages here
                ├── processed/
                │   └── chatgpt/    # Validated inbound messages archived here
                ├── rejected/
                │   └── chatgpt/    # Malformed messages with .error.json diagnostics
                ├── outbox/
                │   └── knot/       # Knot writes outbound messages here
                └── conversation.md # Canonical single-writer conversation view
```

### Protocol v1 Specification

Every message written across the bridge is a valid Markdown document beginning with an embedded protocol metadata block:

```markdown
<!-- KNOT_MESSAGE_V1
{
  "id": "c7a8b4e2-63f2-45e0-9bc6-e2652b31f792",
  "protocol": "v1",
  "projectId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "sessionId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "sender": "chatgpt",
  "recipient": "knot",
  "type": "message",
  "challengeId": "knot-challenge-98765432",
  "createdAt": "2026-11-24T12:00:00.000Z",
  "metadata": {}
}
-->

# Message Subject or Summary

Markdown message body content exchanged between ChatGPT and Knot.
```

- **Protocol Versions**: Strictly `v1`. Unsupported protocols are rejected.
- **Message Types**:
  - `message`: Standard message exchange and collaboration.
  - `handshake_challenge`: Connection challenge issued by Knot to verify the link.
  - `handshake_response`: Signed verification reply generated by ChatGPT.
- **Size Limit**: Enforces a strict 256 KB maximum file size to protect against unbounded storage consumption.
- **UUID Validation**: All identifiers (`id`, `projectId`, `sessionId`) must conform strictly to RFC 4122 UUID format.

### Inbound & Outbound Communication Flows

1. **Inbound Flow (ChatGPT ➔ Knot)**:
   - ChatGPT invokes Desktop Commander's `write_file` MCP tool to place a markdown file into `inbox/chatgpt/<id>.md`.
   - Knot's `InboxWatcher` detects the file via `chokidar` with write-stability detection (`awaitWriteFinish`).
   - If valid, Knot idempotently persists the message in SQLite (`messages` and `events`), bumps session activity, updates `conversation.md`, and moves the file to `processed/chatgpt/<id>.md`.
   - If invalid, the malformed file is quarantined into `rejected/chatgpt/<id>.md` along with a diagnostic `<id>.error.json` recording the validation error code and reason.
2. **Outbound Flow (Knot ➔ ChatGPT)**:
   - Knot persists the message in SQLite and atomically creates `<id>.md` in `outbox/knot/` using a `.tmp` file rename.
   - Knot regenerates the canonical `conversation.md` file (Knot operates as the exclusive single writer).
   - ChatGPT reads outbox messages or the full conversation snapshot using Desktop Commander's `read_file` or `read_multiple_files` MCP tools.

### Handshake Connection Verification

To verify that ChatGPT and Desktop Commander Remote can successfully read and write to the filesystem bridge:
1. Navigate to the **ChatGPT Bridge** tab in Knot.
2. Click **Test Connection** to issue a challenge (`handshake-<challengeId>.md`) into the session outbox.
3. Copy the generated prompt and paste it into ChatGPT.
4. ChatGPT reads the outbox challenge via Desktop Commander MCP and writes a matching `handshake_response` to the session inbox.
5. Knot automatically validates the challenge ID, verifies non-replay status and 10-minute expiration window, transitions to **Verified & Active**, and updates telemetry.

---

## 🤖 Google Antigravity CLI Integration

Knot integrates the official Google Antigravity CLI (`agy`) directly as a persistent, multi-turn AI coding partner alongside Desktop Commander and ChatGPT.

### Key Capabilities

- **Automatic Discovery & Telemetry**:
  - Automatically resolves `agy` across user custom paths, system `PATH`, and standard Linux user locations (`~/.local/bin/agy`, `/usr/local/bin/agy`, `/usr/bin/agy`, etc.).
  - Extracts CLI version (e.g. `1.5.14`) and capability flags (`stream-json`, `--conversation`, `--mode`).
  - Evaluates authentication readiness (`Not Installed`, `Installed`, `Authentication Required`, `Ready`, `Error`).
  - Provides a safe copyable terminal command (`agy`) when authentication is required—never asks for passwords or scrapes credentials.
- **Persistent Streaming Protocol (`stream-json`)**:
  - Launches `agy --input-format stream-json --output-format stream-json` in the background with `cwd` set strictly to the active project's repository path.
  - Maintains a long-running, interactive process per Knot session; sends user prompts via NDJSON stdin lines (`{"event":"user","message":{"content":"..."}}\n`).
  - Incremental NDJSON stream parser handles chunk boundaries and maps live events (`init`, `step_update`, `result`).
  - Displays real-time streaming text deltas and live tool execution cards (`tool_started`, `tool_completed`, `tool_denied`).
- **Session Isolation & Lifecycle Management**:
  - Enforces strict working directory isolation: `agy` runs directly in the selected project's repository path. Knot never falls back to its own repository.
  - Single managed agent process per Knot session.
  - Clean lifecycle management: Start, Stop (graceful `stdin.end()` ➔ `SIGTERM` ➔ `SIGKILL`), and Interrupt (`SIGINT`).
  - Tracks process PID, conversation ID, and exit codes.
  - Registers application shutdown cleanup (`before-quit`) to terminate all active agent child processes without leaving orphans.
- **Conversation Persistence**:
  - Tracks agent session metadata, conversation IDs, and execution modes in the SQLite `agent_sessions` table (`002-agent-sessions.ts`).
  - Resumes previous sessions seamlessly via `--conversation <id>`.
  - Appends user prompts and Antigravity final responses into SQLite `messages` and audit logs in `events`.
- **Bridge Outbox Publication**:
  - When Antigravity completes a turn, Knot automatically publishes the response to ChatGPT's filesystem outbox (`outbox/knot/<id>.md`) stamped with `sender: "antigravity"`.
  - Updates canonical `conversation.md` snapshot so ChatGPT can immediately observe Antigravity's thoughts, suggestions, and tool results.
- **Strict Security Invariants**:
  - **Auto-Approve Disabled**: Knot **NEVER** passes `--dangerously-skip-permissions` or `--always-proceed`.
  - Detects tool permission rejections and soft denials, presenting clear status notifications in the UI.
  - Strictly isolates execution with `shell: false` and array arguments.

---

## 🧠 ChatGPT-Led Multi-Agent Orchestration & Task Handoff Engine

Knot coordinates a collaborative multi-agent development workflow between **ChatGPT** (The Orchestrator) and **Google Antigravity** (The Executor), with Knot operating as the central desktop runtime, safety policy engine, and persistent task queue.

For complete architectural details, protocol specifications, diagrams, and workflow lifecycle, refer to:
👉 **[Orchestration Architecture Guide](docs/orchestration-architecture.md)**
👉 **[ChatGPT Bridge Setup & Protocol Guide](docs/chatgpt-bridge-setup.md)**

### Architecture Highlights

- **The 3-Participant Hierarchy**:
  - **ChatGPT (The Orchestrator)**: Sole planner and decision maker. Inspects local source repositories via Desktop Commander Remote MCP, reviews GitHub PRs and issues, assigns tasks, and verifies results.
  - **Antigravity (The Executor)**: Dedicated implementation worker. Executes assigned tasks strictly in the project repository, modifies files, runs test suites, and returns structured execution reports.
  - **Knot (The Workspace & Runtime)**: Ingests tasks via filesystem mailbox, enforces safety execution policies, manages persistent FIFO task queues, streams execution events, and publishes deterministic results.
- **Desktop Commander Permissions**:
  - Requires `allowedDirectories` configuration covering both the Knot Bridge Root (`bridge/v1`) and the target project repository path.
  - Instant one-click clipboard copy from the **Directory Access Diagnostic** chip in Knot.
- **Bridge Protocols**:
  - `workspace-index.md`: Real-time registry of all active projects, sessions, workers, and queued tasks.
  - `task_assignment`: Structured Markdown tasks with title, priority (`low`, `normal`, `high`, `urgent`), execution mode, and acceptance criteria checklists.
  - `activity`: Background reporting for research, repository inspection, code review, and planning without polluting the canonical conversation transcript.
  - `task_result`: Deterministic results published to `outbox/knot/task-<taskId>-result.md` and recorded in `conversation.md`.
- **Persistent Task Queue & Safety Policies**:
  - Concurrency limited to 1 active task per session (FIFO priority order).
  - **Safety Policy**: Safe development tasks are auto-approved; sensitive operations (e.g. `git push`, production deploy, destructive file deletions) are held in an `awaiting_approval` state requiring explicit user confirmation in the UI.
  - User controls: **Approve & Dispatch**, **Reject**, **Cancel Task**, and **Retry**.
  - Startup recovery restores in-flight tasks cleanly across application restarts.
- **3-Panel Multi-Project Collaboration Workspace**:
  - Mini Workspace Tree Sidebar with live task badges.
  - Left Panel: ChatGPT-Reported Activity feed with category filtering chips.
  - Center Panel: Canonical Shared Conversation stream with role-colored participant badges and copy actions.
  - Right Panel: Antigravity Execution with worker status, active task card, acceptance criteria checklist, and live stream console.

---

## 🔍 Task-Linked Git Change Inspection & Diff Viewer

Knot includes a read-only Git change inspection service and modal diff viewer that lets users review the exact code modifications produced by Antigravity during task execution.

### Key Capabilities

- **Task-Boundary Snapshots**: Automatically captures the repository baseline at task dispatch (`HEAD` commit, branch, working-tree status) and verifies completion state upon finish (committed hash vs. uncommitted working-tree edits).
- **Attribution Confidence & Provenance**:
  - Calculates confidence ratings (`High`, `Medium`, `Attribution Uncertain`) based on whether the working tree was clean prior to dispatch and whether changes are verified to the task.
  - Labels files with explicit provenance: `Git-derived`, `Antigravity-reported`, or `Attribution uncertain`.
- **Repository Drift Detection**: Warns developers if the repository HEAD or working tree has moved since the task completed, preventing misleading diff assumptions.
- **Strictly Read-Only & Safe**:
  - Whitelist of read-only Git operations: `rev-parse`, `status --porcelain=v1`, `diff`, `log`, `cat-file`.
  - Zero mutation risk: `git add`, `commit`, `push`, `pull`, `checkout`, `reset`, `clean`, `rebase` are rejected at the service layer.
  - Invoked via `spawn` with array arguments, `shell: false`, 10-second execution timeouts, and 5 MB buffer caps.
  - Repository containment checks and symlink traversal prevention.
- **Sensitive File & Binary Omission Policy**:
  - Suppresses diff display for credentials, private keys, and environment files (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `credentials.json`, `secrets.*`). Displays: *"Diff omitted: File may contain sensitive credentials or secrets."*
  - Suppresses binary files (*"Diff omitted: Binary file detected."*) and files exceeding 250 KB (*"Diff omitted: File exceeds display threshold."*).
- **Interactive UI Diff Viewer**:
  - Strictly adheres to Knot's Blackout / Signal design system.
  - Searchable file sidebar with filter chips (All, Added, Modified, Deleted, Uncertain).
  - Split line numbers with syntax-highlighted hunk lines and one-click commit hash copying.

---

## 📚 Project Context Vault & Session Continuity

Knot features a persistent, versioned context-management engine that ensures ChatGPT maintains continuous awareness of architecture guidelines, technical constraints, coding standards, and session handoffs across multiple working sessions.

For complete documentation, see 👉 **[Project Context Vault Specification](docs/context-management.md)**.

### Key Capabilities

- **Two Distinct Scopes**:
  - **Project Context (`scope: "project"`)**: Durable records (ADRs, constraints, domain models, coding standards) that survive individual sessions.
  - **Session Context (`scope: "session"`)**: Ephemeral handoff notes and next steps tied to the active session.
- **Optimistic Concurrency Control (OCC)**:
  - Updates require matching `expectedRevision` numbers.
  - Rejects stale writes without overwriting current data.
  - Records conflict details in SQLite (`context_conflicts`) and alerts users with interactive conflict resolution banners.
- **Materialized Markdown & Atomic Manifest**:
  - Automatically writes and updates `context-manifest.md` and individual markdown documents (`projects/<projectId>/context/`) on disk.
  - Enables zero-latency inspection for ChatGPT via Desktop Commander Remote MCP.
- **Task Contract Context Injection**:
  - ChatGPT references context document IDs and revisions in `task_assignment` frontmatter (`metadata.contextReferences`).
  - Knot validates project ownership and non-archived status, then injects read-only context into the task prompt for Antigravity under `## Attached Project & Session Context (Read-Only)`.
  - Unreferenced documents are never injected; Antigravity cannot modify context vault records.
- **Interactive UI Context Vault Panel**:
  - Strictly adheres to Knot's Blackout / Signal design system.
  - Active session handoff note card and conflict resolution banner.
  - Category filters, real-time search, and archive toggle.
  - 3-tab document view: rendered Markdown Content, Revision Timeline (History), and line-by-line Diff comparison (`diffLines`).
  - User modals: Create, Edit with required change summary, and explicit Archive confirmation.

---

## ⏱️ Unified Execution Timeline & Audit Trail

Knot provides a persistent, chronological, project-aware activity and execution timeline that reconstructs the entire multi-agent lifecycle across ChatGPT, Antigravity, Knot, and Git.

For full architectural details, see 👉 **[Unified Execution Timeline & Audit Trail Specification](docs/execution-timeline.md)**.

### Key Capabilities

- **Strict Attribution & Provenance Badges**:
  - Distinguishes reported activities from independently verified observations:
    - `chatgpt_reported`: Research, inspection, planning, or verification reported by ChatGPT.
    - `antigravity_reported`: Step updates, tool executions, and turn completions reported by Antigravity CLI.
    - `knot_observed`: Process lifecycles, IPC events, safety policy evaluations, and outbox publications observed by Knot runtime.
    - `git_verified`: Working-tree diffs, baseline statuses, and commit hashes verified directly via local Git.
    - `user_recorded`: Human approval, cancellation, retry, or context actions.
- **Three Timeline Scopes**:
  - **Project Timeline**: Complete chronological audit trail spanning all sessions, tasks, and context revisions for a project.
  - **Session Timeline**: Real-time event stream focused on the active session.
  - **Task Execution Trace**: Deep end-to-end breakdown of a single task partitioned across **7 Canonical Lifecycle Stages**:
    1. `assignment`: ChatGPT task formulation and acceptance criteria.
    2. `queue`: Ingestion, FIFO priority queueing, and dispatch locks.
    3. `approval`: Safety policy evaluation, approval requests, grants, or rejections.
    4. `execution`: Antigravity process startup, tool streaming, and results.
    5. `git`: Pre-execution baseline check, working-tree changes, and verified commit hashes.
    6. `completion`: Structured result outbox publication and completion status.
    7. `verification`: Subsequent review and verification recorded by ChatGPT.
- **Trace Export & Secret Redaction**:
  - Export full task execution traces to clipboard or disk as human-readable **Markdown (`.md`)** or machine-readable **JSON (`.json`)**.
  - Automatically scrubs bearer tokens, API keys, passwords, and private keys via Knot's centralized secret sanitizer before export.
- **Integrated UI Inspection Panel**:
  - Full-featured `UnifiedTimelinePanel` in Knot's central workspace tab switcher.
  - Real-time search, actor filters (`ChatGPT`, `Antigravity`, `Knot`, `User`, `Git`), and category filters (`Tasks`, `Execution`, `Approvals`, `Git`, `Context`, `Verification`, `Errors`).
  - One-click navigation to inspect Git diffs or jump to related context vault documents.
  - Strictly follows Knot's Blackout / Signal design system.

---

## 🔒 Security Architecture & Threat Hardening

Knot is designed with defense-in-depth principles across its Electron IPC boundary, filesystem bridge, task dispatcher, process runner, and SQLite database:

1. **Filesystem Bridge Trust Model & Limitations**:
   - **Non-Authentication Reality**: The bridge header `sender: chatgpt` is transport-level attribution, **not cryptographic authentication**. Any local process with write permissions to the user's bridge directory can author a message.
   - **Inbox Treated as Untrusted Input**: Incoming files are validated via `fs.lstat` before reading. Symlinks are rejected immediately (`SYMLINK_NOT_ALLOWED`) without following. Non-regular files and files exceeding 256 KB are discarded prior to parsing.
   - **No Shell Execution**: Markdown body content is treated as inert prompt text and never passed to a shell or `eval`.
   - **No Self-Elevation**: Messages cannot elevate their own permissions or toggle trust modes.
2. **User-Controlled Project Trust Policies**:
   - **Approval Required (`approval_required`, Default)**: All tasks—including ordinary safe implementation work—require explicit user approval in the Knot UI prior to Antigravity dispatch.
   - **Trusted Project Mode (`trusted`, Opt-In)**: The user explicitly promotes a project in the Knot UI. Eligible ordinary (`safe`) tasks are automatically dispatched.
   - **Non-Bypassable Sensitive Gates**: Sensitive operations (`git push`, branch/PR merge, package publish, deployment, recursive deletions, credentials access) and ambiguous operations **always require user approval, even in trusted mode**.
3. **Cryptographic Task Content Integrity & Approval Invalidation**:
   - Every task's title, description, and acceptance criteria are hashed with deterministic **SHA-256**.
   - User approval is bound to the exact content hash (`approvedContentHash`).
   - Editing an approved task invalidates prior approval, resetting status to `awaiting_approval`.
   - Retries with materially modified instructions require re-approval before dispatch.
   - At dispatch time, `TaskDispatcher` recalculates and verifies content hashes, preventing task tampering.
4. **Preservation of Antigravity Native Permissions**:
   - Knot **NEVER** passes `--dangerously-skip-permissions` or `--always-proceed`.
   - Never simulates user approval by injecting input into the CLI.
   - Working directories are validated and restricted to the registered project repository root. Path traversal, root `/`, and user home `~` are strictly prohibited.
   - Renderer cannot pass arbitrary executable paths over IPC.
5. **Electron Renderer & IPC Hardening**:
   - `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
   - Strict Content Security Policy (`script-src 'self' 'wasm-unsafe-eval'`).
   - `will-navigate` interception restricts navigation to local dev server or app bundle; external URLs open via system browser (`http`/`https` only).
   - Sender frame validation (`validateIpcSender`) on all privileged IPC channels.
6. **Centralized Secret Redaction & Sanitization**:
   - Multi-layer regex sanitizer redacts AWS credentials, GitHub tokens, GitLab PATs, Slack tokens, OpenAI keys, Gemini keys, PEM/SSH private keys, JWTs, database connection strings, and cookies across logs, events, diffs, and exported traces.
7. **Interactive Security Diagnostics Modal**:
   - Accessible via the workspace header `<ShieldAlert /> Security` button.
   - Real-time display of project trust mode, pending approvals, SHA-256 integrity verification, Antigravity permission safeguards, and bridge transport realities.
   - Adheres strictly to the Knot 5-color developer palette.
8. **Documented Threat Model**:
   - Complete 12-scenario threat model and risk analysis documented in [docs/security-threat-model.md](docs/security-threat-model.md).

---

## ⚠️ Known Limitations

- **Remote Cloud Pairing**: First-time execution of Desktop Commander Remote requires completing device pairing via the browser/terminal prompt provided by `@wonderwhy-er/desktop-commander`.
- **Desktop Commander Scope**: ChatGPT requires Desktop Commander Remote to have read/write access to both the Knot Bridge directory and project repository directory via `allowedDirectories`.

---

## 🛡️ Runtime Reliability, State Reconciliation & Recovery

Knot incorporates a dedicated reliability architecture to guarantee predictability and consistency across crashes, process terminations, and out-of-order filesystem events:

- **Strict State Transition Models**: Formal lifecycle matrix for tasks, bridge watchers, and execution processes. Invalid state jumps throw `assertLegalTaskTransition` and are rejected before execution.
- **At-Most-Once Execution Guarantees**: `claimNextExecutable` utilizes an atomic SQLite Compare-And-Swap (CAS) transaction ensuring concurrent workers or UI triggers never execute the same task twice.
- **Automated Startup Reconciliation**:
  - Automatically identifies in-flight tasks trapped in `running` status across restarts and marks them `interrupted`.
  - Preserves user approval status (`approved`) while requiring an explicit human retry before re-queueing to avoid unconfirmed partial writes.
  - Reconciles orphaned Antigravity process records.
  - Scans for unprocessed inbox messages and ingests them into SQLite.
  - Automatically re-materializes missing task result markdown files in `outbox/knot/`.
- **Context Vault Canonical Authority**:
  - SQLite serves as the absolute canonical authority for all project decisions and technical constraints.
  - Re-materializes missing on-disk context markdown files automatically.
  - Continuously computes SHA-256 hashes to detect external on-disk drift and flags conflicts without silently corrupting or overwriting SQLite data.
- **Bounded Process Termination**: Antigravity child processes receive `stdin.end()` and `SIGTERM` with a 3000ms bounded timeout race before issuing fallback `SIGKILL`.
- **Interactive Reliability Diagnostics View**: Built-in modal in the workspace header displays real-time health across SQLite, filesystem bridge watchers, and task queues, with one-click manual state reconciliation.

---

## 🚦 CI Pipeline, Security Regression & Quality Gates

Knot enforces a multi-layer automated Continuous Integration (CI) pipeline using GitHub Actions to guarantee that every change is statically verified, unit tested, security audited, and package-validated before merging.

For full architectural details, merge criteria, and the PR definition of done, see 👉 **[CI Pipeline & Quality Gates Specification](docs/ci-and-quality-gates.md)**.

### Running Quality Gates Locally

Developers can run all CI quality gates locally before opening a pull request:

```bash
# 1. TypeScript Static Typecheck
npm run typecheck

# 2. ESLint Static Analysis
npm run lint

# 3. Automated Dependency Security Audit
node scripts/audit-dependencies.mjs

# 4. Unit & Security Regression Test Suite
npm test

# 5. Test Suite with Coverage & JUnit XML Generation
npm run test:coverage
npm run test:ci

# 6. Production Bundle Build (Renderer, Main, Preload)
npm run build

# 7. Linux Packaging & Distribution Integrity Gate
npm run pack
node scripts/verify-packaging.mjs
```

### Real Developer-Machine Integration Testing

Local integration scenarios that require host binaries (e.g. real Google Antigravity `agy` CLI binary or local Git user configurations) are separated from headless CI and executed via:

```bash
./scripts/verify-real-integration.sh
```

This verification script inspects host prerequisites, tests CLI detection, runs live smoke tests (`tests/antigravity.smoke.test.ts`), and verifies distribution packaging.



