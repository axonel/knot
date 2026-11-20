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

## 🔒 Security Architecture

1. **Strict Context Isolation**: Renderer runs with `contextIsolation: true` and `nodeIntegration: false`.
2. **Narrowly Scoped Preload Bridge**: Frontend components communicate exclusively via strongly typed Electron IPC (`knotApi`). No raw shell execution or direct file system access is exposed to the renderer.
3. **No Shell Interpolation**: Child process execution uses `spawn` with `shell: false` and array arguments, preventing shell injection vulnerabilities.
4. **Credential Protection**: The log sanitizer continuously matches and redacts authentication secrets, JWTs, and URLs with embedded credentials.

---

## ⚠️ Known Limitations

- **Remote Cloud Pairing**: First-time execution of Desktop Commander Remote requires completing device pairing via the browser/terminal prompt provided by `@wonderwhy-er/desktop-commander`.
- **Milestone Scope**: Milestone 1 focuses on the core visual identity, branding, and Desktop Commander process manager. The "Agent Threads" and "Message Mesh" modules in the sidebar navigation are scheduled for Milestone 2.
