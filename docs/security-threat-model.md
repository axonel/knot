# Knot Security Threat Model & Permission Architecture

## Overview

Knot is a local desktop application built with Electron, React, SQLite, and Node.js. It facilitates asynchronous human-in-the-loop collaboration between an orchestrator agent (**ChatGPT** communicating over the filesystem via Desktop Commander Remote MCP), a human developer (using the Knot desktop UI), and an execution agent (**Google Antigravity CLI**).

This document establishes the official threat model, security boundaries, trust assumptions, permissions architecture, and residual risks for Knot.

---

## 1. Assets and System Components

### Critical Assets
1. **Registered Project Repositories**: Source code, git history, configuration files, and secrets in project workspaces.
2. **Local Operating System & User Filesystem**: Personal files, SSH keys (`~/.ssh`), credentials (`~/.aws`, `~/.config`), and system configurations outside registered project roots.
3. **Knot SQLite Database & State**: `knot.sqlite`, WAL journals, task histories, context documents, and immutable event audit logs.
4. **Task Pipeline & Execution Queue**: In-flight task states, approvals, dispatcher control, and Antigravity child processes.
5. **Bridge Mailbox & Communication Channels**: Inbound/outbound message directories, handshake tokens, and context exchange files.

---

## 2. Actors and Trust Levels

| Actor | Description | Trust Level | Capabilities / Authority |
|---|---|---|---|
| **Local User** | The developer running Knot on their workstation. | **Full User Trust** | Sole authority over approvals, project creation, directory selection, trust policy toggles, and process lifecycle. |
| **Knot Main Process** | Privileged Node.js Electron core. | **Trusted Local Controller** | Manages SQLite, file watchers, process spawning (`git`, `antigravity`, `desktop-commander`), IPC handlers, and policy enforcement. |
| **Knot Renderer** | React/TypeScript UI in Electron Chromium. | **Untrusted / Sandboxed** | Communicates strictly via narrow, validated `window.knotApi` preload bridge; cannot execute Node.js APIs or arbitrary shell commands. |
| **ChatGPT (via Desktop Commander)** | Remote orchestrator writing to local filesystem bridge. | **Untrusted Input Origin** | Can propose activities, assign tasks, request status, and write context. **Never** has authority to bypass approvals or alter security policies. |
| **Antigravity CLI** | Autonomous agent executing code changes in project repositories. | **Constrained Local Worker** | Spanned strictly within the registered repository directory; native permission prompts and tool sandbox remain active. |
| **Local Co-Tenant Processes** | Other programs executing under the same OS user account. | **Untrusted / Hostile** | Can read/write unprivileged user files. Knot defends against passive tampering via validation, but cannot defend against full account takeover. |
| **Untrusted Repository Content** | Clone/worktree contents (e.g. malicious README, poisoned commit messages, hidden scripts). | **Untrusted Data** | Rendered as escaped text without script execution; git commands are strictly parameterized and read-only. |

---

## 3. Trust Boundaries

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Local User Workstation                          │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │   ChatGPT / MCP       │             │   Antigravity CLI Worker   │  │
│  │ (Remote Orchestrator) │             │     (Local Process)        │  │
│  └──────────┬────────────┘             └─────────────▲──────────────┘  │
│             │ writes files                           │ spawns & streams│
│             ▼                                        │                 │
│      [Bridge Root]                             [Task Dispatcher]       │
│      (UNTRUSTED BOUNDARY)                            │                 │
│             │                                        │                 │
│  ═══════════╪════════════════════════════════════════╪═══════════════  │
│             ▼                                        │                 │
│  ┌───────────────────────────────────────────────────┴──────────────┐  │
│  │                        Knot Main Process                         │  │
│  │  - Path Canonicalizer & Symlink Guard                            │  │
│  │  - Strict JSON/UUID Protocol Validator                           │  │
│  │  - Task Policy Engine (Safe vs Sensitive vs Ambiguous)           │  │
│  │  - User Approval Gate & Content Hash Verification                │  │
│  │  - SQLite Database (0600 POSIX File Permissions)                 │  │
│  │  - Read-Only Git Inspection Service                              │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
│                              │ Context Isolation / Preload API          │
│                              ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Knot Sandboxed Renderer                       │  │
│  │  - Context Isolation: true, Node Integration: false               │  │
│  │  - Navigation Blocked, Popup Windows Denied                      │  │
│  │  - Strict Content Security Policy (CSP)                          │  │
│  │  - React Escaped Text Rendering (No script evaluation)            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Bridge Authentication Model & Limitations

### The Non-Authentication Reality
The filesystem bridge accepts markdown files with metadata headers:
```json
{
  "sender": "chatgpt",
  "recipient": "knot",
  "type": "task_assignment"
}
```
**A `sender: chatgpt` field is NOT cryptographic authentication.**

