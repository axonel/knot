import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CollaborationWorkspace } from '../src/renderer/components/Workspace/CollaborationWorkspace.js';
import { isEditableTarget } from '../src/renderer/utils/keyboardUtils.js';
import type { Project, Session, Task } from '../src/shared/types.js';

function createMockKnotApi(tasksOverride: Task[] = []) {
  const dummyProject: Project = {
    id: 'p-keyboard-1',
    name: 'Keyboard Test Project',
    repositoryPath: '/mock/repos/keyboard-test',
    repositoryRemote: 'git@github.com:axonel/knot.git',
    trustPolicy: 'approval_required',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
  };

  const dummySession: Session = {
    id: 's-keyboard-1',
    projectId: 'p-keyboard-1',
    title: 'Shortcuts Session',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    metadata: null,
  };

  const defaultTasks: Task[] = tasksOverride.length > 0 ? tasksOverride : [
    {
      id: 'task-awaiting-1',
      sessionId: dummySession.id,
      title: 'Awaiting User Approval Task',
      description: 'Run migrations and update models',
      createdBy: 'user',
      assignedTo: 'antigravity',
      status: 'awaiting_approval',
      priority: 'high',
      approvalStatus: 'awaiting_approval',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      acceptanceCriteria: ['Database tables created'],
    },
    {
      id: 'task-running-2',
      sessionId: dummySession.id,
      title: 'Currently Running Task',
      description: 'Linting codebase',
      createdBy: 'user',
      assignedTo: 'antigravity',
      status: 'running',
      priority: 'medium',
      approvalStatus: 'approved',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      acceptanceCriteria: [],
    },
  ];

  return {
    startDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    stopDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn().mockResolvedValue({
      state: 'Running' as const,
      connectionState: 'connected' as const,
      connectionVerified: true,
      pid: 1234,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      errorMessage: null,
    }),
    getLogs: vi.fn().mockResolvedValue([]),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn().mockReturnValue(vi.fn()),
    onLog: vi.fn().mockReturnValue(vi.fn()),
    projects: {
      list: vi.fn().mockResolvedValue([dummyProject]),
      get: vi.fn().mockResolvedValue(dummyProject),
      create: vi.fn().mockImplementation((d) => Promise.resolve({ id: 'p-new', ...d, trustPolicy: 'approval_required', createdAt: '', updatedAt: '', archivedAt: null })),
      update: vi.fn(),
      updateTrustPolicy: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      selectDirectory: vi.fn().mockResolvedValue('/mock/selected'),
    },
    sessions: {
      list: vi.fn().mockResolvedValue([dummySession]),
      get: vi.fn().mockResolvedValue(dummySession),
      create: vi.fn().mockImplementation((d) => Promise.resolve({ id: 's-new', ...d, status: 'active', createdAt: '', updatedAt: '', lastActivityAt: '', startedAt: '', endedAt: null, metadata: null })),
      updateStatus: vi.fn(),
      updateTitle: vi.fn(),
    },
    messages: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'm-1',
          sessionId: dummySession.id,
          sequence: 1,
          sender: 'chatgpt',
          recipient: 'knot',
          messageType: 'text',
          contentMarkdown: 'Testing desktop shortcuts.',
          createdAt: new Date().toISOString(),
        },
      ]),
      send: vi.fn(),
    },
    tasks: {
      list: vi.fn().mockResolvedValue(defaultTasks),
      create: vi.fn(),
      updateStatus: vi.fn(),
    },
    events: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'e-1',
          sessionId: dummySession.id,
          taskId: null,
          eventType: 'chatgpt_activity',
          actor: 'chatgpt',
          data: {
            category: 'architecture_decision',
            reference: 'src/renderer/App.tsx',
            summary: 'Reviewed Hyprland 960px split screen layout',
          },
          createdAt: new Date().toISOString(),
        },
      ]),
      append: vi.fn(),
    },
    bridge: {
      initSessionBridge: vi.fn().mockResolvedValue({
        projectDir: '/p',
        sessionDir: '/s',
        inboxDir: '/in',
        processedDir: '/proc',
        rejectedDir: '/rej',
        outboxDir: '/out',
        conversationFile: '/conv.md',
      }),
      getStatus: vi.fn().mockResolvedValue({
        workspaceInitialized: true,
        bridgeRoot: '/mock/bridge/v1',
        desktopCommanderRunning: true,
        mcpPermissionConfigured: true,
        handshakeState: 'verified',
        activeProjectId: dummyProject.id,
        activeSessionId: dummySession.id,
        lastInboundMessage: null,
        lastOutboundMessage: null,
      }),
      startHandshakeTest: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      getInstructions: vi.fn().mockResolvedValue('Instructions'),
    },
    orchestration: {
      listTasks: vi.fn().mockResolvedValue(defaultTasks),
      getRunningTask: vi.fn().mockImplementation(() => Promise.resolve(defaultTasks.find((t) => t.status === 'running') || null)),
      approveTask: vi.fn().mockResolvedValue({ ...defaultTasks[0], status: 'approved', approvalStatus: 'approved' }),
      approveAndDispatch: vi.fn(),
      rejectTask: vi.fn().mockResolvedValue(undefined),
      cancelTask: vi.fn().mockResolvedValue(undefined),
      retryTask: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    antigravity: {
      getStatus: vi.fn().mockResolvedValue({
        state: 'ready',
        installed: true,
        authenticated: true,
        activeSessionId: dummySession.id,
        activeTurnId: null,
        pid: 5678,
      }),
      startTurn: vi.fn(),
      interrupt: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      onUiEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    context: {
      list: vi.fn().mockResolvedValue([]),
      listConflicts: vi.fn().mockResolvedValue([]),
      getManifest: vi.fn().mockResolvedValue({ documents: [] }),
      resolveConflict: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      getRevisions: vi.fn().mockResolvedValue([]),
      getRevision: vi.fn(),
    },
  };
}

