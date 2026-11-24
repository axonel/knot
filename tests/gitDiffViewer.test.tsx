import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GitDiffViewer } from '../src/renderer/components/Workspace/GitDiffViewer.js';
import type { TaskGitInspectionResult } from '../src/shared/types.js';

describe('GitDiffViewer UI Component', () => {
  const mockOnClose = vi.fn();

  const sampleInspection: TaskGitInspectionResult = {
    taskId: 'task-123',
    taskTitle: 'Implement User Authentication',
    taskStatus: 'completed',
    projectId: 'proj-1',
    sessionId: 'sess-1',
    repositoryPath: '/home/user/project',
    branch: 'feature/auth',
    startHead: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    endHead: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    currentHead: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    isCleanAtStart: true,
    isCleanAtEnd: true,
    repositoryChangedSinceCompletion: false,
    verifiedCommitHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    attributionConfidence: 'high',
    attributionNotes: ['Clean working tree at task dispatch with verified commit.'],
    summary: {
      totalFiles: 3,
      totalAdditions: 45,
      totalDeletions: 12,
      stagedCount: 0,
      unstagedCount: 3,
      untrackedCount: 0,
      uncertainCount: 0,
    },
    files: [
      {
        path: 'src/auth/jwt.ts',
        changeType: 'added',
        isStaged: false,
        isUntracked: false,
        additions: 30,
        deletions: 0,
        provenance: 'git-derived',
        hunks: [
          {
            header: '@@ -0,0 +1,3 @@',
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 3,
            lines: [
              { type: 'addition', content: 'export function signToken() {', newLineNumber: 1 },
              { type: 'addition', content: '  return "jwt-token";', newLineNumber: 2 },
              { type: 'addition', content: '}', newLineNumber: 3 },
            ],
          },
        ],
      },
      {
        path: 'src/config.ts',
        changeType: 'modified',
        isStaged: false,
        isUntracked: false,
        additions: 15,
        deletions: 2,
        provenance: 'git-derived',
        hunks: [
          {
            header: '@@ -10,3 +10,4 @@',
            oldStart: 10,
            oldLines: 3,
            newStart: 10,
            newLines: 4,
            lines: [
              { type: 'context', content: 'export const config = {', oldLineNumber: 10, newLineNumber: 10 },
              { type: 'deletion', content: '  jwtSecret: "old-secret",', oldLineNumber: 11 },
              { type: 'addition', content: '  jwtSecret: process.env.JWT_SECRET,', newLineNumber: 11 },
              { type: 'context', content: '};', oldLineNumber: 12, newLineNumber: 12 },
            ],
          },
        ],
      },
      {
        path: 'src/legacyAuth.ts',
        changeType: 'deleted',
        isStaged: false,
        isUntracked: false,
        additions: 0,
        deletions: 10,
        provenance: 'git-derived',
        hunks: [
          {
            header: '@@ -1,2 +0,0 @@',
            oldStart: 1,
            oldLines: 2,
            newStart: 0,
            newLines: 0,
            lines: [
              { type: 'deletion', content: 'export function legacyLogin() {}', oldLineNumber: 1 },
              { type: 'deletion', content: 'export function legacyLogout() {}', oldLineNumber: 2 },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).knotApi = {
      git: {
        getTaskDiff: vi.fn().mockResolvedValue(sampleInspection),
        getFileDiff: vi.fn(),
        getRepoStatus: vi.fn(),
      },
    };
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders loading state initially while diff is fetching', () => {
    (window as any).knotApi.git.getTaskDiff = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);
    expect(screen.getByText('Inspecting Git changes & calculating task attribution...')).toBeInTheDocument();
  });

  it('renders error state when diff inspection fails', async () => {
    (window as any).knotApi.git.getTaskDiff = vi.fn().mockRejectedValue(new Error('Repository not found'));

    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Git Inspection Failed')).toBeInTheDocument();
      expect(screen.getByText('Repository not found')).toBeInTheDocument();
    });
  });

  it('renders task header metadata and attribution badge', async () => {
    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Implement User Authentication/)).toBeInTheDocument();
      expect(screen.getByText('feature/auth')).toBeInTheDocument();
      expect(screen.getByText('a1b2c3d4')).toBeInTheDocument();
      expect(screen.getByText('Likely Task-Derived (Clean Baseline)')).toBeInTheDocument();
    });
  });

  it('copies commit hash when copy button is clicked', async () => {
    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('a1b2c3d4')).toBeInTheDocument();
    });

    const copyBtn = screen.getByTitle('Copy commit hash');
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
  });

  it('displays repository drift warning when repositoryChangedSinceCompletion is true', async () => {
    const driftedInspection: TaskGitInspectionResult = {
      ...sampleInspection,
      repositoryChangedSinceCompletion: true,
      attributionConfidence: 'low',
    };
    (window as any).knotApi.git.getTaskDiff = vi.fn().mockResolvedValue(driftedInspection);

    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Repository state moved:/)).toBeInTheDocument();
      expect(screen.getByText('Attribution Uncertain (Dirty Baseline)')).toBeInTheDocument();
    });
  });

  it('renders changed files list with additions and deletions', async () => {
    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTitle('src/auth/jwt.ts')).toBeInTheDocument();
      expect(screen.getByTitle('src/config.ts')).toBeInTheDocument();
      expect(screen.getByTitle('src/legacyAuth.ts')).toBeInTheDocument();
    });
  });

  it('switches active file and displays unified diff hunks with line numbers', async () => {
    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTitle('src/config.ts')).toBeInTheDocument();
    });

    // Click src/config.ts button in sidebar
    fireEvent.click(screen.getByTitle('src/config.ts'));

    await waitFor(() => {
      expect(screen.getByText(/jwtSecret: process\.env\.JWT_SECRET/)).toBeInTheDocument();
      expect(screen.getByText(/jwtSecret: "old-secret"/)).toBeInTheDocument();
    });
  });

  it('filters files using the search input', async () => {
    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTitle('src/auth/jwt.ts')).toBeInTheDocument();
      expect(screen.getByTitle('src/config.ts')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Filter changed files...');
    fireEvent.change(searchInput, { target: { value: 'jwt' } });

    expect(screen.getByTitle('src/auth/jwt.ts')).toBeInTheDocument();
    expect(screen.queryByTitle('src/config.ts')).not.toBeInTheDocument();
    expect(screen.queryByTitle('src/legacyAuth.ts')).not.toBeInTheDocument();
  });

  it('filters files using filter chips including staged and unstaged', async () => {
    const stagedUnstagedInspection: TaskGitInspectionResult = {
      ...sampleInspection,
      summary: {
        totalFiles: 3,
        totalAdditions: 45,
        totalDeletions: 12,
        stagedCount: 1,
        unstagedCount: 2,
        untrackedCount: 0,
        uncertainCount: 0,
      },
      files: [
        {
          path: 'src/staged.ts',
          changeType: 'added',
          isStaged: true,
          isUntracked: false,
          additions: 10,
          deletions: 0,
          provenance: 'git-derived',
          hunks: [],
        },
        {
          path: 'src/unstaged.ts',
          changeType: 'modified',
          isStaged: false,
          isUntracked: false,
          additions: 5,
          deletions: 1,
          provenance: 'git-derived',
          hunks: [],
        },
        {
          path: 'src/deleted.ts',
          changeType: 'deleted',
          isStaged: false,
          isUntracked: false,
          additions: 0,
          deletions: 8,
          provenance: 'git-derived',
          hunks: [],
        },
      ],
    };
    (window as any).knotApi.git.getTaskDiff = vi.fn().mockResolvedValue(stagedUnstagedInspection);

    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTitle('src/staged.ts')).toBeInTheDocument();
    });

    // Test Staged filter
    const stagedChip = screen.getByRole('button', { name: /^Staged \(/i });
    fireEvent.click(stagedChip);
    expect(screen.getByTitle('src/staged.ts')).toBeInTheDocument();
    expect(screen.queryByTitle('src/unstaged.ts')).not.toBeInTheDocument();

    // Test Unstaged filter
    const unstagedChip = screen.getByRole('button', { name: /^Unstaged \(/i });
    fireEvent.click(unstagedChip);
    expect(screen.getByTitle('src/unstaged.ts')).toBeInTheDocument();
    expect(screen.queryByTitle('src/staged.ts')).not.toBeInTheDocument();

    // Click "Deleted" filter chip
    const deletedChip = screen.getByRole('button', { name: /^Deleted$/i });
    fireEvent.click(deletedChip);

    expect(screen.getByTitle('src/deleted.ts')).toBeInTheDocument();
    expect(screen.queryByTitle('src/staged.ts')).not.toBeInTheDocument();
    expect(screen.queryByTitle('src/unstaged.ts')).not.toBeInTheDocument();
  });

  it('renders sensitive file omission banner when omittedReason is sensitive_file', async () => {
    const sensitiveInspection: TaskGitInspectionResult = {
      ...sampleInspection,
      files: [
        {
          path: '.env.local',
          changeType: 'modified',
          isStaged: false,
          isUntracked: false,
          additions: 2,
          deletions: 0,
          provenance: 'git-derived',
          omittedReason: 'sensitive_file',
        },
      ],
    };
    (window as any).knotApi.git.getTaskDiff = vi.fn().mockResolvedValue(sensitiveInspection);

    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Diff Omitted for Security')).toBeInTheDocument();
      expect(screen.getByText(/Diff omitted: File may contain sensitive credentials or secrets\./)).toBeInTheDocument();
    });
  });

  it('renders binary file omission banner when omittedReason is binary', async () => {
    const binaryInspection: TaskGitInspectionResult = {
      ...sampleInspection,
      files: [
        {
          path: 'assets/logo.png',
          changeType: 'added',
          isStaged: false,
          isUntracked: false,
          additions: 0,
          deletions: 0,
          provenance: 'git-derived',
          omittedReason: 'binary',
        },
      ],
    };
    (window as any).knotApi.git.getTaskDiff = vi.fn().mockResolvedValue(binaryInspection);

    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Binary File')).toBeInTheDocument();
      expect(screen.getByText(/Diff omitted: Binary file detected\./)).toBeInTheDocument();
    });
  });

  it('renders clean empty state when no changes were detected', async () => {
    const emptyInspection: TaskGitInspectionResult = {
      ...sampleInspection,
      summary: {
        totalFiles: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        uncertainCount: 0,
      },
      files: [],
    };
    (window as any).knotApi.git.getTaskDiff = vi.fn().mockResolvedValue(emptyInspection);

    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('No Git Changes Detected')).toBeInTheDocument();
      expect(screen.getByText(/This task produced no committed or working-tree file modifications\./)).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    render(<GitDiffViewer taskId="task-123" onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Implement User Authentication/)).toBeInTheDocument();
    });

    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
