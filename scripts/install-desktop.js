import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

export function installDesktopIntegration(options = {}) {
  const home = options.home || os.homedir();
  const projectDir = options.projectDir || path.resolve(import.meta.dirname, '..');

  const xdgDataHome =
    options.xdgDataHome ||
    (options.home ? path.join(options.home, '.local', 'share') : (process.env.XDG_DATA_HOME || path.join(home, '.local', 'share')));
  const appsDir = path.join(xdgDataHome, 'applications');
  const iconsBaseDir = path.join(xdgDataHome, 'icons', 'hicolor');
  const binDir = options.binDir || path.join(home, '.local', 'bin');

  console.log('[Knot Installer] Target applications directory:', appsDir);
  console.log('[Knot Installer] Target icons directory:', iconsBaseDir);
  console.log('[Knot Installer] Target bin directory:', binDir);

  // 1. Ensure target directories exist
  fs.mkdirSync(appsDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  // 2. Install executable launcher wrapper
  const launcherPath = path.join(binDir, 'knot');
  const appImagePath = path.join(projectDir, 'release', 'Knot-1.0.0.AppImage');
  const unpackedBinary = path.join(projectDir, 'release', 'linux-unpacked', 'knot');

  const launcherContent = `#!/usr/bin/env bash
# Knot desktop launcher script with robust diagnostic logging and fallback
set -u

STATE_HOME="\${XDG_STATE_HOME:-\$HOME/.local/state}"
LOG_DIR="\$STATE_HOME/knot/logs"
mkdir -p "\$LOG_DIR"
LOG_FILE="\$LOG_DIR/launcher.log"

# Log rotation: rotate if greater than 1MB and preserve up to 5 backups
if [ -f "\$LOG_FILE" ]; then
  FILE_SIZE=\$(wc -c < "\$LOG_FILE" 2>/dev/null || echo 0)
  if [ "\$FILE_SIZE" -gt 1048576 ]; then
    mv "\$LOG_FILE" "\$LOG_FILE.\$(date +%Y%m%d%H%M%S).bak"
    ls -tp "\$LOG_DIR"/launcher.log.*.bak 2>/dev/null | grep -v '/\$' | tail -n +6 | xargs -r rm -f --
  fi
fi

log() {
  echo "[\$(date -Iseconds)] [Knot Launcher] \$*" >> "\$LOG_FILE"
}

log "=== Knot launch sequence initiated ==="
log "Arguments: \${*:-none}"
log "Display environment: DISPLAY=\${DISPLAY:-none}, WAYLAND_DISPLAY=\${WAYLAND_DISPLAY:-none}, XDG_SESSION_TYPE=\${XDG_SESSION_TYPE:-none}"

APPIMAGE_PATH="${appImagePath}"
UNPACKED_PATH="${unpackedBinary}"
PROJECT_DIR="${projectDir}"

# 1. Check FUSE library availability
FUSE2_AVAILABLE=0
if ldconfig -p 2>/dev/null | grep -q "libfuse\\.so\\.2"; then
  FUSE2_AVAILABLE=1
  log "System FUSE2 library (libfuse.so.2) detected."
else
  log "System FUSE2 library not found. Enabling APPIMAGE_EXTRACT_AND_RUN=1 for AppImage compatibility."
  export APPIMAGE_EXTRACT_AND_RUN=1
fi

LAUNCH_SUCCESS=0

# Target 1: AppImage
if [ -f "\$APPIMAGE_PATH" ]; then
  chmod +x "\$APPIMAGE_PATH" 2>/dev/null || true
  if [ -x "\$APPIMAGE_PATH" ]; then
    log "Attempting launch using AppImage at: \$APPIMAGE_PATH"
    "\$APPIMAGE_PATH" "\$@" >> "\$LOG_FILE" 2>&1 &
    APP_PID=\$!
    sleep 0.35
    if kill -0 "\$APP_PID" 2>/dev/null; then
      log "AppImage started successfully (PID: \$APP_PID)."
      LAUNCH_SUCCESS=1
      wait "\$APP_PID" 2>/dev/null || true
      exit 0
    else
      wait "\$APP_PID" 2>/dev/null
      APP_EXIT=\$?
      if [ "\$APP_EXIT" -eq 0 ]; then
        log "AppImage completed execution with exit code 0."
        exit 0
      else
        log "AppImage exited prematurely with error code \$APP_EXIT. Proceeding to unpacked fallback."
      fi
    fi
  else
    log "AppImage found but lacks executable permissions: \$APPIMAGE_PATH"
  fi
else
  log "AppImage not found at \$APPIMAGE_PATH"
fi

# Target 2: Unpacked Binary Fallback
if [ "\$LAUNCH_SUCCESS" -eq 0 ] && [ -f "\$UNPACKED_PATH" ]; then
  chmod +x "\$UNPACKED_PATH" 2>/dev/null || true
  if [ -x "\$UNPACKED_PATH" ]; then
    log "Attempting fallback launch using unpacked binary at: \$UNPACKED_PATH"
    "\$UNPACKED_PATH" "\$@" >> "\$LOG_FILE" 2>&1 &
    APP_PID=\$!
    sleep 0.35
    if kill -0 "\$APP_PID" 2>/dev/null; then
      log "Unpacked application started successfully (PID: \$APP_PID)."
      LAUNCH_SUCCESS=1
      wait "\$APP_PID" 2>/dev/null || true
      exit 0
    else
      wait "\$APP_PID" 2>/dev/null
      APP_EXIT=\$?
      if [ "\$APP_EXIT" -eq 0 ]; then
        log "Unpacked binary completed execution with exit code 0."
        exit 0
      else
        log "Unpacked binary exited prematurely with error code \$APP_EXIT. Proceeding to npm fallback."
      fi
    fi
  else
    log "Unpacked binary found but lacks executable permissions: \$UNPACKED_PATH"
  fi
fi

# Target 3: npm start Fallback (only if npm and node are in PATH)
if [ "\$LAUNCH_SUCCESS" -eq 0 ]; then
  NPM_BIN=\$(command -v npm 2>/dev/null || true)
  if [ -n "\$NPM_BIN" ] && [ -d "\$PROJECT_DIR" ]; then
    log "Attempting fallback launch via npm start at: \$PROJECT_DIR"
    cd "\$PROJECT_DIR"
    "\$NPM_BIN" start -- "\$@" >> "\$LOG_FILE" 2>&1 &
    APP_PID=\$!
    wait "\$APP_PID" 2>/dev/null || true
    exit 0
  else
    log "npm command not found in PATH or project directory missing."
  fi
fi

# Failure: All targets failed
log "FATAL: All launch targets failed for Knot."
if command -v notify-send >/dev/null 2>&1; then
  notify-send -u critical "Knot Launch Error" "Could not start Knot. Diagnostic logs saved to \$LOG_FILE"
fi
exit 1
`;

  fs.writeFileSync(launcherPath, launcherContent, { mode: 0o755 });
  console.log('[Knot Installer] Installed launcher wrapper to', launcherPath);

  // 3. Install icons across all standard resolutions
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  for (const size of sizes) {
    const sizeDir = path.join(iconsBaseDir, `${size}x${size}`, 'apps');
    fs.mkdirSync(sizeDir, { recursive: true });
    const srcIcon = path.join(projectDir, 'build', 'icons', `${size}x${size}.png`);
    const destIcon = path.join(sizeDir, 'knot.png');
    if (fs.existsSync(srcIcon)) {
      fs.copyFileSync(srcIcon, destIcon);
    }
  }

  // Install scalable SVG icon
  const scalableDir = path.join(iconsBaseDir, 'scalable', 'apps');
  fs.mkdirSync(scalableDir, { recursive: true });
  const srcSvg = path.join(projectDir, 'build', 'icon.svg');
  if (fs.existsSync(srcSvg)) {
    fs.copyFileSync(srcSvg, path.join(scalableDir, 'knot.svg'));
  }
  console.log('[Knot Installer] Installed icons to', iconsBaseDir);

  // 4. Install Desktop Entry
  const desktopFilePath = path.join(appsDir, 'knot.desktop');
  const desktopContent = `[Desktop Entry]
Type=Application
Name=Knot
GenericName=AI Agent Process Manager
Comment=Where AI agents work together.
Exec=${launcherPath} %U
Icon=knot
Terminal=false
Categories=Development;
Keywords=ai;agent;knot;mcp;desktop-commander;remote;
StartupWMClass=knot
`;

  fs.writeFileSync(desktopFilePath, desktopContent, { mode: 0o644 });
  console.log('[Knot Installer] Installed desktop entry to', desktopFilePath);

  // 5. Validate desktop entry
  try {
    execSync(`desktop-file-validate "${desktopFilePath}"`, { stdio: 'inherit' });
    console.log('[Knot Installer] Desktop entry validation: PASSED');
  } catch {
    console.warn('[Knot Installer] desktop-file-validate not available or reported warnings');
  }

  // 6. Refresh desktop database & icon cache
  try {
    execSync(`update-desktop-database "${appsDir}"`, { stdio: 'ignore' });
  } catch {
    // optional
  }

  try {
    execSync(`gtk-update-icon-cache -f -t "${iconsBaseDir}"`, { stdio: 'ignore' });
  } catch {
    // optional
  }

  console.log('✅ Knot successfully installed and discoverable in Omarchy application launcher.');
  return { desktopFilePath, launcherPath };
}

// Execute directly if run as main
if (import.meta.url === `file://${process.argv[1]}`) {
  installDesktopIntegration();
}
