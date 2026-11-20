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
# Knot desktop launcher script
if [ -f "${appImagePath}" ]; then
  exec "${appImagePath}" "$@"
elif [ -x "${unpackedBinary}" ]; then
  exec "${unpackedBinary}" "$@"
else
  cd "${projectDir}" && npm start -- "$@"
fi
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
StartupWMClass=Knot
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