Any process running under the user's OS account with write access to the bridge directory can write a file claiming `sender: chatgpt`. The initial handshake verifies that Desktop Commander can reach the mailbox directory; it does **not** prove cryptographic identity of subsequent file writers.

### Bridge Hardening Measures
1. **Inbox Files Treated as Untrusted Input**: Every file is subjected to strict structural validation.
2. **Symlink and Path Traversal Defense**:
   - `fs.lstat` is executed before reading. Symbolic links are immediately rejected (`SYMLINK_NOT_ALLOWED`) without following.
   - Non-regular files (pipes, sockets, block devices) are rejected.
   - Canonicalized paths must remain strictly within the session's `inbox/chatgpt/` folder.
3. **Payload Limits**:
   - Size limit of 256 KB is checked at `lstat` time prior to memory allocation.
4. **Protocol Validation**:
   - Strict UUID regex checks for `id`, `projectId`, and `sessionId`.
   - Protocol version must match `v1`.
   - Enforce scope match between directory path and header metadata.
5. **No Shell Execution**:
   - Markdown body is treated as inert prompt text. It is never piped directly to `bash`, `sh`, or `eval`.
6. **No Privilege Self-Elevation**:
   - Metadata flags such as `trusted: true` or `bypassApproval: true` are ignored.

---

## 5. Task Authorization and Trust Policies

Knot establishes a three-tier task classification model:

### Task Classification
1. **Ordinary Project Work (`safe`)**:
   - Routine development actions: editing code inside repo, writing unit tests, running project test suites, updating documentation, code formatting.
2. **Sensitive Operations (`sensitive`)**:
   - Operations with external or irreversible side effects:
     - `git push` or remote publication.
     - Merging branches or pull requests.
     - Deployments and production release commands (`npm publish`, `cargo publish`).
     - Destructive file removals (`rm -rf`, recursive deletions).
     - Accessing `.env`, tokens, passwords, credentials, or private keys.
     - Altering system configurations or project trust settings.
3. **Ambiguous or Unknown Operations (`ambiguous`)**:
   - Any task that cannot be deterministically verified as ordinary project work.
   - **Fail-Safe Principle**: Unknown tasks are treated as requiring explicit user approval.

### Project Trust Modes
- **Approval Required (Default)**:
  - Every task—regardless of whether it is ordinary, sensitive, or ambiguous—requires explicit human approval in the Knot UI before dispatch.
- **Trusted Project Mode**:
  - The user explicitly promotes a project to trusted status in the Knot UI.
  - Eligible ordinary (`safe`) tasks are automatically dispatched.
  - **Sensitive tasks STILL require explicit user approval**, even in trusted mode.
  - Ambiguous tasks **STILL require explicit user approval**, even in trusted mode.
  - Trust policy changes are audited in the SQLite event log (`trust_policy_changed`).
  - Trust can be revoked at any time by the user.

### Task Content Hashing & Approval Invalidation
- When a task is evaluated, a deterministic SHA-256 hash of its canonical content (`title`, `description`, `acceptanceCriteria`) is calculated.
- User approval binds explicitly to `approvedContentHash`.
- At dispatch time, the current content hash is verified against `approvedContentHash`. If a task's content was altered after approval, the approval is revoked and the task is moved back to `awaiting_approval`.
- Retried tasks with modified instructions require re-approval.

---

## 6. Antigravity CLI Execution Boundary

1. **Native Permissions Intact**:
   - Knot **NEVER** passes `--dangerously-skip-permissions` or `--always-proceed`.
   - Knot does not simulate user input to bypass interactive CLI security prompts.
   - Antigravity's native tool permission gates remain active independently of Knot's task approval gate.
2. **Working Directory Lockdown**:
   - The child process `cwd` is strictly locked to the registered project's `repositoryPath`.
   - Broadening to `~` or `/` is prohibited.
3. **Executable Path Whitelist**:
   - Only resolved, validated Antigravity CLI binary paths are spawned. Renderer-supplied executable paths are ignored.

---

## 7. Electron IPC & Renderer Boundary

1. **Window Isolation**:
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `sandbox: true`
2. **Navigation & Popups**:
   - `webContents.on('will-navigate')` intercepts and denies all navigation.
   - `webContents.setWindowOpenHandler` denies popup windows; validated `http`/`https` links are routed to the OS default browser via `shell.openExternal`.
3. **Content Security Policy**:
   - `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';`
4. **IPC Sender Validation**:
   - Privileged IPC handlers verify that `event.senderFrame` belongs to the primary window.
   - Requests from untrusted or unexpected frames are rejected.
5. **Path Validation in IPC**:
   - Directory-opening APIs validate that requested paths reside strictly within the registered bridge directory or repository path.

---

## 8. Process Execution Hardening

All process executions in Knot (`git`, `antigravity`, `desktop-commander`) comply with:
- `spawn` with `shell: false`.
- Positional argument arrays (no string concatenation or shell interpolation).
- Working directory validation via realpath checks.
- Bounded timeouts and stdout/stderr buffer caps.
- Strict child PID tracking: Knot only signals processes that it directly spawned.

