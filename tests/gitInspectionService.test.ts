import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createDatabaseService, type DatabaseService } from '../src/main/database/index.js';
import { GitService } from '../src/main/git/gitService.js';
import {
  validateRepositoryPath,
  validateRelativeFilePath,
  validateCommitHash,
} from '../src/main/git/gitSecurity.js';

describe('Read-Only Git Inspection Service & Security', () => {
  let tempDirs: string[] = [];
  let dbService: DatabaseService;
  let gitService: GitService;

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `knot-git-${prefix}-`));
    tempDirs.push(dir);
    return dir;
  }

  function createTempGitRepo(name = 'repo'): string {
    const dir = createTempDir(name);
    execSync('git init -b main', { cwd: dir });
    execSync('git config user.name "Knot Test"', { cwd: dir });
    execSync('git config user.email "test@knot.local"', { cwd: dir });

    // Initial commit so HEAD is valid
    fs.writeFileSync(path.join(dir, 'README.md'), '# Test Project\nInitial documentation.\n');
    execSync('git add README.md', { cwd: dir });
    execSync('git commit -m "Initial commit"', { cwd: dir });

    return dir;
  }

  beforeEach(() => {
    tempDirs = [];
    const dbDir = createTempDir('db');
    dbService = createDatabaseService(path.join(dbDir, 'test.sqlite'));
    gitService = new GitService(dbService);
  });

  afterEach(() => {
    try {
      dbService.close();
    } catch {
      // ignore
    }
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tempDirs = [];
  });

  // 1. Clean repository status
  it('1. detects clean repository status, branch, and HEAD commit', async () => {
    const repo = createTempGitRepo('clean');
    const status = await gitService.getRepoStatus(repo);

    expect(status.isClean).toBe(true);
    expect(status.branch).toBe('main');
    expect(status.head).toMatch(/^[0-9a-f]{40}$/);
    expect(status.stagedFiles).toEqual([]);
    expect(status.unstagedFiles).toEqual([]);
    expect(status.untrackedFiles).toEqual([]);
  });

  // 2. Modified tracked file
  it('2. detects unstaged modified tracked file', async () => {
    const repo = createTempGitRepo('mod');
    fs.appendFileSync(path.join(repo, 'README.md'), 'Modified line.\n');

    const status = await gitService.getRepoStatus(repo);
    expect(status.isClean).toBe(false);
    expect(status.unstagedFiles).toContain('README.md');
    expect(status.stagedFiles).toEqual([]);
  });

  // 3. Added tracked file (staged new file)
  it('3. detects added tracked file in staging area', async () => {
    const repo = createTempGitRepo('add');
    fs.writeFileSync(path.join(repo, 'src.ts'), 'export const x = 1;\n');
    execSync('git add src.ts', { cwd: repo });

    const status = await gitService.getRepoStatus(repo);
    expect(status.isClean).toBe(false);
    expect(status.stagedFiles).toContain('src.ts');
    expect(status.unstagedFiles).toEqual([]);
  });

  // 4. Deleted tracked file
  it('4. detects deleted tracked file', async () => {
    const repo = createTempGitRepo('del');
    fs.unlinkSync(path.join(repo, 'README.md'));

    const status = await gitService.getRepoStatus(repo);
    expect(status.isClean).toBe(false);
    expect(status.unstagedFiles).toContain('README.md');
  });

  // 5. Untracked file
  it('5. detects untracked files', async () => {
    const repo = createTempGitRepo('untracked');
    fs.writeFileSync(path.join(repo, 'scratch.txt'), 'Scratch notes\n');

    const status = await gitService.getRepoStatus(repo);
    expect(status.isClean).toBe(false);
    expect(status.untrackedFiles).toContain('scratch.txt');
  });

  // 6. Staged and unstaged changes
  it('6. categorizes staged and unstaged changes simultaneously', async () => {
    const repo = createTempGitRepo('mixed');
    fs.writeFileSync(path.join(repo, 'staged.txt'), 'Staged content\n');
    execSync('git add staged.txt', { cwd: repo });

    fs.appendFileSync(path.join(repo, 'README.md'), 'Worktree change\n');
    fs.writeFileSync(path.join(repo, 'untracked.txt'), 'Untracked\n');

    const status = await gitService.getRepoStatus(repo);
    expect(status.isClean).toBe(false);
    expect(status.stagedFiles).toContain('staged.txt');
    expect(status.unstagedFiles).toContain('README.md');
    expect(status.untrackedFiles).toContain('untracked.txt');
  });

  // 7. Commit-specific diff retrieval
  it('7. retrieves commit-specific diff and parses unified diff hunks', async () => {
    const repo = createTempGitRepo('commit-diff');
    fs.writeFileSync(path.join(repo, 'feature.ts'), 'export function hello() {\n  return "world";\n}\n');
    execSync('git add feature.ts', { cwd: repo });
    execSync('git commit -m "Add feature function"', { cwd: repo });

    const commitHash = execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf8' }).trim();

    // Setup dummy project & task in DB
    const project = dbService.projects.create({ name: 'Proj', repositoryPath: repo });
    const session = dbService.sessions.create({ projectId: project.id, title: 'Session 1' });
    const task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Implement feature',
      gitBoundary: {
        taskId: 't-1',
        start: { head: 'initial', branch: 'main', isClean: true, stagedFiles: [], unstagedFiles: [], untrackedFiles: [] },
        end: { head: commitHash, branch: 'main', isClean: true, stagedFiles: [], unstagedFiles: [], untrackedFiles: [] },
        reportedCommitHash: commitHash,
        verifiedCommitHash: commitHash,
        capturedAtStart: new Date().toISOString(),
        capturedAtEnd: new Date().toISOString(),
      },
    });

    const diffResult = await gitService.getTaskDiff(task.id);
    expect(diffResult.taskId).toBe(task.id);
    expect(diffResult.verifiedCommitHash).toBe(commitHash);
    expect(diffResult.commitMetadata?.message).toBe('Add feature function');

    const file = diffResult.files.find((f) => f.path === 'feature.ts');
    expect(file).toBeDefined();
    expect(file?.provenance).toBe('git-derived');
    expect(file?.additions).toBeGreaterThan(0);
    expect(file?.hunks && file.hunks.length).toBeGreaterThan(0);
  });

  // 8. Clean task baseline attribution
  it('8. attributes changes with high confidence when task baseline is clean', async () => {
    const repo = createTempGitRepo('clean-baseline');
    const startStatus = await gitService.getRepoStatus(repo);
    expect(startStatus.isClean).toBe(true);

    const project = dbService.projects.create({ name: 'CleanProj', repositoryPath: repo });
    const session = dbService.sessions.create({ projectId: project.id, title: 'Session' });

    // Task boundary start on clean repo
    const boundaryStart = await gitService.captureTaskBoundaryStart('t-clean', repo);
    expect(boundaryStart.start.isClean).toBe(true);

    // Make edits during task
    fs.writeFileSync(path.join(repo, 'task-work.ts'), 'const a = 100;\n');
    execSync('git add task-work.ts', { cwd: repo });

    const boundaryEnd = await gitService.captureTaskBoundaryEnd(boundaryStart, repo, null);
    const task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Clean task',
      gitBoundary: boundaryEnd,
    });

    const inspection = await gitService.getTaskDiff(task.id);
    expect(inspection.attributionConfidence).toBe('high');
    expect(inspection.isCleanAtStart).toBe(true);
    const file = inspection.files.find((f) => f.path === 'task-work.ts');
    expect(file?.provenance).toBe('git-derived');
  });

  // 9. Dirty task baseline attribution
  it('9. marks attribution uncertain when task baseline was dirty at dispatch', async () => {
    const repo = createTempGitRepo('dirty-baseline');
    // Pre-existing dirty changes
    fs.writeFileSync(path.join(repo, 'pre-existing.txt'), 'Uncommitted prior change\n');

    const project = dbService.projects.create({ name: 'DirtyProj', repositoryPath: repo });
    const session = dbService.sessions.create({ projectId: project.id, title: 'Session' });

    const boundaryStart = await gitService.captureTaskBoundaryStart('t-dirty', repo);
    expect(boundaryStart.start.isClean).toBe(false);

    // Task completes
    const boundaryEnd = await gitService.captureTaskBoundaryEnd(boundaryStart, repo, null);
    const task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Dirty task',
      gitBoundary: boundaryEnd,
    });

    const inspection = await gitService.getTaskDiff(task.id);
    expect(inspection.attributionConfidence).toBe('low');
    expect(inspection.isCleanAtStart).toBe(false);

    const file = inspection.files.find((f) => f.path === 'pre-existing.txt');
    expect(file?.provenance).toBe('attribution-uncertain');
    expect(file?.attributionReason).toContain('baseline');
  });

  // 10. Repository HEAD changed after task completion
  it('10. detects repository HEAD drift after task completion', async () => {
    const repo = createTempGitRepo('drift');
    const project = dbService.projects.create({ name: 'DriftProj', repositoryPath: repo });
    const session = dbService.sessions.create({ projectId: project.id, title: 'Session' });

    const boundaryStart = await gitService.captureTaskBoundaryStart('t-drift', repo);
    const boundaryEnd = await gitService.captureTaskBoundaryEnd(boundaryStart, repo, null);

    const task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Drift task',
      gitBoundary: boundaryEnd,
    });

    // Subsequent commit after task completed
    fs.writeFileSync(path.join(repo, 'subsequent.txt'), 'Post-task commit\n');
    execSync('git add subsequent.txt', { cwd: repo });
    execSync('git commit -m "Post-task commit"', { cwd: repo });

    const inspection = await gitService.getTaskDiff(task.id);
    expect(inspection.repositoryChangedSinceCompletion).toBe(true);
    expect(inspection.attributionNotes.some((n) => n.includes('changed since task completed'))).toBe(true);
  });

  // 11. Invalid commit hash
  it('11. rejects invalid commit hash formats and flag injection attempts', () => {
    expect(() => validateCommitHash('--version')).toThrow(/must not start with a dash/);
    expect(() => validateCommitHash('; rm -rf /')).toThrow(/Invalid commit hash/);
    expect(() => validateCommitHash('abc')).toThrow(/Invalid commit hash/);
    expect(() => validateCommitHash('HEAD; touch foo')).toThrow(/Invalid commit hash/);

    expect(validateCommitHash('a1b2c3d')).toBe('a1b2c3d');
    expect(validateCommitHash('HEAD')).toBe('HEAD');
    expect(validateCommitHash('HEAD~1')).toBe('HEAD~1');
  });

  // 12. Malicious path traversal attempts
  it('12. rejects relative file paths attempting directory traversal', () => {
    const repo = createTempGitRepo('traversal');
    expect(() => validateRelativeFilePath('../../../etc/passwd', repo)).toThrow(/Path traversal attempt/);
    expect(() => validateRelativeFilePath('foo/../../bar', repo)).toThrow(/Path traversal attempt/);
    expect(() => validateRelativeFilePath('/absolute/path', repo)).toThrow(/Path traversal attempt/);
    expect(() => validateRelativeFilePath('foo\0bar', repo)).toThrow(/null bytes/);
  });

  // 13. Symlink path escape attempts
  it('13. rejects symlinks pointing outside the repository root', () => {
    const repo = createTempGitRepo('symlink');
    const outsideDir = createTempDir('outside');
    const outsideFile = path.join(outsideDir, 'secret.txt');
    fs.writeFileSync(outsideFile, 'secret content');

    const symlinkPath = path.join(repo, 'symlink_escape');
    fs.symlinkSync(outsideFile, symlinkPath);

    expect(() => validateRelativeFilePath('symlink_escape', repo)).toThrow(/Symlink escape attempt/);
  });

  // 14. Binary file handling
  it('14. handles binary files and omits raw diff', async () => {
    const repo = createTempGitRepo('binary');
    const project = dbService.projects.create({ name: 'BinProj', repositoryPath: repo });
    const session = dbService.sessions.create({ projectId: project.id, title: 'Session' });

    // Create binary file with null byte
    const binBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]);
    fs.writeFileSync(path.join(repo, 'image.png'), binBuffer);
    execSync('git add image.png', { cwd: repo });

    const boundaryStart = await gitService.captureTaskBoundaryStart('t-bin', repo);
    const boundaryEnd = await gitService.captureTaskBoundaryEnd(boundaryStart, repo, null);
    const task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Binary task',
      gitBoundary: boundaryEnd,
    });

    const inspection = await gitService.getTaskDiff(task.id);
    const file = inspection.files.find((f) => f.path === 'image.png');
    expect(file).toBeDefined();
    expect(file?.omittedReason).toBe('binary');
  });

  // 15. Large diff limits
  it('15. omits diffs for files exceeding size threshold', async () => {
    const repo = createTempGitRepo('large-file');
    const project = dbService.projects.create({ name: 'LargeProj', repositoryPath: repo });
    const session = dbService.sessions.create({ projectId: project.id, title: 'Session' });

    // Create 300 KB file (exceeds 250 KB limit)
    const largeContent = 'A'.repeat(300_000);
    fs.writeFileSync(path.join(repo, 'huge.txt'), largeContent);

    const boundaryStart = await gitService.captureTaskBoundaryStart('t-large', repo);
    const boundaryEnd = await gitService.captureTaskBoundaryEnd(boundaryStart, repo, null);
    const task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Large task',
      gitBoundary: boundaryEnd,
    });

    const inspection = await gitService.getTaskDiff(task.id);
    const file = inspection.files.find((f) => f.path === 'huge.txt');
    expect(file).toBeDefined();
    expect(file?.omittedReason).toBe('large_file');
  });

  // 16. Missing Git executable
  it('16. throws clear error when git execution fails or command is invalid', async () => {
    const repo = createTempGitRepo('fail-cmd');
    await expect(gitService.runGit(['rev-parse', 'nonexistent-ref-12345'], repo)).rejects.toThrow(/failed with exit code/);
  });

  // 17. Inaccessible repository
  it('17. throws clear error on inaccessible repository or non-git directory', async () => {
    const nonGitDir = createTempDir('nongit');
    await expect(gitService.getRepoStatus(nonGitDir)).rejects.toThrow(/not a valid Git repository/);

    const missingDir = path.join(nonGitDir, 'missing_subdir');
    await expect(gitService.getRepoStatus(missingDir)).rejects.toThrow(/does not exist/);
  });

  // 18. Sensitive-file omission
  it('18. omits raw diff for sensitive files (.env, private keys, passwords)', async () => {
    const repo = createTempGitRepo('sensitive');
    const project = dbService.projects.create({ name: 'SensProj', repositoryPath: repo });
    const session = dbService.sessions.create({ projectId: project.id, title: 'Session' });

    fs.writeFileSync(path.join(repo, '.env'), 'DATABASE_PASSWORD=supersecret\nAPI_KEY=12345\n');
    fs.writeFileSync(path.join(repo, 'id_rsa'), '-----BEGIN OPENSSH PRIVATE KEY-----\nfakekey\n');

    const boundaryStart = await gitService.captureTaskBoundaryStart('t-sens', repo);
    const boundaryEnd = await gitService.captureTaskBoundaryEnd(boundaryStart, repo, null);
    const task = dbService.tasks.create({
      sessionId: session.id,
      title: 'Sensitive task',
      gitBoundary: boundaryEnd,
    });

    const inspection = await gitService.getTaskDiff(task.id);
    const envFile = inspection.files.find((f) => f.path === '.env');
    expect(envFile).toBeDefined();
    expect(envFile?.omittedReason).toBe('sensitive_file');
    expect(envFile?.diff).toBeUndefined();

    const keyFile = inspection.files.find((f) => f.path === 'id_rsa');
    expect(keyFile).toBeDefined();
    expect(keyFile?.omittedReason).toBe('sensitive_file');
    expect(keyFile?.diff).toBeUndefined();
  });

  // 19. Repository containing spaces in its path
  it('19. functions correctly in a repository with spaces in directory path', async () => {
    const parentDir = createTempDir('spaces parent');
    const repo = path.join(parentDir, 'my knot project');
    fs.mkdirSync(repo);

    execSync('git init -b main', { cwd: repo });
    execSync('git config user.name "Knot Test"', { cwd: repo });
    execSync('git config user.email "test@knot.local"', { cwd: repo });
    fs.writeFileSync(path.join(repo, 'space file.txt'), 'Content with space\n');
    execSync('git add "space file.txt"', { cwd: repo });
    execSync('git commit -m "Commit in space repo"', { cwd: repo });

    const status = await gitService.getRepoStatus(repo);
    expect(status.isClean).toBe(true);
    expect(status.branch).toBe('main');

    // Modify file
    fs.appendFileSync(path.join(repo, 'space file.txt'), 'More content\n');
    const dirtyStatus = await gitService.getRepoStatus(repo);
    expect(dirtyStatus.unstagedFiles).toContain('space file.txt');
  });

  // 20. Session/project isolation
  it('20. enforces project isolation and prevents cross-project access', async () => {
    const repoA = createTempGitRepo('repo-a');
    const repoB = createTempGitRepo('repo-b');

    const projectA = dbService.projects.create({ name: 'Project A', repositoryPath: repoA });
    const projectB = dbService.projects.create({ name: 'Project B', repositoryPath: repoB });
    expect(projectB.id).toBeDefined();

    const sessionA = dbService.sessions.create({ projectId: projectA.id, title: 'Session A' });
    const taskA = dbService.tasks.create({ sessionId: sessionA.id, title: 'Task in A' });

    // validateRepositoryPath rejects repoB if projectA is the expected root
    expect(() => validateRepositoryPath(repoB, repoA)).toThrow(/Access denied: repository path.*is outside registered path/);

    // File diff validation rejects attempts to request files from another repo
    await expect(gitService.getFileDiff(taskA.id, '../../repo-b/secret.txt')).rejects.toThrow(/Path traversal attempt/);
  });

  // 21. Non-mutation invariant
  it('21. strictly verifies that inspection does not mutate repository state or files', async () => {
    const repo = createTempGitRepo('non-mutation');

    // Setup working tree with various states
    fs.writeFileSync(path.join(repo, 'staged.txt'), 'Staged file\n');
    execSync('git add staged.txt', { cwd: repo });

    fs.appendFileSync(path.join(repo, 'README.md'), 'Unstaged edit\n');
    fs.writeFileSync(path.join(repo, 'untracked.txt'), 'Untracked file\n');

    const getFullRepoState = () => {
      const head = execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf8' }).trim();
      const status = execSync('git status --porcelain=v1', { cwd: repo, encoding: 'utf8' });
      const diff = execSync('git diff', { cwd: repo, encoding: 'utf8' });
      const stagedDiff = execSync('git diff --cached', { cwd: repo, encoding: 'utf8' });
      const files = fs.readdirSync(repo).sort();
      return { head, status, diff, stagedDiff, files };
    };

    const beforeState = getFullRepoState();

    const project = dbService.projects.create({ name: 'NonMutationProj', repositoryPath: repo });
    const session = dbService.sessions.create({ projectId: project.id, title: 'Session' });
    const task = dbService.tasks.create({ sessionId: session.id, title: 'Inspect task' });

    // Execute all inspection methods
    await gitService.getRepoStatus(repo);
    await gitService.getTaskDiff(task.id);
    await gitService.captureTaskBoundaryStart(task.id, repo);

    const afterState = getFullRepoState();

    expect(afterState.head).toBe(beforeState.head);
    expect(afterState.status).toBe(beforeState.status);
    expect(afterState.diff).toBe(beforeState.diff);
    expect(afterState.stagedDiff).toBe(beforeState.stagedDiff);
    expect(afterState.files).toEqual(beforeState.files);
  });
});
