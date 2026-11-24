import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as Diff from 'diff';
import type { DatabaseService } from '../database/index.js';
import type {
  TaskGitBoundary,
  GitStatusSummary,
  FileDiffEntry,
  FileChangeType,
  DiffHunk,
  DiffHunkLine,
  TaskGitInspectionResult,
  GitRepoStatusResult,
} from '../../shared/types.js';
import {
  validateRepositoryPath,
  validateRelativeFilePath,
  validateCommitHash,
  isSensitiveFilePath,
  containsSensitiveSecrets,
  isBinaryContent,
} from './gitSecurity.js';

// Strictly whitelisted read-only git subcommands
const ALLOWED_GIT_COMMANDS = new Set([
  'status',
  'rev-parse',
  'branch',
  'diff',
  'diff-tree',
  'show',
  'log',
  'cat-file',
  'check-attr',
  'ls-files',
]);

const FORBIDDEN_GIT_COMMANDS = new Set([
  'add',
  'commit',
  'reset',
  'checkout',
  'switch',
  'clean',
  'push',
  'pull',
  'merge',
  'rebase',
  'init',
  'clone',
  'fetch',
  'tag',
  'branch -d',
  'branch -D',
  'remote',
  'cherry-pick',
  'revert',
]);

const MAX_DIFF_SIZE_CHARS = 250_000; // 250 KB
const GIT_EXECUTION_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER_BYTES = 5 * 1024 * 1024; // 5 MB

export class GitService {
  constructor(private dbService: DatabaseService) {}

  /**
   * Spawns a read-only git process strictly using array arguments and shell: false.
   */
  public async runGit(
    args: string[],
    cwd: string,
    options?: { timeoutMs?: number; maxBufferBytes?: number; allowNonZeroExit?: boolean }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!args || args.length === 0) {
      throw new Error('Git command arguments cannot be empty.');
    }

    const subCommand = args[0];
    if (FORBIDDEN_GIT_COMMANDS.has(subCommand) || !ALLOWED_GIT_COMMANDS.has(subCommand)) {
      throw new Error(`Execution rejected: git subcommand "${subCommand}" is not in the read-only whitelist.`);
    }

