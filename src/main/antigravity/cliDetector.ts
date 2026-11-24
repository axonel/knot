import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import type { AntigravityCapabilities, AntigravityExecutionMode, AntigravityReadinessState } from '../../shared/types.js';

export interface CliDetectorOptions {
  customPath?: string;
  env?: NodeJS.ProcessEnv;
}

export class CliDetector {
  private lastCapabilities: AntigravityCapabilities | null = null;

  public detect(options: CliDetectorOptions = {}): AntigravityCapabilities {
    const env = options.env || process.env;
    const candidatePath = this.resolveExecutablePath(options.customPath, env);

    if (!candidatePath) {
      this.lastCapabilities = {
        installed: false,
        executablePath: null,
        version: null,
        supportedModes: [],
        supportsStreaming: false,
        supportsResumption: false,
        readiness: 'not_installed',
        errorDetails: 'Antigravity CLI (agy) was not found in PATH or standard installation locations.',
      };
      return this.lastCapabilities;
    }

    try {
      const versionOutput = execFileSync(candidatePath, ['--version'], {
        encoding: 'utf-8',
        timeout: 5000,
        env,
      }).trim();

      const versionMatch = versionOutput.match(/\b(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)\b/);
      const version = versionMatch ? versionMatch[1] : versionOutput;

      let helpOutput = '';
      try {
        helpOutput = execFileSync(candidatePath, ['--help'], {
          encoding: 'utf-8',
          timeout: 5000,
          env,
        });
      } catch {
        // If help fails, assume standard flags
      }

      const supportsStreaming = helpOutput.includes('stream-json') || true;
      const supportsResumption =
        helpOutput.includes('--conversation') || helpOutput.includes('--resume') || true;

      const supportedModes: AntigravityExecutionMode[] = ['default', 'accept-edits', 'auto', 'plan'];

      const readiness = this.checkReadiness(env);

      this.lastCapabilities = {
        installed: true,
        executablePath: candidatePath,
        version,
        supportedModes,
        supportsStreaming,
        supportsResumption,
        readiness,
        errorDetails: null,
      };

      return this.lastCapabilities;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastCapabilities = {
        installed: true,
        executablePath: candidatePath,
        version: null,
        supportedModes: ['default', 'accept-edits', 'auto', 'plan'],
        supportsStreaming: true,
        supportsResumption: true,
        readiness: 'error',
        errorDetails: `Failed to execute Antigravity CLI at ${candidatePath}: ${message}`,
      };
      return this.lastCapabilities;
    }
  }

  public getLastCapabilities(): AntigravityCapabilities | null {
    return this.lastCapabilities;
  }

  private resolveExecutablePath(customPath?: string, env: NodeJS.ProcessEnv = process.env): string | null {
    if (customPath) {
      const resolved = path.resolve(customPath);
      if (this.isExecutable(resolved)) {
        return resolved;
      }
      return null;
    }

    const home = env.HOME || os.homedir();
    const candidatePaths: string[] = [
      path.join(home, '.local', 'bin', 'agy'),
      path.join(home, '.local', 'bin', 'antigravity'),
      '/usr/local/bin/agy',
      '/usr/bin/agy',
      '/bin/agy',
      path.join(home, 'bin', 'agy'),
    ];

    const pathEnv = env.PATH || '';
    const envDirs = pathEnv.split(path.delimiter);
    for (const dir of envDirs) {
      if (dir) {
        candidatePaths.push(path.join(dir, 'agy'));
        candidatePaths.push(path.join(dir, 'antigravity'));
      }
    }

    for (const candidate of candidatePaths) {
      if (this.isExecutable(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private isExecutable(filePath: string): boolean {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        return false;
      }
      // Check execute permission
      fs.accessSync(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  private checkReadiness(env: NodeJS.ProcessEnv): AntigravityReadinessState {
    if (env.GEMINI_API_KEY) {
      return 'ready';
    }

    const home = env.HOME || os.homedir();
    const oauthCreds = path.join(home, '.gemini', 'oauth_creds.json');
    const googleAccounts = path.join(home, '.gemini', 'google_accounts.json');

    try {
      if (fs.existsSync(oauthCreds) && fs.statSync(oauthCreds).size > 10) {
        return 'ready';
      }
      if (fs.existsSync(googleAccounts) && fs.statSync(googleAccounts).size > 10) {
        return 'ready';
      }
    } catch {
      return 'auth_unverified';
    }

    return 'auth_required';
  }
}

export const cliDetector = new CliDetector();
