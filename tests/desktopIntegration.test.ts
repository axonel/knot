import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { installDesktopIntegration } from '../scripts/install-desktop.js';
import { uninstallDesktopIntegration } from '../scripts/uninstall-desktop.js';

describe('Linux Desktop Integration & Packaging', () => {
  const projectRoot = path.resolve(import.meta.dirname, '..');

  describe('Desktop Entry Specification', () => {
    const desktopPath = path.join(projectRoot, 'build', 'knot.desktop');

    it('provides a valid build/knot.desktop entry', () => {
      expect(fs.existsSync(desktopPath)).toBe(true);
      const content = fs.readFileSync(desktopPath, 'utf-8');

      expect(content).toContain('[Desktop Entry]');
      expect(content).toContain('Name=Knot');
      expect(content).toContain('Icon=knot');
      expect(content).toContain('Type=Application');
      expect(content).toContain('Categories=Development;');
      expect(content).toContain('StartupWMClass=Knot');
    });

    it('passes desktop-file-validate', () => {
      try {
        const out = execSync(`desktop-file-validate "${desktopPath}"`, { encoding: 'utf-8' });
        expect(out).toBe('');
      } catch (err: unknown) {
        // If system doesn't have desktop-file-validate, test passes gracefully
        if (err && typeof err === 'object' && 'status' in err) {
          expect((err as { status: number }).status).toBe(0);
        }
      }
    });
  });

  describe('Icon Asset Verification', () => {
    it('provides master SVG icon', () => {
      const svgPath = path.join(projectRoot, 'build', 'icon.svg');
      expect(fs.existsSync(svgPath)).toBe(true);
      const content = fs.readFileSync(svgPath, 'utf-8');
      expect(content).toContain('<svg');
      expect(content).toContain('</svg>');
    });

    const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
    const sizePairs = sizes.map((s) => [s, s]);

    it.each(sizePairs)('provides valid %dx%d PNG icon with PNG header', (width, height) => {
      const iconPath = path.join(projectRoot, 'build', 'icons', `${width}x${height}.png`);
      expect(fs.existsSync(iconPath)).toBe(true);

      const buffer = fs.readFileSync(iconPath);
      expect(buffer.length).toBeGreaterThan(100);

      // PNG magic number: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(buffer.subarray(0, 8)).toEqual(pngMagic);
    });
  });

  describe('Packaging Configuration (electron-builder.json)', () => {
    it('defines valid Linux packaging configuration', () => {
      const configPath = path.join(projectRoot, 'electron-builder.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config.appId).toBe('com.axonel.knot');
      expect(config.productName).toBe('Knot');
      expect(config.executableName).toBe('knot');
      expect(config.linux.target).toContain('AppImage');
      expect(config.linux.target).toContain('dir');
      expect(config.linux.category).toBe('Development');
      expect(config.linux.syncDesktopName).toBe(true);
    });
  });

  describe('Desktop Installation & Uninstallation Lifecycle', () => {
    it('installs and uninstalls desktop integration cleanly in a sandbox environment', () => {
      const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-test-home-'));

      try {
        // Install in temporary home sandbox
        const { desktopFilePath, launcherPath } = installDesktopIntegration({
          home: tempHome,
          projectDir: projectRoot,
        });

        expect(fs.existsSync(desktopFilePath)).toBe(true);
        expect(fs.existsSync(launcherPath)).toBe(true);

        // Verify launcher is executable
        const stat = fs.statSync(launcherPath);
        expect(stat.mode & 0o111).not.toBe(0);

        // Verify installed icon
        const installedIcon128 = path.join(
          tempHome,
          '.local',
          'share',
          'icons',
          'hicolor',
          '128x128',
          'apps',
          'knot.png'
        );
        expect(fs.existsSync(installedIcon128)).toBe(true);

        // Uninstall in temporary home sandbox
        uninstallDesktopIntegration({ home: tempHome });

        expect(fs.existsSync(desktopFilePath)).toBe(false);
        expect(fs.existsSync(launcherPath)).toBe(false);
        expect(fs.existsSync(installedIcon128)).toBe(false);
      } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
      }
    });
  });
});