describe('P1 Desktop Workspace Keyboard Ergonomics', () => {
  let mockApi: ReturnType<typeof createMockKnotApi>;

  beforeEach(() => {
    mockApi = createMockKnotApi();
    (window as any).knotApi = mockApi;
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 900 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1. Switches workspace view between Conversation (1), Context Vault (2), and Timeline (3)', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Multi-Agent Workspace')).toBeInTheDocument();
      expect(screen.getByText('Conversation')).toBeInTheDocument();
    });

    // Press '2' to switch to Context Vault
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search documents...')).toBeInTheDocument();
    });

    // Press '3' to switch to Timeline
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search events, tools, commits...')).toBeInTheDocument();
    });

    // Press '1' to switch back to Conversation
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search documents...')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search events, tools, commits...')).not.toBeInTheDocument();
      expect(screen.getByText('Conversation')).toBeInTheDocument();
    });
  });

  it('2. Toggles ChatGPT Planner / Activity panel via Ctrl+B', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('ChatGPT-Reported Activity')).toBeInTheDocument();
    });

    const activityHeading = screen.getByText('ChatGPT-Reported Activity');
    const activityContainer = activityHeading.closest('.h-full.transition-all');
    expect(activityContainer).toHaveClass('opacity-100');

    // Press Ctrl+B to collapse Activity panel
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
    });

    expect(activityContainer).toHaveClass('opacity-0');

    // Press Ctrl+B again to restore Activity panel
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', ctrlKey: true, bubbles: true }));
    });

    expect(activityContainer).toHaveClass('opacity-100');
  });

  it('3. Respects hierarchical Esc dismissal priority (modals before drawers)', async () => {
    // Render in compact mode so drawers exist
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 960 });
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByTitle('Toggle ChatGPT Planner / Activity')).toBeInTheDocument();
    });

    // Open Activity drawer
    const activityBtn = screen.getByTitle('Toggle ChatGPT Planner / Activity');
    fireEvent.click(activityBtn);

    const activityDrawer = screen.getByText('ChatGPT Planner / Activity').closest('.absolute');
    expect(activityDrawer).toHaveClass('translate-x-0');

    // Open Reliability modal while drawer is open
    const reliabilityBtn = screen.getByTitle('Runtime Reliability & Recovery Diagnostics');
    fireEvent.click(reliabilityBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Runtime Reliability & State Reconciliation/i)).toBeInTheDocument();
    });

    // First Esc must close the Reliability modal, NOT the drawer
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Drawer should STILL be open
    expect(activityDrawer).toHaveClass('translate-x-0');

    // Second Esc closes the drawer
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(activityDrawer).toHaveClass('-translate-x-full');
  });

  it('4. Suppresses shortcuts when typing inside input or textarea elements', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search activities...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search activities...');
    searchInput.focus();

    // Verify isEditableTarget helper
    expect(isEditableTarget(searchInput)).toBe(true);

    // Typing '2' inside input should NOT switch to Context Vault
    act(() => {
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    });

    // Conversation view should remain active
    expect(screen.queryByPlaceholderText('Search documents...')).not.toBeInTheDocument();

    // Ctrl+Enter inside input should NOT trigger task approval
    act(() => {
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });

    expect(mockApi.orchestration.approveTask).not.toHaveBeenCalled();
  });

  it('5. Opens Keyboard Shortcuts Reference modal via ? and closes via Esc', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByTitle('Keyboard Shortcuts Reference (?)')).toBeInTheDocument();
    });

    // Press '?' to open modal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Keyboard Shortcuts Reference')).toBeInTheDocument();
      expect(screen.getByText(/Approve & dispatch selected task/i)).toBeInTheDocument();
      expect(screen.getByText(/Toggle ChatGPT Activity/i)).toBeInTheDocument();
    });

    // Press 'Escape' to close modal
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('6. Only approves tasks with status === awaiting_approval via Ctrl+Enter', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Requires Approval')).toBeInTheDocument();
    });

    // Press Ctrl+Enter
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });

    expect(mockApi.orchestration.approveTask).toHaveBeenCalledWith('task-awaiting-1');
  });

  it('7. Does NOT approve tasks that are already approved or running', async () => {
    // Configure mock with only a running task and no awaiting_approval task
    const runningOnlyTasks: Task[] = [
      {
        id: 'task-running-only',
        sessionId: 's-keyboard-1',
        title: 'Safe Running Task',
        description: 'Executing without approval needed',
        createdBy: 'user',
        assignedTo: 'antigravity',
        status: 'running',
        priority: 'medium',
        approvalStatus: 'approved',
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        acceptanceCriteria: [],
      },
    ];

    const customApi = createMockKnotApi(runningOnlyTasks);
    (window as any).knotApi = customApi;

    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Active Task')).toBeInTheDocument();
    });

    // Press Ctrl+Enter
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });

    // Strict safety invariant: approveTask MUST NOT be called!
    expect(customApi.orchestration.approveTask).not.toHaveBeenCalled();
  });

  it('8. Suppresses key-repeat events (e.repeat) from triggering duplicate operations', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Requires Approval')).toBeInTheDocument();
    });

    // Fire keydown with repeat: true
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, repeat: true, bubbles: true }));
    });

    expect(mockApi.orchestration.approveTask).not.toHaveBeenCalled();
  });

  it('9. Restores focus to the triggering element after closing modal overlay', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByTitle('Keyboard Shortcuts Reference (?)')).toBeInTheDocument();
    });

    const triggerBtn = screen.getByTitle('Keyboard Shortcuts Reference (?)');
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    // Click to open modal
    fireEvent.click(triggerBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Close via close button in modal
    const closeBtn = screen.getByTitle('Close (Esc)');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Focus restored to trigger button
    expect(document.activeElement).toBe(triggerBtn);
  });

  it('10. Preserves all mouse clicking interactions alongside keyboard navigation', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Conversation')).toBeInTheDocument();
    });

    // Click Context Vault button with mouse
    const vaultBtn = screen.getByTitle('Context Vault (Shortcut: 2)');
    fireEvent.click(vaultBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search documents...')).toBeInTheDocument();
    });

    // Click Timeline button with mouse
    const timelineBtn = screen.getByTitle('Unified Timeline (Shortcut: 3)');
    fireEvent.click(timelineBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search events, tools, commits...')).toBeInTheDocument();
    });

    // Click Approve button in Execution panel with mouse
    const approveBtn = screen.getByTitle('Approve & Dispatch Task (Ctrl+Enter)');
    await act(async () => {
      fireEvent.click(approveBtn);
    });

    expect(mockApi.orchestration.approveTask).toHaveBeenCalledWith('task-awaiting-1');
  });
});
