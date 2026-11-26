#!/usr/bin/env node

/**
 * Dependency Security Audit Automation
 *
 * Runs `npm audit --json` and inspects vulnerability advisories.
 * Distinguishes between production runtime dependencies and build/packaging tooling.
 * Fails if:
 * 1. ANY production vulnerability is detected.
 * 2. ANY unknown/unreviewed devDependency vulnerability is detected.
 * 3. An accepted dev-only vulnerability has passed its review expiry date.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Documented, reviewed exceptions for development/build tooling ONLY.
// Production dependencies are NEVER eligible for exceptions.
const DOCUMENTED_AUDIT_EXCEPTIONS = [
  {
    id: 'GHSA-g3hv-75wg-m249',
    packageName: 'minimatch',
    severity: 'moderate',
    affectedPaths: [
      '@electron/universal > minimatch',
      'app-builder-lib > minimatch',
      'electron-builder > app-builder-lib > minimatch',
      'electron-builder > @electron/universal > minimatch',
    ],
    scope: 'devDependency',
    toolingContext: 'Packaging tooling (electron-builder); not bundled into runtime application',
    remediationBlocker: 'Remediation requires downgrading electron-builder to v25 which breaks Electron 45 compatibility',
    expiryDate: '2027-05-30',
  },
];

console.log('🔍 Running automated dependency security audit (npm audit)...');

let auditOutput = '';
try {
  auditOutput = execSync('npm audit --json', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (err) {
  // npm audit exits with code 1 if vulnerabilities are present
  if (err.stdout) {
    auditOutput = err.stdout.toString();
  } else {
    console.error('❌ Failed to execute npm audit:', err.message);
    process.exit(1);
  }
}

let auditJson;
try {
  auditJson = JSON.parse(auditOutput);
} catch (err) {
  console.error('❌ Failed to parse npm audit JSON output:', err.message);
  process.exit(1);
}

const vulnerabilities = auditJson.vulnerabilities || {};
const vulnCount = Object.keys(vulnerabilities).length;

console.log(`📋 Found ${vulnCount} advisory report entries in dependency tree.`);

// Load package.json to identify top-level production dependencies
const pkgJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
const prodDeps = new Set(Object.keys(pkgJson.dependencies || {}));
const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));

const unhandledVulns = [];
const acceptedVulns = [];
const today = new Date().toISOString().split('T')[0];

function isDevOnlyPackage(pkgName, vulnData, allVulns) {
  if (devDeps.has(pkgName)) return true;
  if (prodDeps.has(pkgName)) return false;

  const visited = new Set();
  const queue = [...(vulnData.effects || [])];

  let hasProdAncestor = false;
  let hasDevAncestor = false;

  while (queue.length > 0) {
    const parent = queue.shift();
    if (visited.has(parent)) continue;
    visited.add(parent);

    if (prodDeps.has(parent)) {
      hasProdAncestor = true;
    }
    if (devDeps.has(parent)) {
      hasDevAncestor = true;
    }

    const parentVuln = allVulns[parent];
    if (parentVuln && parentVuln.effects) {
      for (const grandParent of parentVuln.effects) {
        queue.push(grandParent);
      }
    }
  }

  if (hasProdAncestor) return false;
  if (hasDevAncestor) return true;

  // Check nodes path
  const nodes = vulnData.nodes || [];
  for (const node of nodes) {
    for (const devPkg of devDeps) {
      if (node.includes(`/${devPkg}/`)) {
        return true;
      }
    }
  }

  return false;
}

for (const [pkgName, vulnData] of Object.entries(vulnerabilities)) {
  const isDirect = vulnData.isDirect;
  const isDev = vulnData.dev === true || isDevOnlyPackage(pkgName, vulnData, vulnerabilities);
  const severity = vulnData.severity;
  const viaList = vulnData.via || [];

  for (const via of viaList) {
    if (typeof via === 'string') {
      // Named reference to another vulnerable package in the tree
      continue;
    }

    const advisoryId = via.source ? String(via.source) : via.url ? path.basename(via.url) : null;
    const title = via.title || via.name || 'Unknown vulnerability';

    // Check if covered by a valid documented exception
    const matchedException = DOCUMENTED_AUDIT_EXCEPTIONS.find(
      (exc) =>
        exc.packageName === pkgName ||
        exc.id === advisoryId ||
        (via.url && via.url.includes(exc.id))
    );

    if (matchedException) {
      if (!isDev) {
        unhandledVulns.push({
          packageName: pkgName,
          advisoryId: matchedException.id,
          severity,
          title,
          isDev: false,
          error: 'EXCEPTION_NOT_ALLOWED: Documented exceptions are strictly disallowed for production dependencies!',
        });
      } else if (matchedException.expiryDate < today) {
        unhandledVulns.push({
          packageName: pkgName,
          advisoryId: matchedException.id,
          severity,
          title,
          isDev: true,
          error: `EXPIRED_EXCEPTION: Exception expired on ${matchedException.expiryDate}. Must be re-audited and updated.`,
        });
      } else {
        acceptedVulns.push({
          packageName: pkgName,
          advisoryId: matchedException.id,
          severity,
          title,
          scope: matchedException.scope,
          context: matchedException.toolingContext,
          expires: matchedException.expiryDate,
        });
      }
    } else {
      unhandledVulns.push({
        packageName: pkgName,
        advisoryId: advisoryId || 'N/A',
        severity,
        title,
        isDev,
        error: isDev ? 'UNREVIEWED_DEV_VULNERABILITY' : 'PRODUCTION_VULNERABILITY',
      });
    }
  }
}

// Generate report summary
console.log('\n--- Dependency Audit Summary ---');
if (acceptedVulns.length > 0) {
  console.log(`⚠️  Accepted Dev-Tooling Exceptions (${acceptedVulns.length}):`);
  for (const acc of acceptedVulns) {
    console.log(`   - [${acc.severity.toUpperCase()}] ${acc.packageName} (${acc.advisoryId}): ${acc.title}`);
    console.log(`     Context: ${acc.context} (Expires: ${acc.expires})`);
  }
}

if (unhandledVulns.length > 0) {
  console.error(`\n❌ Unhandled or Production Vulnerabilities (${unhandledVulns.length}):`);
  for (const v of unhandledVulns) {
    console.error(`   - [${v.severity.toUpperCase()}] ${v.packageName} (${v.advisoryId}): ${v.title}`);
    console.error(`     Error: ${v.error} (Dev dependency: ${v.isDev})`);
  }
  console.error('\n🚫 Dependency security audit FAILED. Please remediate or review vulnerabilities.');
  process.exit(1);
}

console.log('\n✅ Dependency security audit PASSED. No production or unreviewed vulnerabilities found.');
process.exit(0);
