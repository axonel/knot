import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedTimelinePanel } from '../src/renderer/components/Workspace/UnifiedTimelinePanel.js';
import type { Project, Session, EventItem, TaskExecutionTrace } from '../src/shared/types.js';

describe('UnifiedTimelinePanel UI Component', () => {
  const mockProject: Project = {
    id: 'proj-1',
    name: 'Sample Project',
    repositoryPath: '/mock/repo',
    repositoryRemote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
  };

  const mockSession: Session = {
    id: 'sess-1',
    projectId: 'proj-1',
    title: 'Session Alpha',
    status: 'active',
    startedAt: null,
    endedAt: null,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEvents: EventItem[] = [
    {
      id: 'ev-1',
      projectId: 'proj-1',
      sessionId: 'sess-1',
      taskId: 'task-1',
      eventType: 'task_assigned',
      actor: 'chatgpt',
      source: 'chatgpt_bridge',
      provenance: 'chatgpt_reported',
      title: 'ChatGPT Task Assignment',
      severity: 'info',
      data: { instructions: 'Build timeline' },
      timestamp: '2026-11-26T12:00:00.000Z',
      createdAt: '2026-11-26T12:00:00.000Z',
    },
    {
      id: 'ev-2',
      projectId: 'proj-1',
      sessionId: 'sess-1',
      taskId: 'task-1',
      eventType: 'antigravity_tool_started',
      actor: 'antigravity',
      source: 'antigravity_cli',
      provenance: 'antigravity_reported',
      title: 'Antigravity Tool: write_to_file',
      severity: 'info',
      data: { file: 'index.ts' },
      timestamp: '2026-11-26T12:01:00.000Z',
      createdAt: '2026-11-26T12:01:00.000Z',
    },
    {
      id: 'ev-3',
      projectId: 'proj-1',
      sessionId: 'sess-1',
      taskId: 'task-1',
      eventType: 'git_boundary_captured',
      actor: 'git',
      source: 'local_git',
      provenance: 'git_verified',
      title: 'Git Baseline Captured',
      severity: 'info',
      data: { isClean: true },
      timestamp: '2026-11-26T12:02:00.000Z',
      createdAt: '2026-11-26T12:02:00.000Z',
    },
    {
      id: 'ev-4',
      projectId: 'proj-1',
      sessionId: 'sess-1',
      taskId: null,
      eventType: 'context_updated',
      actor: 'user',
      source: 'context_vault',
      provenance: 'user_recorded',
      title: 'Context Document Updated',
      severity: 'info',
      data: { docId: 'ctx-1' },
      timestamp: '2026-11-26T12:03:00.000Z',
      createdAt: '2026-11-26T12:03:00.000Z',
    },
  ];

  const mockTaskTrace: TaskExecutionTrace = {
    task: {
      id: 'task-1',
      sessionId: 'sess-1',
      title: 'Build Timeline Feature',
      description: 'Build timeline UI',
      createdBy: 'chatgpt',
      assignedTo: 'antigravity',
      status: 'succeeded',
      priority: 'high',
      executionMode: 'default',
      approvalStatus: 'approved',
      dispatchedAt: '2026-11-26T12:00:10.000Z',
      startedAt: '2026-11-26T12:00:10.000Z',
      completedAt: '2026-11-26T12:02:00.000Z',
      createdAt: '2026-11-26T12:00:00.000Z',
      updatedAt: '2026-11-26T12:02:00.000Z',
      payload: null,
    },
    events: mockEvents.slice(0, 3),
    stages: [
      {
        name: 'assignment',
        label: '1. Task Assignment',
        description: 'ChatGPT formulation',
        events: [mockEvents[0]],
        status: 'completed',
      },
      {
        name: 'queue',
        label: '2. Task Queue',
        description: 'Queue scheduling',
        events: [],
        status: 'completed',
      },
      {
        name: 'approval',
        label: '3. Safety & Approval',
        description: 'Human approval',
        events: [],
        status: 'completed',
      },
      {
        name: 'execution',
        label: '4. Antigravity Execution',
        description: 'CLI actions',
        events: [mockEvents[1]],
        status: 'completed',
      },
      {
        name: 'git',
        label: '5. Git Repository Baseline & Verification',
        description: 'Git changes',
        events: [mockEvents[2]],
        status: 'completed',
      },
      {
        name: 'completion',
        label: '6. Result Publication & Completion',
        description: 'Completion',
        events: [],
        status: 'completed',
      },
      {
        name: 'verification',
        label: '7. ChatGPT Verification',
        description: 'Subsequent review',
        events: [],
        status: 'pending',
      },
    ],
    summary: {
      taskId: 'task-1',
      taskTitle: 'Build Timeline Feature',
      status: 'succeeded',
      priority: 'high',
      executionMode: 'default',
      assignedAt: '2026-11-26T12:00:00.000Z',
      dispatchedAt: '2026-11-26T12:00:10.000Z',
      completedAt: '2026-11-26T12:02:00.000Z',
      totalDurationMs: 110000,
      queueDurationMs: 10000,
      executionDurationMs: 100000,
      isApproved: true,
      approver: 'Developer Alice',
      hasGitVerification: true,
      verifiedCommit: '1234567890abcdef',
      hasChatGptVerification: false,
      chatGptVerificationSummary: null,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    window.knotApi = {
      events: {
        list: vi.fn().mockResolvedValue(mockEvents),
        append: vi.fn(),
        getTaskTrace: vi.fn().mockResolvedValue(mockTaskTrace),
        exportTaskTrace: vi.fn().mockResolvedValue('# Mock Export Trace Content'),
      },
      orchestration: {
        listTasks: vi.fn().mockResolvedValue([mockTaskTrace.task]),
      },
    } as any;
  });

  it('renders Session Timeline view and displays events with provenance badges', async () => {
    render(
      <UnifiedTimelinePanel
        project={mockProject}
        session={mockSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Unified Execution Timeline')).toBeInTheDocument();
    });

    expect(screen.getByText('ChatGPT Task Assignment')).toBeInTheDocument();
    expect(screen.getByText('Antigravity Tool: write_to_file')).toBeInTheDocument();
    expect(screen.getByText('Git Baseline Captured')).toBeInTheDocument();
    expect(screen.getByText('Context Document Updated')).toBeInTheDocument();

    // Verify explicit provenance badges
    expect(screen.getByText('ChatGPT Reported')).toBeInTheDocument();
    expect(screen.getByText('Antigravity Reported')).toBeInTheDocument();
    expect(screen.getByText('Git Verified')).toBeInTheDocument();
    expect(screen.getByText('User Action')).toBeInTheDocument();
  });

  it('filters events by actor and search text query', async () => {
    render(
      <UnifiedTimelinePanel
        project={mockProject}
        session={mockSession}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('ChatGPT Task Assignment')).toBeInTheDocument();
    });

    // Click on Antigravity actor filter chip
    const antigravityChip = screen.getByRole('button', { name: 'ANTIGRAVITY' });
    fireEvent.click(antigravityChip);

    // Only Antigravity events should remain visible
    expect(screen.getByText('Antigravity Tool: write_to_file')).toBeInTheDocument();
    expect(screen.queryByText('ChatGPT Task Assignment')).not.toBeInTheDocument();
    expect(screen.queryByText('Git Baseline Captured')).not.toBeInTheDocument();

    // Reset to All
    const allChip = screen.getAllByRole('button', { name: 'All' })[0];
    fireEvent.click(allChip);
    expect(screen.getByText('ChatGPT Task Assignment')).toBeInTheDocument();

    // Search query
    const searchInput = screen.getByPlaceholderText(/Search events/i);
    fireEvent.change(searchInput, { target: { value: 'Baseline' } });

    expect(screen.getByText('Git Baseline Captured')).toBeInTheDocument();
    expect(screen.queryByText('ChatGPT Task Assignment')).not.toBeInTheDocument();
  });

  it('switches to Task Execution Trace view showing 7 lifecycle stages and metrics', async () => {
    render(
      <UnifiedTimelinePanel
        project={mockProject}
        session={mockSession}
        initialTaskId="task-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Build Timeline Feature')).toBeInTheDocument();
    });

    // Check task header metrics
    expect(screen.getByText('Developer Alice')).toBeInTheDocument();
    expect(screen.getByText('12345678')).toBeInTheDocument(); // Short commit hash

    // Verify stages are rendered
    expect(screen.getByText('1. Task Assignment')).toBeInTheDocument();
    expect(screen.getByText('2. Task Queue')).toBeInTheDocument();
    expect(screen.getByText('3. Safety & Approval')).toBeInTheDocument();
    expect(screen.getByText('4. Antigravity Execution')).toBeInTheDocument();
    expect(screen.getByText('5. Git Repository Baseline & Verification')).toBeInTheDocument();
    expect(screen.getByText('6. Result Publication & Completion')).toBeInTheDocument();
    expect(screen.getByText('7. ChatGPT Verification')).toBeInTheDocument();
  });

  it('opens Export modal when Export MD button is clicked', async () => {
    render(
      <UnifiedTimelinePanel
        project={mockProject}
        session={mockSession}
        initialTaskId="task-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Export MD')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Export MD'));

    await waitFor(() => {
      expect(screen.getByText(/Export Task Trace \(MARKDOWN\)/i)).toBeInTheDocument();
    });

    expect(screen.getByText('# Mock Export Trace Content')).toBeInTheDocument();
    expect(screen.getByText('Copy to Clipboard')).toBeInTheDocument();
    expect(screen.getByText('Download File')).toBeInTheDocument();
  });
});
