# Knot

> **Where AI agents work together.**

![Knot Logo](public/knot-logo.svg)

**Knot** (repository `axonel/knot`) is a desktop developer environment designed for autonomous AI agent collaboration. It provides unified orchestration, process management, and communication mesh for independent AI agents to share context, inspect files, and execute commands safely.

---

## 🎨 Visual Identity & Design System

Knot features an original geometric mark symbolizing two independent agents collaborating across an intertwined, real-time connection knot.

The application strictly enforces a focused 5-color developer tool palette:

| Color | Hex Code | Intended Usage |
|---|---|---|
| **White** | `#F9F9F9` | Primary text, key icons, and light surfaces |
| **Blue** | `#004E72` | Primary interactive elements, active navigation states, system highlights |
| **Orange** | `#FF6E42` | Secondary accent, stop/kill actions, warning & error indicators |
| **Navy Blue** | `#092634` | Main application surfaces, cards, sidebar, header |
| **Near-black** | `#090B0D` | Main canvas background, terminal log viewer surfaces |

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
  - Strictly adheres to Knot's 5-color palette (`#F9F9F9`, `#004E72`, `#FF6E42`, `#092634`, `#090B0D`).
  - Searchable file sidebar with filter chips (All, Added, Modified, Deleted, Uncertain).
  - Split line numbers with syntax-highlighted hunk lines and one-click commit hash copying.

---

## 🔒 Security Architecture

1. **Strict Context Isolation**: Renderer runs with `contextIsolation: true` and `nodeIntegration: false`.
2. **Narrowly Scoped Preload Bridge**: Frontend components communicate exclusively via strongly typed Electron IPC (`window.knotApi`). No raw shell execution or direct file system access is exposed to the renderer.
3. **No Shell Interpolation**: Child process execution uses `spawn` with `shell: false` and array arguments, preventing shell injection vulnerabilities.
4. **Credential Protection**: The log sanitizer continuously matches and redacts authentication secrets, JWTs, and URLs with embedded credentials.
5. **Parameterized SQL Queries**: All database queries use parameterized prepared statements (`?`), eliminating SQL injection risks.
6. **Filesystem Bridge Isolation**: Bridge folders are constrained strictly within `app.getPath('userData')/bridge/v1/`. All incoming files are validated for 256 KB size limits, valid JSON headers, and scope UUIDs before SQLite persistence.
7. **No Auto-Approvals for Dangerous Operations**: Antigravity is executed with standard permission requirements; automated execution never bypasses tool confirmation policies. Knot **NEVER** passes `--dangerously-skip-permissions` or `--always-proceed`.
8. **Sensitive Task Gating**: Potentially destructive commands and operations are held behind an explicit human approval gate.
9. **Read-Only Git Inspection Invariant**: The Git inspection engine executes whitelisted read-only Git commands exclusively (`status`, `diff`, `log`, `rev-parse`, `cat-file`), rejecting all state-mutating operations. Paths are constrained to repository bounds with symlink escape validation, argument arrays with `shell: false`, and automatic suppression of sensitive credential files and binary payloads.

---

## ⚠️ Known Limitations

- **Remote Cloud Pairing**: First-time execution of Desktop Commander Remote requires completing device pairing via the browser/terminal prompt provided by `@wonderwhy-er/desktop-commander`.
- **Desktop Commander Scope**: ChatGPT requires Desktop Commander Remote to have read/write access to both the Knot Bridge directory and project repository directory via `allowedDirectories`.