---

## 9. SQLite and Local Application Data Protection

1. **Storage Location**:
   - Application database is stored under the platform user data directory (`app.getPath('userData')` or `~/.local/share/knot/`).
2. **File Permissions**:
   - Database directory permissions are set to `0700` (owner read/write/execute only).
   - Database files (`knot.sqlite`, WAL, SHM) are set to `0600` (owner read/write only) on POSIX platforms.
3. **No Plaintext Credential Storage**:
   - Knot does not store third-party API keys or passwords.
   - No mock encryption guarantees are claimed for unencrypted SQLite databases.

---

## 10. Log Sanitization & Sensitive Data Redaction

All data entering event audit logs, execution details, task results, diff viewers, and exports passes through `sanitizeLogOutput`:
- **Private Keys**: PEM blocks (`-----BEGIN ... PRIVATE KEY-----`).
- **Cloud Tokens**: AWS access keys (`AKIA...`), GitHub personal tokens (`ghp_...`, `github_pat_...`), GitLab tokens (`glpat-...`), Slack tokens (`xox...`), Google AI keys (`AIza...`), OpenAI keys (`sk-...`).
- **Authentication Credentials**: JWT tokens (`eyJ...`), Bearer/Basic authorization headers, URL embedded passwords (`https://user:pass@host`).
- **Sensitive Files in Git Diffs**: `.env` files, keystores, and certificate files have diff contents omitted automatically.

---

## 11. Security Audit Matrix

| Threat ID | Threat Scenario | Required Access | Potential Impact | Knot Mitigation | Verification Test |
|---|---|---|---|---|---|
| **T-01** | Spoofed Bridge Sender (`sender: chatgpt`) | Write access to `inbox/chatgpt/` | Unauthorized task queuing | Bridge treated as untrusted; tasks require approval unless user explicitly promotes project. | `tests/security.test.ts` |
| **T-02** | Symlink traversal in bridge inbox | Symlink creation in inbox | Host file read / disclosure | `fs.lstat` checks reject symbolic links (`SYMLINK_NOT_ALLOWED`) prior to file read. | `tests/security.test.ts` |
| **T-03** | Oversized bridge message denial-of-service | Write file >256 KB | Memory exhaustion / crash | Size verified at `lstat` stage; rejected without full read. | `tests/security.test.ts` |
| **T-04** | Privilege self-elevation via message metadata | Metadata flags in task | Bypass approval checks | Policy engine ignores metadata trust overrides; evaluates content independently. | `tests/security.test.ts` |
| **T-05** | Sensitive task auto-dispatch in trusted project | Project in trusted mode | Destructive action / push | Sensitive operations (`git push`, deletion, secrets) always require approval regardless of mode. | `tests/security.test.ts` |
| **T-06** | Ambiguous task auto-dispatch | Project in trusted mode | Unintended agent execution | Ambiguous tasks fail safe: require approval in all modes. | `tests/security.test.ts` |
| **T-07** | Post-approval task description tampering | SQLite or memory edit | Execute unreviewed instructions | SHA-256 content hash check at dispatch revokes approval if instructions change. | `tests/security.test.ts` |
| **T-08** | Stale approval carry-over on task retry | Retry task with new prompt | Unreviewed execution | Retrying invalidates previous approval; moves to `awaiting_approval`. | `tests/security.test.ts` |
| **T-09** | Arbitrary executable spawn via IPC | Compromised renderer | Arbitrary code execution | Renderer-supplied binary paths ignored; only pre-detected binaries spawned. | `tests/security.test.ts` |
| **T-10** | Path traversal in Git inspection | Crafted IPC arguments | Read files outside repo | `validateRelativeFilePath` canonicalizes paths and detects traversal/symlink escapes. | `tests/security.test.ts` |
| **T-11** | External URL navigation in Electron | Malicious link click | XSS / session hijacking | `will-navigate` blocked; `setWindowOpenHandler` routes safe external URLs to system browser. | `tests/security.test.ts` |
| **T-12** | Secret exposure in event logs & exports | API key in stdout / diff | Credential disclosure | Comprehensive regex sanitization redacts keys before SQLite storage and export. | `tests/security.test.ts` |

---

## 12. Residual Risks and Out-of-Scope Threats

1. **Compromised Operating-System User Account**:
   - If malicious code executes under the user's local account with equal privileges, it can directly read/write Knot's SQLite files, inspect memory, or replace binaries. Knot cannot defend against full operating system account compromise.
2. **Desktop Commander Remote MCP Security**:
   - Knot manages the lifecycle of the Desktop Commander process, but Desktop Commander's internal remote connection authentication and allowed directory configuration are managed independently.
3. **Antigravity CLI Internal Logic**:
   - Knot relies on the Antigravity CLI binary adhering to its native tool permissions when invoked without bypass flags.