    const timeoutMs = options?.timeoutMs ?? GIT_EXECUTION_TIMEOUT_MS;
    const maxBuffer = options?.maxBufferBytes ?? GIT_MAX_BUFFER_BYTES;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const child = spawn('git', args, {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
        reject(new Error(`Git command "git ${args.join(' ')}" timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (stdout.length > maxBuffer) {
          killed = true;
          child.kill('SIGKILL');
          clearTimeout(timer);
          reject(new Error(`Git command output exceeded maximum buffer limit (${maxBuffer} bytes).`));
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
        if (stderr.length > maxBuffer) {
          killed = true;
          child.kill('SIGKILL');
          clearTimeout(timer);
          reject(new Error(`Git command stderr exceeded maximum buffer limit.`));
        }
      });

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (err.code === 'ENOENT') {
          reject(new Error('Git executable not found on host system. Please install Git.'));
        } else {
          reject(err);
        }
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        if (killed) return;

        const code = exitCode ?? 0;
        if (code !== 0 && !options?.allowNonZeroExit) {
          if (stderr.includes('not a git repository')) {
            reject(new Error(`Directory is not a valid Git repository: "${cwd}".`));
          } else {
            reject(new Error(`Git command "git ${args.join(' ')}" failed with exit code ${code}: ${stderr.trim()}`));
          }
        } else {
          resolve({ stdout, stderr, exitCode: code });
        }
      });
    });
  }

  /**
   * Captures the repository status including branch, HEAD commit, staged, unstaged, and untracked files.
   */
  public async getRepoStatus(repoPath: string, allowedRoot?: string): Promise<GitRepoStatusResult> {
    const canonicalRepo = validateRepositoryPath(repoPath, allowedRoot);

    // 1. Branch
    let branch: string | null = null;
    try {
      const branchRes = await this.runGit(['branch', '--show-current'], canonicalRepo);
      branch = branchRes.stdout.trim() || null;
      if (!branch) {
        // Detached HEAD fallback
        const headRev = await this.runGit(['rev-parse', '--short', 'HEAD'], canonicalRepo, { allowNonZeroExit: true });
        if (headRev.exitCode === 0 && headRev.stdout.trim()) {
          branch = `(detached at ${headRev.stdout.trim()})`;
        }
      }
    } catch {
      branch = null;
    }

    // 2. HEAD commit
    let head: string | null = null;
    try {
      const headRes = await this.runGit(['rev-parse', 'HEAD'], canonicalRepo, { allowNonZeroExit: true });
      if (headRes.exitCode === 0 && headRes.stdout.trim()) {
        head = headRes.stdout.trim();
      }
    } catch {
      head = null;
    }

    // 3. Status
    const statusRes = await this.runGit(['status', '--porcelain=v1', '-z', '-uall'], canonicalRepo);
    const stagedFiles: string[] = [];
    const unstagedFiles: string[] = [];
    const untrackedFiles: string[] = [];

    const rawEntries = statusRes.stdout.split('\0').filter(Boolean);
    let i = 0;
    while (i < rawEntries.length) {
      const entry = rawEntries[i];
      if (entry.length < 3) {
        i++;
        continue;
      }

      const indexStatus = entry[0];
      const worktreeStatus = entry[1];
      const filePath = entry.slice(3);

      // Handle renames where old path follows in the next null-delimited token
      if (indexStatus === 'R' || indexStatus === 'C') {
        i++; // skip old name token in stream
      }

      if (indexStatus === '?' && worktreeStatus === '?') {
        untrackedFiles.push(filePath);
      } else {
        if (['M', 'A', 'D', 'R', 'C'].includes(indexStatus)) {
          stagedFiles.push(filePath);
        }
        if (['M', 'D'].includes(worktreeStatus)) {
          unstagedFiles.push(filePath);
        }
      }

      i++;
    }

    const isClean = stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0;

    return {
      repositoryPath: canonicalRepo,
      branch,
      head,
      isClean,
      stagedFiles,
      unstagedFiles,
      untrackedFiles,
    };
  }

  /**
   * Captures the starting task boundary snapshot at task dispatch.
   */
  public async captureTaskBoundaryStart(taskId: string, repoPath: string, allowedRoot?: string): Promise<TaskGitBoundary> {
    const status = await this.getRepoStatus(repoPath, allowedRoot);
    const startSummary: GitStatusSummary = {
      head: status.head,
      branch: status.branch,
      isClean: status.isClean,
      stagedFiles: status.stagedFiles,
      unstagedFiles: status.unstagedFiles,
      untrackedFiles: status.untrackedFiles,
    };

    return {
      taskId,
      start: startSummary,
      capturedAtStart: new Date().toISOString(),
    };
  }

  /**
   * Captures the ending task boundary snapshot at task completion.
   */
  public async captureTaskBoundaryEnd(
    boundary: TaskGitBoundary,
    repoPath: string,
    reportedCommitHash?: string | null,
    allowedRoot?: string
  ): Promise<TaskGitBoundary> {
    const status = await this.getRepoStatus(repoPath, allowedRoot);
    const endSummary: GitStatusSummary = {
      head: status.head,
      branch: status.branch,
      isClean: status.isClean,
      stagedFiles: status.stagedFiles,
      unstagedFiles: status.unstagedFiles,
      untrackedFiles: status.untrackedFiles,
    };

    let verifiedCommitHash: string | null = null;
    if (reportedCommitHash) {
      try {
        const validated = validateCommitHash(reportedCommitHash);
        const verifyRes = await this.runGit(
          ['rev-parse', '--verify', `${validated}^{commit}`],
          status.repositoryPath,
          { allowNonZeroExit: true }
        );
        if (verifyRes.exitCode === 0 && verifyRes.stdout.trim()) {
          verifiedCommitHash = verifyRes.stdout.trim();
        }
      } catch {
        verifiedCommitHash = null;
      }
    }

    return {
      ...boundary,
      end: endSummary,
      reportedCommitHash: reportedCommitHash || null,
      verifiedCommitHash,
      capturedAtEnd: new Date().toISOString(),
    };
  }

  /**
   * Parses raw unified diff string into structured hunks and line entries.
   */
  public parseUnifiedDiff(rawDiff: string): { hunks: DiffHunk[]; additions: number; deletions: number } {
    if (!rawDiff || !rawDiff.trim()) {
      return { hunks: [], additions: 0, deletions: 0 };
    }

    let parsed: ReturnType<typeof Diff.parsePatch>;
    try {
      parsed = Diff.parsePatch(rawDiff);
    } catch {
      return { hunks: [], additions: 0, deletions: 0 };
    }

    if (!parsed || parsed.length === 0 || !parsed[0].hunks) {
      return { hunks: [], additions: 0, deletions: 0 };
    }

    const hunks: DiffHunk[] = [];
    let additions = 0;
    let deletions = 0;

    for (const rawHunk of parsed[0].hunks) {
      let oldLine = rawHunk.oldStart;
      let newLine = rawHunk.newStart;
      const lines: DiffHunkLine[] = [];

      for (const rawLine of rawHunk.lines) {
        if (rawLine.startsWith('+')) {
          additions++;
          lines.push({
            type: 'addition',
            content: rawLine.slice(1),
            newLineNumber: newLine++,
          });
        } else if (rawLine.startsWith('-')) {
          deletions++;
          lines.push({
            type: 'deletion',
            content: rawLine.slice(1),
            oldLineNumber: oldLine++,
          });
        } else if (rawLine.startsWith(' ')) {
          lines.push({
            type: 'context',
            content: rawLine.slice(1),
            oldLineNumber: oldLine++,
            newLineNumber: newLine++,
          });
        }
      }

      hunks.push({
        header: `@@ -${rawHunk.oldStart},${rawHunk.oldLines} +${rawHunk.newStart},${rawHunk.newLines} @@`,
        oldStart: rawHunk.oldStart,
        oldLines: rawHunk.oldLines,
        newStart: rawHunk.newStart,
        newLines: rawHunk.newLines,
        lines,
      });
    }

    return { hunks, additions, deletions };
  }

  /**
   * Reads an untracked text file and formats it as an added unified diff safely.
   */
  private async formatUntrackedFileDiff(
    repoRoot: string,
    relPath: string
  ): Promise<{ diff?: string; hunks: DiffHunk[]; additions: number; deletions: number; omittedReason?: 'binary' | 'large_file' | 'sensitive_file' | 'encoding_error' | 'empty' }> {
    const fullPath = path.resolve(repoRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      return { hunks: [], additions: 0, deletions: 0, omittedReason: 'empty' };
    }

    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_DIFF_SIZE_CHARS) {
      return { hunks: [], additions: 0, deletions: 0, omittedReason: 'large_file' };
    }

    let buffer: Buffer;
    try {
      buffer = fs.readFileSync(fullPath);
    } catch {
      return { hunks: [], additions: 0, deletions: 0, omittedReason: 'encoding_error' };
    }

    if (isBinaryContent(buffer)) {
      return { hunks: [], additions: 0, deletions: 0, omittedReason: 'binary' };
    }

    const content = buffer.toString('utf8');
    if (!content.trim()) {
      return { hunks: [], additions: 0, deletions: 0, omittedReason: 'empty' };
    }

    if (containsSensitiveSecrets(content)) {
      return { hunks: [], additions: 0, deletions: 0, omittedReason: 'sensitive_file' };
    }

    const patch = Diff.createTwoFilesPatch('/dev/null', relPath, '', content, '', '', { context: 3 });
    const { hunks, additions, deletions } = this.parseUnifiedDiff(patch);

    return {
      diff: patch,
      hunks,
      additions,
      deletions,
    };
  }

  /**
   * Retrieves full task-linked Git diff, file changes, and provenance attribution.
   */
  public async getTaskDiff(taskId: string): Promise<TaskGitInspectionResult> {
    const task = this.dbService.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found with id: "${taskId}".`);
    }

    const session = this.dbService.sessions.get(task.sessionId);
    if (!session) {
      throw new Error(`Session not found with id: "${task.sessionId}".`);
    }

    const project = this.dbService.projects.get(session.projectId);
    if (!project) {
      throw new Error(`Project not found with id: "${session.projectId}".`);
    }

    const repoPath = project.repositoryPath || '';
    if (!repoPath) {
      throw new Error(`Project "${project.name}" does not have a repository path configured.`);
    }

    const canonicalRepo = validateRepositoryPath(repoPath);

    // Get current repository state
    const currentStatus = await this.getRepoStatus(canonicalRepo, canonicalRepo);
    const boundary = task.gitBoundary;

    const attributionNotes: string[] = [];
    let attributionConfidence: 'high' | 'medium' | 'low' = 'high';
    let repositoryChangedSinceCompletion = false;

    if (!boundary) {
      attributionConfidence = 'low';
      attributionNotes.push('No task boundary snapshot was captured for this task; displaying current repository working-tree state.');
    } else {
      if (!boundary.start.isClean) {
        attributionConfidence = 'low';
        attributionNotes.push(
          `Repository had uncommitted changes at task dispatch (staged: ${boundary.start.stagedFiles.length}, unstaged: ${boundary.start.unstagedFiles.length}, untracked: ${boundary.start.untrackedFiles.length}). Pre-existing modifications cannot be reliably isolated.`
        );
      }

      if (boundary.end) {
        if (
          boundary.end.head !== currentStatus.head ||
          boundary.end.isClean !== currentStatus.isClean ||
          boundary.end.stagedFiles.length !== currentStatus.stagedFiles.length ||
          boundary.end.unstagedFiles.length !== currentStatus.unstagedFiles.length
        ) {
          repositoryChangedSinceCompletion = true;
          attributionNotes.push('Repository state has changed since task completed. Current working-tree diff may no longer represent exact task completion state.');
        }
      }
    }

    const fileEntriesMap = new Map<string, FileDiffEntry>();

    // 1. If verified commit exists, inspect commit metadata & commit diffs
    let commitMetadata: TaskGitInspectionResult['commitMetadata'] = null;
    const verifiedCommit = boundary?.verifiedCommitHash;

    if (verifiedCommit) {
      try {
        const logRes = await this.runGit(
          ['log', '-1', '--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%B', verifiedCommit],
          canonicalRepo
        );
        const [hash, authorName, authorEmail, timestamp, ...messageParts] = logRes.stdout.split('\x1f');
        commitMetadata = {
          hash: hash.trim(),
          authorName: authorName.trim(),
          authorEmail: authorEmail.trim(),
          timestamp: timestamp.trim(),
          message: messageParts.join('\x1f').trim(),
        };

        // Files in commit
        const diffTreeRes = await this.runGit(
          ['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', verifiedCommit],
          canonicalRepo
        );
        const tokens = diffTreeRes.stdout.split('\0').filter(Boolean);
        let idx = 0;
        while (idx < tokens.length) {
          const statusChar = tokens[idx];
          const filePath = tokens[idx + 1];
          idx += 2;

          if (!filePath) continue;

          let changeType: FileChangeType = 'modified';
          if (statusChar === 'A') changeType = 'added';
          else if (statusChar === 'D') changeType = 'deleted';
          else if (statusChar.startsWith('R')) changeType = 'renamed';

          const entry: FileDiffEntry = {
            path: filePath,
            changeType,
            additions: 0,
            deletions: 0,
            isStaged: false,
            isUntracked: false,
            provenance: 'git-derived',
            attributionReason: `Committed in verified task commit ${verifiedCommit.slice(0, 8)}.`,
          };

          if (isSensitiveFilePath(filePath)) {
            entry.omittedReason = 'sensitive_file';
            entry.attributionReason = 'Contents omitted for security: file may contain sensitive credentials or keys.';
          } else {
            try {
              const diffRes = await this.runGit(
                ['diff-tree', '-p', '--no-commit-id', verifiedCommit, '--', filePath],
                canonicalRepo,
                { allowNonZeroExit: true }
              );
              if (diffRes.stdout.length > MAX_DIFF_SIZE_CHARS) {
                entry.omittedReason = 'large_file';
              } else if (diffRes.stdout.includes('Binary files')) {
                entry.omittedReason = 'binary';
              } else if (containsSensitiveSecrets(diffRes.stdout)) {
                entry.omittedReason = 'sensitive_file';
              } else {
                const parsed = this.parseUnifiedDiff(diffRes.stdout);
                entry.diff = diffRes.stdout;
                entry.hunks = parsed.hunks;
                entry.additions = parsed.additions;
                entry.deletions = parsed.deletions;
                if (!entry.diff.trim()) {
                  entry.omittedReason = 'empty';
                }
              }
            } catch {
              entry.omittedReason = 'empty';
            }
          }

          fileEntriesMap.set(filePath, entry);
        }
      } catch (err) {
        attributionNotes.push(`Could not inspect verified commit ${verifiedCommit}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Working tree staged changes
    for (const stagedFile of currentStatus.stagedFiles) {
      if (fileEntriesMap.has(stagedFile)) continue;

      const isUncertain = Boolean(boundary && !boundary.start.isClean && boundary.start.stagedFiles.includes(stagedFile));
      const entry: FileDiffEntry = {
        path: stagedFile,
        changeType: 'modified',
        additions: 0,
        deletions: 0,
        isStaged: true,
        isUntracked: false,
        provenance: isUncertain ? 'attribution-uncertain' : 'git-derived',
        attributionReason: isUncertain
          ? 'File was already staged at task start baseline.'
          : 'Staged change in Git working tree.',
      };

      if (isSensitiveFilePath(stagedFile)) {
        entry.omittedReason = 'sensitive_file';
      } else {
        try {
          const diffRes = await this.runGit(['diff', '--cached', '--', stagedFile], canonicalRepo, { allowNonZeroExit: true });
          if (diffRes.stdout.length > MAX_DIFF_SIZE_CHARS) {
            entry.omittedReason = 'large_file';
          } else if (diffRes.stdout.includes('Binary files')) {
            entry.omittedReason = 'binary';
          } else if (containsSensitiveSecrets(diffRes.stdout)) {
            entry.omittedReason = 'sensitive_file';
          } else {
            const parsed = this.parseUnifiedDiff(diffRes.stdout);
            entry.diff = diffRes.stdout;
            entry.hunks = parsed.hunks;
            entry.additions = parsed.additions;
            entry.deletions = parsed.deletions;
            if (!entry.diff.trim()) entry.omittedReason = 'empty';
          }
        } catch {
          entry.omittedReason = 'empty';
        }
      }

      fileEntriesMap.set(stagedFile, entry);
    }

    // 3. Working tree unstaged changes
    for (const unstagedFile of currentStatus.unstagedFiles) {
      if (fileEntriesMap.has(unstagedFile)) continue;

      const isUncertain = Boolean(boundary && !boundary.start.isClean && boundary.start.unstagedFiles.includes(unstagedFile));
      const entry: FileDiffEntry = {
        path: unstagedFile,
        changeType: 'modified',
        additions: 0,
        deletions: 0,
        isStaged: false,
        isUntracked: false,
        provenance: isUncertain ? 'attribution-uncertain' : 'git-derived',
        attributionReason: isUncertain
          ? 'File was already unstaged at task start baseline.'
          : 'Unstaged modification in Git working tree.',
      };

      if (isSensitiveFilePath(unstagedFile)) {
        entry.omittedReason = 'sensitive_file';
      } else {
        try {
          const diffRes = await this.runGit(['diff', '--', unstagedFile], canonicalRepo, { allowNonZeroExit: true });
          if (diffRes.stdout.length > MAX_DIFF_SIZE_CHARS) {
            entry.omittedReason = 'large_file';
          } else if (diffRes.stdout.includes('Binary files')) {
            entry.omittedReason = 'binary';
          } else if (containsSensitiveSecrets(diffRes.stdout)) {
            entry.omittedReason = 'sensitive_file';
          } else {
            const parsed = this.parseUnifiedDiff(diffRes.stdout);
            entry.diff = diffRes.stdout;
            entry.hunks = parsed.hunks;
            entry.additions = parsed.additions;
            entry.deletions = parsed.deletions;
            if (!entry.diff.trim()) entry.omittedReason = 'empty';
          }
        } catch {
          entry.omittedReason = 'empty';
        }
      }

      fileEntriesMap.set(unstagedFile, entry);
    }

    // 4. Untracked files
    for (const untrackedFile of currentStatus.untrackedFiles) {
      if (fileEntriesMap.has(untrackedFile)) continue;

      const isUncertain = Boolean(boundary && !boundary.start.isClean && boundary.start.untrackedFiles.includes(untrackedFile));
      const entry: FileDiffEntry = {
        path: untrackedFile,
        changeType: 'untracked',
        additions: 0,
        deletions: 0,
        isStaged: false,
        isUntracked: true,
        provenance: isUncertain ? 'attribution-uncertain' : 'git-derived',
        attributionReason: isUncertain
          ? 'File was already untracked at task start baseline.'
          : 'Untracked new file created in working tree.',
      };

      if (isSensitiveFilePath(untrackedFile)) {
        entry.omittedReason = 'sensitive_file';
      } else {
        const untrackedDiff = await this.formatUntrackedFileDiff(canonicalRepo, untrackedFile);
        entry.diff = untrackedDiff.diff;
        entry.hunks = untrackedDiff.hunks;
        entry.additions = untrackedDiff.additions;
        entry.deletions = untrackedDiff.deletions;
        entry.omittedReason = untrackedDiff.omittedReason;
      }

      fileEntriesMap.set(untrackedFile, entry);
    }

    // 5. Antigravity-reported changed files not present in Git changes
    const reportedFiles: string[] = (task.payload as any)?.executionDetails?.changedFiles || [];
    for (const repFile of reportedFiles) {
      if (!fileEntriesMap.has(repFile)) {
        fileEntriesMap.set(repFile, {
          path: repFile,
          changeType: 'modified',
          additions: 0,
          deletions: 0,
          isStaged: false,
          isUntracked: false,
          provenance: 'antigravity-reported',
          attributionReason: 'Reported by Antigravity telemetry, but no corresponding Git diff was detected in current working tree or commit.',
          omittedReason: 'empty',
        });
      }
    }

    const files = Array.from(fileEntriesMap.values());

    let totalAdditions = 0;
    let totalDeletions = 0;
    let stagedCount = 0;
    let unstagedCount = 0;
    let untrackedCount = 0;
    let uncertainCount = 0;

    for (const f of files) {
      totalAdditions += f.additions;
      totalDeletions += f.deletions;
      if (f.isStaged) stagedCount++;
      if (!f.isStaged && !f.isUntracked) unstagedCount++;
      if (f.isUntracked) untrackedCount++;
      if (f.provenance === 'attribution-uncertain') uncertainCount++;
    }

    return {
      taskId: task.id,
      taskTitle: task.title,
      taskStatus: task.status,
      projectId: project.id,
      sessionId: session.id,
      repositoryPath: canonicalRepo,
      branch: currentStatus.branch,
      startHead: boundary?.start.head || null,
      endHead: boundary?.end?.head || null,
      currentHead: currentStatus.head,
      isCleanAtStart: boundary?.start.isClean ?? false,
      isCleanAtEnd: boundary?.end?.isClean ?? currentStatus.isClean,
      repositoryChangedSinceCompletion,
      attributionConfidence,
      attributionNotes,
      reportedCommitHash: boundary?.reportedCommitHash || null,
      verifiedCommitHash: boundary?.verifiedCommitHash || null,
      commitMetadata,
      files,
      summary: {
        totalFiles: files.length,
        totalAdditions,
        totalDeletions,
        stagedCount,
        unstagedCount,
        untrackedCount,
        uncertainCount,
      },
    };
  }

  /**
   * Retrieves diff for a single file within a task with strict bounds and security validation.
   */
  public async getFileDiff(taskId: string, filePath: string): Promise<FileDiffEntry> {
    const taskDiff = await this.getTaskDiff(taskId);
    validateRelativeFilePath(filePath, taskDiff.repositoryPath);

    const found = taskDiff.files.find((f) => f.path === filePath);
    if (found) {
      return found;
    }

    throw new Error(`File "${filePath}" is not among the changes detected for task "${taskId}".`);
  }
}
