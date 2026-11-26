#!/usr/bin/env node

/**
 * Packaging Verification Script
 *
 * Validates Linux build outputs produced by electron-builder:
 * 1. Checks that the standalone AppImage exists, is non-empty, and exceeds expected size (> 10MB).
 * 2. Checks that linux-unpacked binary executable exists and has executable permissions.
 * 3. Checks that resources/app.asar exists and contains the packaged application.
 * 4. Scans unpacked contents for sensitive files (.env, .pem, .key, credentials).
 */

import fs from 'node:fs';
import path from 'node:path';

console.log('📦 Starting Linux packaging verification...');

const releaseDir = path.resolve('release');
const unpackedDir = path.join(releaseDir, 'linux-unpacked');

const errors = [];
const successes = [];

// 1. Verify release directory exists
if (!fs.existsSync(releaseDir)) {
  console.error('❌ Release directory does not exist:', releaseDir);
  process.exit(1);
}

// 2. Verify AppImage artifact
const releaseFiles = fs.readdirSync(releaseDir);
const appImageFile = releaseFiles.find((f) => f.endsWith('.AppImage'));

if (!appImageFile) {
  errors.push('No .AppImage artifact found in release directory.');
} else {
  const appImagePath = path.join(releaseDir, appImageFile);
  const stats = fs.statSync(appImagePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  if (stats.size < 10 * 1024 * 1024) {
    errors.push(`AppImage artifact ${appImageFile} is suspiciously small: ${sizeMB} MB (< 10 MB).`);
  } else {
    successes.push(`AppImage found: ${appImageFile} (${sizeMB} MB)`);
  }
}

// 3. Verify unpacked executable
const executablePath = path.join(unpackedDir, 'knot');
if (!fs.existsSync(executablePath)) {
  errors.push(`Unpacked binary executable not found at: ${executablePath}`);
} else {
  try {
    fs.accessSync(executablePath, fs.constants.X_OK);
    const stats = fs.statSync(executablePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    successes.push(`Unpacked executable found and executable: knot (${sizeMB} MB)`);
  } catch (err) {
    errors.push(`Unpacked binary ${executablePath} lacks execute permissions: ${err.message}`);
  }
}

// 4. Verify resources/app.asar
const asarPath = path.join(unpackedDir, 'resources', 'app.asar');
if (!fs.existsSync(asarPath)) {
  errors.push(`Packaged app.asar not found at: ${asarPath}`);
} else {
  const stats = fs.statSync(asarPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  if (stats.size < 1024 * 1024) {
    errors.push(`app.asar is suspiciously small: ${sizeMB} MB (< 1 MB).`);
  } else {
    successes.push(`app.asar archive verified: (${sizeMB} MB)`);
  }
}

// 5. Scan unpacked contents for forbidden / sensitive files
function scanDirectory(dir, forbiddenPatterns) {
  const leaks = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(entry.name)) {
        leaks.push(fullPath);
      }
    }

    if (entry.isDirectory() && entry.name !== 'node_modules') {
      leaks.push(...scanDirectory(fullPath, forbiddenPatterns));
    }
  }

  return leaks;
}

const FORBIDDEN_LEAK_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /credentials\.json$/i,
  /\.sqlite$/i,
];

if (fs.existsSync(unpackedDir)) {
  const leaks = scanDirectory(unpackedDir, FORBIDDEN_LEAK_PATTERNS);
  if (leaks.length > 0) {
    errors.push(`Sensitive or forbidden files found in unpacked package:\n${leaks.map((l) => `     - ${l}`).join('\n')}`);
  } else {
    successes.push('Clean packaging verified: No sensitive credential or environment files detected in unpacked payload.');
  }
}

// Print results
console.log('\n--- Packaging Verification Results ---');
for (const s of successes) {
  console.log(`✅ ${s}`);
}

if (errors.length > 0) {
  console.error(`\n❌ Packaging verification FAILED with ${errors.length} error(s):`);
  for (const e of errors) {
    console.error(`   - ${e}`);
  }
  process.exit(1);
}

console.log('\n🎉 All packaging verification checks PASSED successfully!\n');
process.exit(0);
