import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

export function uninstallDesktopIntegration(options = {}) {
  const home = options.home || os.homedir();
  const xdgDataHome =
    options.xdgDataHome ||
    (options.home ? path.join(options.home, '.local', 'share') : (process.env.XDG_DATA_HOME || path.join(home, '.local', 'share')));
  const appsDir = path.join(xdgDataHome, 'applications');
  const iconsBaseDir = path.join(xdgDataHome, 'icons', 'hicolor');
  const binDir = options.binDir || path.join(home, '.local', 'bin');

  console.log('[Knot Uninstaller] Removing desktop integration...');

  // 1. Remove desktop file
  const desktopFilePath = path.join(appsDir, 'knot.desktop');
  if (fs.existsSync(desktopFilePath)) {
    fs.unlinkSync(desktopFilePath);
    console.log('[Knot Uninstaller] Removed', desktopFilePath);
  }

  // 2. Remove launcher binary
  const launcherPath = path.join(binDir, 'knot');
  if (fs.existsSync(launcherPath)) {
    fs.unlinkSync(launcherPath);
    console.log('[Knot Uninstaller] Removed', launcherPath);
  }

  // 3. Remove icons
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  for (const size of sizes) {
    const iconFile = path.join(iconsBaseDir, `${size}x${size}`, 'apps', 'knot.png');
    if (fs.existsSync(iconFile)) {
      fs.unlinkSync(iconFile);
    }
  }

  const svgIcon = path.join(iconsBaseDir, 'scalable', 'apps', 'knot.svg');
  if (fs.existsSync(svgIcon)) {
    fs.unlinkSync(svgIcon);
  }

  // 4. Update desktop database
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

  console.log('✅ Knot desktop integration removed cleanly.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  uninstallDesktopIntegration();
}
